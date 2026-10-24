import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import {
  countCheckInsToday,
  countCheckOutsDue,
  countOverdueCheckOuts,
  listBookingsByStatuses} from "@/services/bookingsService";
import { listRooms } from "@/services/roomsService";
import { listPaymentsForBooking } from "@/services/paymentsService";
import {
  computeRefund,
  defaultRefundMethod,
  requestRefund} from "@/services/refundsService";
import { createNotification } from "./notificationService";
import { releaseAvailabilityMarkers } from "./booking/core";
import { deadlineFor, oneNightFor } from "@/lib/refund-policy";
import {
  buildAuditSummary,
  businessDateKey,
  classifyArrivals,
  isNoShowEligible,
  startOfBusinessDay} from "@/lib/night-audit";

/**
 * Night audit + no-show. The FO dashboard card calls loadNightAuditData() to
 * list arrivals and runNightAudit() to write the end-of-day snapshot (one
 * document per business date — the date key IS the dedupe key). markNoShow()
 * is the only booking-transition entry: transactional, retry-safe, and it
 * reuses the standard refund queue for the one-night charge.
 */

const NO_SHOW_REASON = "No-show — guest did not arrive after their arrival date passed.";

/** One night of the base rate, via the shared cancellation policy math. */
export function buildNoShowRefundPlan(booking, paid) {
  const { fee, refund, reason } = computeRefund({
    paid,
    rateType: booking?.rateType,
    // A no-show is always "late" — its arrival date already passed, which is
    // what made it eligible. Anchor the deadline in the past so computeRefund
    // takes the late branch even if the booking never stored a deadline.
    cancelTime: Date.now(),
    deadline: deadlineFor(booking) || new Date(0),
    oneNightRate: oneNightFor(booking)});
  return {
    amount: refund,
    fee,
    reason: `No-show: ${refund > 0
      ? "one night's rate is withheld. "
      : "no refund is due. "}${reason}`};
}

/**
 * The FO's raw night-audit view: arrivals split into buckets, room occupancy,
 * and the day's running figures. Same inputs feed both the card UI and the
 * snapshot document, so the summary can never disagree with the lists.
 */
export async function loadNightAuditData(now = new Date()) {
  const approved = await listBookingsByStatuses(["Approved"]);
  const { dueToday, eligible } = classifyArrivals(approved, now);
  const [checkInsToday, checkOutsDue, overdueCheckOuts, rooms] = await Promise.all([
    countCheckInsToday(),
    countCheckOutsDue(),
    countOverdueCheckOuts(),
    listRooms()]);
  const activeRooms = rooms.filter((room) => room?.isActive !== false);
  const occupiedRooms = activeRooms.filter((room) => room?.status === "Occupied").length;

  // Range-query today's business day on the field markNoShow actually writes
  // (noShowMarkedAt = server marker), then count documents that still hold a
  // noShow flag — the query bound does that job and the flag is the guard.
  const dayStart = startOfBusinessDay(now);
  const noShowSnap = await getDocs(
    query(collection(db, getCol("bookings")),
      where("noShowMarkedAt", ">=", Timestamp.fromDate(dayStart)),
      where("noShowMarkedAt", "<", Timestamp.fromDate(new Date(dayStart.getTime() + 86400000)))));
  const noShowsMarkedToday = noShowSnap.docs.filter((docu) => docu.data()?.noShow === true).length;

  return {
    dueToday,
    eligible,
    figures: {
      checkInsToday,
      checkOutsDue,
      overdueCheckOuts,
      arrivalsTodayNotCheckedIn: dueToday.length,
      noShowEligible: eligible.length,
      noShowsMarkedToday,
      occupiedRooms,
      totalRooms: activeRooms.length}};
}

/**
 * Mark an approved late arrival as a no-show.
 *
 * Transaction guards: booking must exist and still be Approved, and the
 * arrival date must have fully passed (same cutoff as the UI). A repeat call
 * is a NO-OP (no second cancel, no second room write, no second refund).
 * After the commit: release night markers, notify the guest, and queue the
 * one-night-fee refund through the standard refund queue (its own duplicate
 * guard rejects a second refund request).
 */
