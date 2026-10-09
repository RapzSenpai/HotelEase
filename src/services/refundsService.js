import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { listPaymentsForBooking } from "./paymentsService";
import { createNotification } from "./notificationService";

export function refundsCollection() {
  return getCol("refunds");
}

function toMillis(t) {
  if (t == null) return null;
  if (typeof t?.toMillis === "function") return t.toMillis();
  if (typeof t?.toDate === "function") {
    const d = t.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null;
  }
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t.getTime();
  if (typeof t === "number" && Number.isFinite(t)) return t;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Pure refund math. No promo/rate engine — rateType is a plain string.
 * Standard early (cancel <= deadline): fee 0, refund paid.
 * Standard late: fee oneNight, refund max(0, paid - oneNight).
 * NonRefundable: 0 unless overrideReason (manual path).
 * Unpaid: 0. Refund always clamped 0..paid.
 *
 * `reason` is the plain-language "why" the FO sees next to the numbers — the
 * amounts alone (paid − fee) are not self-explanatory in the cancellation queue.
 */
export function computeRefund({ paid, rateType = "Standard", cancelTime, deadline, oneNightRate, overrideReason } = {}) {
  const p = Number(paid ?? 0);
  if (!Number.isFinite(p) || p <= 0) {
    return { fee: 0, refund: 0, reason: "No recorded payment — nothing to refund." };
  }
  const type = rateType === "NonRefundable" ? "NonRefundable" : "Standard";
  if (type === "NonRefundable" && !String(overrideReason ?? "").trim()) {
    return {
      fee: p,
      refund: 0,
      reason: "Non-refundable rate — no refund unless the front office overrides it."};
  }
  // Override path: FO sets a manual amount <= paid in requestRefund; the
  // suggestion below falls back to Standard timing and says so.
  const prefix = type === "NonRefundable" ? "Override on a non-refundable rate — " : "";
  const cancelMs = toMillis(cancelTime) ?? Date.now();
  const deadlineMs = toMillis(deadline);
  const oneNight = Number(oneNightRate ?? 0);
  const nightFee = Number.isFinite(oneNight) && oneNight > 0 ? oneNight : 0;
  const early = deadlineMs == null || cancelMs <= deadlineMs;
  if (early) {
    return { fee: 0, refund: p, reason: `${prefix}Cancelled before the free-cancellation deadline — full refund.` };
  }
  const fee = Math.min(p, nightFee);
  const refund = Math.max(0, Math.min(p, p - nightFee));
  const reason = refund <= 0
    ? `${prefix}Cancelled after the free-cancellation deadline — the one-night fee covers the whole payment.`
    : `${prefix}Cancelled after the free-cancellation deadline — one night's rate is withheld.`;
  return { fee, refund, reason };
}

export async function getRefund(refundId) {
  if (!refundId || typeof refundId !== "string") return null;
  const snap = await getDoc(doc(db, refundsCollection(), refundId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getRefundsForBooking(bookingId) {
  if (!bookingId || typeof bookingId !== "string") return [];
  const snap = await getDocs(
    query(collection(db, refundsCollection()), where("bookingId", "==", bookingId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listRefunds({ status = null } = {}) {
  const col = refundsCollection();
  const q = status
    ? query(collection(db, col), where("status", "==", status), orderBy("createdAt", "desc"))
    : query(collection(db, col), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToRefunds(callback, { status = null, pageSize = 50 } = {}) {
  const col = refundsCollection();
  const q = status
    ? query(collection(db, col), where("status", "==", status), orderBy("createdAt", "desc"), limit(pageSize))
    : query(collection(db, col), orderBy("createdAt", "desc"), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error("[refundsService] subscribeToRefunds error:", error);
      callback([]);
    });
}

async function sumPaid(bookingId) {
  const recs = await listPaymentsForBooking(bookingId);
  return recs.reduce((s, p) => s + Number(p.amount ?? 0), 0);
}

/**
 * Refund channels. Refunds are manual (the FO transfers/hands over the money),
 * so the system only records which channel was used — forcing GCash on an
 * over-the-counter guest was never a real workflow.
 */
export const REFUND_METHODS = [
  "GCash",
  "Bank Transfer",
  "Over-the-Counter (Cash)",
  "Other",
];

// Channels whose transfer leaves a reference number to log. Cash/Other are
// handed over in person: the record is an OR number / "received by" note.
const REFERENCE_REQUIRED_METHODS = new Set(["GCash", "Bank Transfer"]);

export function normalizeRefundMethod(method) {
  const m = String(method ?? "").trim();
  return REFUND_METHODS.includes(m) ? m : null;
}

export function assertRefundMethod(method) {
  const m = normalizeRefundMethod(method);
  if (!m) throw new Error(`Refund method must be one of: ${REFUND_METHODS.join(", ")}.`);
  return m;
}

export function refundMethodNeedsReference(method) {
  return REFERENCE_REQUIRED_METHODS.has(normalizeRefundMethod(method));
}

/** Guest-facing phrasing for the active channel. */
export function refundMethodCopy(method) {
  switch (normalizeRefundMethod(method)) {
    case "GCash":
      return "via GCash";
    case "Bank Transfer":
      return "by bank transfer";
    case "Over-the-Counter (Cash)":
      return "in cash at the front desk";
    default:
      return "through the agreed refund channel";
  }
}

/**
 * Suggest the refund channel from how the guest actually paid, so an OTC
 * booking is never silently queued as a GCash refund.
 */
export function defaultRefundMethod(paymentMethods = []) {
  const methods = new Set((paymentMethods || []).map((m) => String(m ?? "").trim()));
  if (methods.has("GCash")) return "GCash";
  if (methods.has("Bank Transfer")) return "Bank Transfer";
  if (methods.has("Over-the-Counter") || methods.has("Credit/Debit Card")) {
    return "Over-the-Counter (Cash)";
  }
  return "GCash";
}

/**
 * Reference/note check for marking a refund paid. A reference is required
 * where the channel produces one; cash/Other refunds stay auditable through a
 * short note instead ("OR #1234, received by …") — never a fabricated ref.
 */
export function validateRefundReference({ method, referenceNumber = "", note = "" } = {}) {
  const m = normalizeRefundMethod(method);
  if (!m) return { ok: false, error: `Refund method must be one of: ${REFUND_METHODS.join(", ")}.` };
  const ref = String(referenceNumber ?? "").trim();
  const cleanNote = String(note ?? "").trim();
  if (refundMethodNeedsReference(m) && !ref) {
    return { ok: false, error: `${m} refunds need a reference number to be marked paid.` };
  }
  if (!refundMethodNeedsReference(m) && !ref && !cleanNote) {
    return {
      ok: false,
      error: `Add a reference or a note (OR no. / who received the cash) so this ${m} refund stays auditable.`};
  }
  return { ok: true, method: m, referenceNumber: ref || null, note: cleanNote || null };
}

export function canMarkRefundPaid({ isActing = false, method, referenceNumber = "", note = "" } = {}) {
  return !isActing && validateRefundReference({ method, referenceNumber, note }).ok;
}

export function isRefundRequestBlocked(status) {
  const value = String(status ?? "").trim();
  return ["Pending", "Approved", "Paid"].includes(value);
}

// Guest bell write — shared by all four refund transitions. Returns a result
// instead of swallowing failures so the FO sees whether the guest was told.
// Money writes already committed before this runs; this never throws.
async function notifyGuest(guestId, payload, { context = "" } = {}) {
  if (!guestId) {
    console.error(`[refundsService] notification skipped (${context}): booking has no guestId.`);
    return { notified: false, reason: "missing-guest" };
  }
  try {
    await createNotification(guestId, payload);
    return { notified: true };
  } catch (e) {
    console.error(`[refundsService] notification failed (${context}):`, e);
    return { notified: false, reason: "write-failed" };
  }
}

/**
 * Step 1: create a Pending refund. No money moves. Enforces refund <= paid.
 */
export async function requestRefund({ bookingId, amount, fee = 0, method = "GCash", reason = "" } = {}) {
  if (!bookingId || typeof bookingId !== "string") throw new Error("Invalid bookingId.");
  const m = assertRefundMethod(method);
  const amt = Number(amount ?? 0);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Refund amount must be positive.");
  const paid = await sumPaid(bookingId);
  const refunds = await getRefundsForBooking(bookingId);
  const alreadyRefunded = refunds
    .filter((refund) => refund.status === "Paid")
    .reduce((sum, refund) => sum + Number(refund.amount ?? 0), 0);
  const refundable = Math.max(0, paid - alreadyRefunded);
  if (amt > refundable + 0.01) {
    throw new Error(`Refund ₱${amt.toLocaleString()} exceeds refundable balance ₱${refundable.toLocaleString()}.`);
  }
  const rCol = refundsCollection();
  const bCol = getCol("bookings");
  const refundRef = doc(collection(db, rCol));
  const notify = await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");
    const booking = bookingSnap.data();
    if (isRefundRequestBlocked(booking?.refundStatus)) {
      throw new Error("Refund request already exists for this booking.");
    }
    transaction.set(refundRef, {
      bookingId,
      amount: amt,
      fee: Number(fee ?? 0),
      method: m,
      reason: String(reason ?? ""),
      status: "Pending",
      referenceNumber: null,
      referenceNote: null,
      createdAt: serverTimestamp(),
      processedAt: null,
      processedBy: null,
      updatedAt: serverTimestamp()});
    transaction.update(bookingRef, {
      refundStatus: "Pending",
      refundAmount: amt,
      refundMethod: m,
      refundReason: String(reason ?? ""),
      updatedAt: serverTimestamp()});
    return {
      guestId: booking?.guestId || null,
      amount: amt};
  });
  // Guest bell — mirrors approve/paid notifs so the card's Pending line
  // also reaches notifications. Runs after the money write; failures are
  // reported (not swallowed) via the return value.
  const { guestId, amount: notifyAmt } = notify || {};
  const notif = await notifyGuest(guestId, {
    type: "refund_requested",
    title: "Refund Requested",
    message: `Your refund of ₱${Number(notifyAmt ?? 0).toLocaleString()} has been requested and is waiting for Front Office approval. It will be sent ${refundMethodCopy(m)}.`,
    link: `/my-bookings?bookingId=${bookingId}`}, { context: `requestRefund booking ${bookingId}` });
  return { id: refundRef.id, ok: true, ...notif };
}

/**
 * Step 2a: approve a Pending refund. Still no money moves.
 */
export async function approveRefund(refundId, { processedBy = null } = {}) {
  if (!refundId || typeof refundId !== "string") throw new Error("Invalid refundId.");
  const rCol = refundsCollection();
  const bCol = getCol("bookings");
  const notify = await runTransaction(db, async (transaction) => {
    // Firestore requires every read before every write — both gets first.
    const refundRef = doc(db, rCol, refundId);
    const refundSnap = await transaction.get(refundRef);
    if (!refundSnap.exists()) throw new Error("Refund not found.");
    const refund = refundSnap.data();
    if (refund.status !== "Pending") throw new Error("Only Pending refunds can be approved.");
    assertRefundMethod(refund.method);
    const bookingRef = doc(db, bCol, refund.bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    transaction.update(refundRef, {
      status: "Approved",
      processedBy: processedBy ?? null,
      updatedAt: serverTimestamp()});
    if (bookingSnap.exists()) {
      transaction.update(bookingRef, {
        refundStatus: "Approved",
        refundProcessedBy: processedBy ?? null,
        updatedAt: serverTimestamp()});
    }
    return {
      guestId: bookingSnap.exists() ? bookingSnap.data()?.guestId || null : null,
      amount: Number(refund.amount ?? 0),
      method: refund.method || null,
      bookingId: refund.bookingId || null};
  });
  // Guest bell after the money write; failures reported, never thrown.
  const { guestId, amount, method, bookingId } = notify || {};
  const notif = await notifyGuest(guestId, {
    type: "refund_approved",
    title: "Refund Approved",
    message: `Your refund of ₱${amount.toLocaleString()} has been approved and will be sent ${refundMethodCopy(method)} shortly.`,
    link: bookingId ? `/my-bookings?bookingId=${bookingId}` : "/my-bookings"}, { context: `approveRefund ${refundId}` });
  return { ok: true, ...notif };
}

/**
 * Step 2b: mark an Approved refund Paid. Manual transfer — the method decides
 * whether a transfer reference is required (GCash/Bank) or a note is enough
 * (cash/Other, handed over at the desk).
 * Pre-tx paid guard: refund <= paid is validated BEFORE the tx commits,
 * so an overpay race never leaves a Paid write behind (no query inside tx).
 */
export async function markRefundPaid(refundId, { referenceNumber = "", note = "", processedBy = null } = {}) {
  if (!refundId || typeof refundId !== "string") throw new Error("Invalid refundId.");
  const rCol = refundsCollection();
  const bCol = getCol("bookings");
  const preSnap = await getDoc(doc(db, rCol, refundId));
  if (!preSnap.exists()) throw new Error("Refund not found.");
  const pre = preSnap.data();
  if (pre.status !== "Approved") throw new Error("Only Approved refunds can be marked paid.");
  const check = validateRefundReference({ method: pre.method, referenceNumber, note });
  if (!check.ok) throw new Error(check.error);
  const ref = check.referenceNumber;
  if (!pre.bookingId) throw new Error("Refund missing booking.");
  const prePaid = await sumPaid(pre.bookingId);
  if (Number(pre.amount ?? 0) > prePaid + 0.01) throw new Error("Refund exceeds paid amount.");
  const notify = await runTransaction(db, async (transaction) => {
    const refundRef = doc(db, rCol, refundId);
    const refundSnap = await transaction.get(refundRef);
    if (!refundSnap.exists()) throw new Error("Refund not found.");
    const refund = refundSnap.data();
    if (refund.status !== "Approved") throw new Error("Only Approved refunds can be marked paid.");
    assertRefundMethod(refund.method);
    if (Number(refund.amount ?? 0) > prePaid + 0.01) throw new Error("Refund exceeds paid amount.");
    // Reads before writes (see approveRefund) — booking get precedes updates.
    const bookingRef = doc(db, bCol, refund.bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    transaction.update(refundRef, {
      status: "Paid",
      referenceNumber: ref,
      referenceNote: check.note,
      processedAt: serverTimestamp(),
      processedBy: processedBy ?? null,
      updatedAt: serverTimestamp()});
    if (bookingSnap.exists()) {
      transaction.update(bookingRef, {
        refundStatus: "Paid",
        refundProcessedAt: serverTimestamp(),
        refundProcessedBy: processedBy ?? null,
        updatedAt: serverTimestamp()});
    }
    return {
      guestId: bookingSnap.exists() ? bookingSnap.data()?.guestId || null : null,
      amount: Number(refund.amount ?? 0),
      method: refund.method || null,
      bookingId: refund.bookingId || null};
  });
  const { guestId, amount, method, bookingId } = notify || {};
  const notif = await notifyGuest(guestId, {
    type: "refund_paid",
    title: "Refund Sent",
    message: `Your refund of ₱${amount.toLocaleString()} has been sent ${refundMethodCopy(method)}.${ref ? ` Ref: ${ref}` : ""}`,
    link: bookingId ? `/my-bookings?bookingId=${bookingId}` : "/my-bookings"}, { context: `markRefundPaid ${refundId}` });
  return { ok: true, ...notif };
}

export async function rejectRefund(refundId, reason, { processedBy = null } = {}) {
  if (!refundId || typeof refundId !== "string") throw new Error("Invalid refundId.");
  const r = String(reason ?? "").trim();
  if (!r) throw new Error("Rejection reason is required.");
  const rCol = refundsCollection();
  const bCol = getCol("bookings");
  const notify = await runTransaction(db, async (transaction) => {
    const refundRef = doc(db, rCol, refundId);
    const refundSnap = await transaction.get(refundRef);
    if (!refundSnap.exists()) throw new Error("Refund not found.");
    const refund = refundSnap.data();
    if (!["Pending", "Approved"].includes(refund.status)) throw new Error("Only Pending/Approved refunds can be rejected.");
    // Reads before writes (see approveRefund) — booking get precedes updates.
    const bookingRef = doc(db, bCol, refund.bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    transaction.update(refundRef, {
      status: "Rejected",
      rejectReason: r,
      processedBy: processedBy ?? null,
      updatedAt: serverTimestamp()});
    if (bookingSnap.exists()) {
      transaction.update(bookingRef, {
        refundStatus: "Rejected",
        refundProcessedBy: processedBy ?? null,
        updatedAt: serverTimestamp()});
    }
    return {
      guestId: bookingSnap.exists() ? bookingSnap.data()?.guestId || null : null,
      amount: Number(refund.amount ?? 0),
      bookingId: refund.bookingId || null};
  });
  const { guestId, amount, bookingId } = notify || {};
  const notif = await notifyGuest(guestId, {
    type: "refund_rejected",
    title: "Refund Update",
    message: `Your refund request of ₱${amount.toLocaleString()} wasn't approved. Reason: ${r}`,
    link: bookingId ? `/my-bookings?bookingId=${bookingId}` : "/my-bookings"}, { context: `rejectRefund ${refundId}` });
  return { ok: true, ...notif };
}