export async function markNoShow(bookingId, { markedBy = "", markedByUserId = "" } = {}) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to markNoShow");
  }

  const bCol = getCol("bookings");
  const bookingRef = doc(db, bCol, bookingId);

  const result = await runTransaction(db, async (transaction) => {
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) {
      throw new Error("Booking not found.");
    }
    const booking = bookingSnap.data();

    // Retry safety: already cancelled means nothing left to do. Callers get
    // the same {ok:true} shape so a retried click never errors.
    if (booking.status === "Cancelled") {
      return { changed: false, noShow: !!booking.noShow, booking };
    }
    if (booking.status !== "Approved") {
      throw new Error("Only Approved bookings can be marked as a no-show.");
    }
    if (!isNoShowEligible(booking, new Date())) {
      throw new Error(
        "Cut-off: a guest can only be marked as a no-show after their arrival date has passed.");
    }

    const update = {
      status: "Cancelled",
      noShow: true,
      noShowMarkedAt: serverTimestamp(),
      noShowMarkedBy: String(markedBy || "").slice(0, 100) || "Front Office",
      noShowMarkedByUserId: markedByUserId || null,
      rejectionReason: NO_SHOW_REASON,
      updatedAt: serverTimestamp()};

    if (booking.roomId) {
      // Read first: release only a room that exists and was still marked
      // Reserved for this stay by approveBooking (an Occupied/Available room
      // belongs to some other flow — never stomp it from the no-show tx).
      const roomRef = doc(db, getCol("rooms"), booking.roomId);
      const roomSnap = await transaction.get(roomRef);
      if (roomSnap.exists() && roomSnap.data().status === "Reserved") {
        transaction.update(roomRef, {
          status: "Available",
          updatedAt: serverTimestamp(),
          statusChangedAt: serverTimestamp()});
      }
    }
    transaction.update(bookingRef, update);
    return { changed: true, noShow: true, booking };
  });

  if (!result.changed) {
    return {
      ok: true,
      changed: false,
      noShow: result.noShow,
      refundRequested: 0};
  }

  // Free the availability markers so the nights can be re-sold.
  await releaseAvailabilityMarkers({ id: bookingId, ...result.booking });

  try {
    await createNotification(result.booking.guestId, {
      type: "booking_cancelled",
      title: "No-Show Recorded",
      message: `Your booking for ${result.booking.roomName || "the room"} was marked as a no-show because the guest did not arrive. Front Office applied the one-night fee per the hotel policy.`,
      link: `/my-bookings?bookingId=${bookingId}`});
  } catch (e) {
    console.error("[nightAudit] guest notification failed:", e);
  }

  // Queue the refund through the standard refund flow. requestRefund has its
  // own duplicate + amount guards, so the worst failure here is a skip.
  let refundRequested = 0;
  let refundSkipped = null;
  try {
    const payments = await listPaymentsForBooking(bookingId);
    const paid = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const plan = buildNoShowRefundPlan(result.booking, paid);
    if (plan.amount > 0) {
      const methods = [...new Set(payments.map((p) => p?.method).filter(Boolean))];
      const refund = await requestRefund({
        bookingId,
        amount: plan.amount,
        fee: plan.fee,
        method: defaultRefundMethod(methods),
        reason: plan.reason});
      refundRequested = plan.amount;
      result.refundId = refund?.id ?? null;
    }
  } catch (e) {
    refundSkipped = e?.message || "Refund request failed.";
    console.warn("[nightAudit] refund queue skipped:", refundSkipped);
  }

  return {
    ok: true,
    changed: true,
    refundRequested,
    ...(refundSkipped ? { refundSkipped } : {})};
}

/**
 * Write today's end-of-day snapshot. One document per business date
 * (night_audits/{YYYY-MM-DD}) — re-running refreshes the same document and
 * bumps runCount, so duplicates are structurally impossible.
 */
export async function runNightAudit(
  { runByName = "", runByUserId = "" } = {},
  now = new Date()) {
  const stats = await loadNightAuditData(now);
  const key = businessDateKey(now);
  const auditRef = doc(db, getCol("night_audits"), key);

  const existing = await getDoc(auditRef);
  const runCount =
    ((existing?.exists?.() && Number(existing.data()?.runCount)) || 0) + 1;

  const snapshot = {
    ...buildAuditSummary(now, stats.figures),
    runCount,
    runAt: serverTimestamp(),
    runByName: String(runByName || "").slice(0, 100) || "Front Office",
    runByUserId: runByUserId || null,
    updatedAt: serverTimestamp()};

  await setDoc(auditRef, snapshot);
  return { ok: true, auditDate: key, runCount, figures: snapshot };
}

/** Today's snapshot for the card's "last run" line, or null. */
export async function getLatestAudit(now = new Date()) {
  const snap = await getDoc(doc(db, getCol("night_audits"), businessDateKey(now)));
  return snap?.exists?.() ? snap.data() : null;
}
