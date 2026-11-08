import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getAuth } from "firebase/auth";
// Shared with availabilityService — see lib/time-utils.js for the local-midnight rule.
import { toLocalDate as toDate } from "@/lib/time-utils";
import { hasRecordedPayment } from "@/lib/booking-holds";
import { getCol } from "@/lib/db-utils";
import { isRoomActive } from "../roomsService";
import { claimBookingMarkedInTx, dateKey, MARKER_CONFLICT_MESSAGE, markersCollection, nightKeys, readBookingMarkedInTx, setBookingMarked } from "../availabilityService";
import { createNotification } from "../notificationService";
import { sendBookingConfirmation } from "../emailService";
import { recordPayment } from "../paymentsService";
import { calculatePartialPayment, PROOF_REQUIRED_METHODS } from "@/lib/paymentDetails";
import {
  bookingsCollection,
  calcNights,
  releaseAvailabilityMarkers} from "./core";
import { getAvailableRoomIds } from "./queries";

/**
 * Front-office lifecycle transitions on a booking: approve, check in, check out,
 * extend the stay, adjust the nightly rate, add an overstay fee, and the sweep
 * that expires unpaid holds. Moved from bookingsService without changes.
 */

const ROOM_STATUS = {
  RESERVED: "Reserved",
  OCCUPIED: "Occupied",
  DIRTY: "Dirty / Needs Cleaning"};

export async function approveBooking(bookingId) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to approveBooking");
  }

  const bCol = bookingsCollection();

  // Conflict re-check must run OUTSIDE the transaction (queries aren't allowed inside).
  // Block approval if another booking for the same room/dates is already Approved or later.
  const preRef = doc(db, bCol, bookingId);
  const preSnap = await getDoc(preRef);
  if (!preSnap.exists()) throw new Error("Booking not found.");
  const preBooking = preSnap.data();
  if (preBooking.status !== "Pending") {
    throw new Error("Booking must be Pending to approve.");
  }

  const checkIn = toDate(preBooking.checkInDate);
  const checkOut = toDate(preBooking.checkOutDate);
  if (preBooking.roomId && checkIn && checkOut) {
    const conflictsQuery = query(
      collection(db, bCol),
      where("roomId", "==", preBooking.roomId),
      where("status", "in", ["Approved", "Checked In"]));
    const conflictsSnap = await getDocs(conflictsQuery);
    const hasConflict = conflictsSnap.docs.some((conflictDoc) => {
      if (conflictDoc.id === bookingId) return false;
      const b = conflictDoc.data();
      const bIn = toDate(b.checkInDate);
      const bOut = toDate(b.checkOutDate);
      return bIn && bOut && checkIn < bOut && checkOut > bIn;
    });
    if (hasConflict) {
      throw new Error(
        "Cannot approve — another booking for this room already covers these dates.");
    }
  }

  return runTransaction(db, async (transaction) => {
    const rCol = getCol("rooms");

    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const booking = bookingSnap.data();
    if (booking.status !== "Pending") {
      throw new Error("Booking must be Pending to approve.");
    }

    // Phase 17.3: Only require payment proof for GCash and Bank Transfer methods.
    // Gateway payments (simulated, Xendit test) carry a gatewayRef instead of a
    // proof image.
    const requiresProof = PROOF_REQUIRED_METHODS.includes(booking.paymentMethod);
    if (requiresProof && !booking.paymentProofUrl && !["simulated", "xendit"].includes(booking.paymentGateway)) {
      throw new Error("Cannot approve — no payment proof submitted.");
    }

    const roomId = booking.roomId;
    if (!roomId || typeof roomId !== "string")
      throw new Error("Booking has invalid roomId.");

    const roomRef = doc(db, rCol, roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found.");
    const roomData = roomSnap.data();
    if (!isRoomActive(roomData)) {
      throw new Error("This room has been archived and can no longer accept bookings.");
    }

    // In-transaction overlap guard: two overlapping bookings approved at once
    // serialize here, and the loser sees the winner's live markers and aborts.
    // (The pre-transaction query above is only a fast-path for the common case —
    // queries can't run inside transactions.)
    const markerCheck = await readBookingMarkedInTx(transaction, {
      roomId,
      bookingId,
      checkIn: booking.checkInDate,
      checkOut: booking.checkOutDate});
    if (!markerCheck.complete || markerCheck.live.length > 0) {
      if (markerCheck.live.length > 0) {
        throw new Error(
          "Cannot approve — another booking for this room already covers these dates.");
      }

      // If markers are missing/incomplete, safely attempt in-transaction recovery claim.
      // claimBookingMarkedInTx checks each night marker and throws MARKER_CONFLICT_MESSAGE
      // if any night is already held by another booking with a live status.
      try {
        await claimBookingMarkedInTx(transaction, {
          roomId,
          bookingId,
          checkIn: booking.checkInDate,
          checkOut: booking.checkOutDate,
          status: "Pending"});
      } catch (err) {
        if (err?.message === MARKER_CONFLICT_MESSAGE) {
          throw new Error(
            "Cannot approve — another booking for this room already covers these dates.");
        }
        throw new Error("Cannot approve — booking availability markers are incomplete.");
      }
    }

    transaction.update(bookingRef, {
      status: "Approved",
      proofVerifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp()});

    transaction.update(roomRef, {
      status: ROOM_STATUS.RESERVED,
      updatedAt: serverTimestamp()});

    return { ok: true, roomName: roomSnap.data().name || roomSnap.data().type || "Room", guestId: booking.guestId, booking };
  }).then(async (result) => {
    // Refresh availability marker status after approval.
    try {
      await setBookingMarked({
        roomId: result.booking.roomId,
        bookingId,
        checkIn: result.booking.checkInDate,
        checkOut: result.booking.checkOutDate,
        status: "Approved"});
    } catch (e) {
      console.warn("Availability marker refresh failed:", e);
    }

    // Only auto-record payment for proof-required methods that actually uploaded proof
    // or completed a gateway checkout (simulated, or Xendit test mode).
    // OTC/Card: deposit stays 0 until FO manually records payment at the desk.
    const requiresProof = PROOF_REQUIRED_METHODS.includes(result.booking.paymentMethod);
    const isGateway = ["simulated", "xendit"].includes(result.booking.paymentGateway);
    if ((requiresProof && result.booking.paymentProofUrl) || isGateway) {
      try {
        const paymentType = result.booking.paymentType || "Full";
        const paymentMethod = result.booking.paymentMethod || "GCash";
        const totalCost = Number(result.booking.totalCost ?? 0);
        const isSimulated = result.booking.paymentGateway === "simulated";
        const isXendit = result.booking.paymentGateway === "xendit";
        // Xendit confirmed the exact invoiced amount server-side; the stored
        // value outranks a re-computation from the current totalCost.
        const xenditPaid = Number(result.booking.xenditPaidAmount);
        const paymentAmount = isXendit && Number.isFinite(xenditPaid) && xenditPaid > 0
          ? xenditPaid
          : paymentType === "Partial"
            ? calculatePartialPayment(totalCost)
            : totalCost;

        await recordPayment({
          bookingId,
          amount: paymentAmount,
          method: paymentMethod,
          note: isXendit
            ? `Initial payment via Xendit test invoice (${result.booking.gatewayRef || "no ref"})`
            : isSimulated
              ? `Initial payment via simulated gateway (${result.booking.gatewayRef || "no ref"})`
              : "Initial payment via proof upload",
          source: isXendit ? "xendit_test" : isSimulated ? "simulated_gateway" : "guest_proof",
          processedBy: "system",
          idempotencyKey: `${bookingId}-initial`});
      } catch (e) {
        console.error("Payment recording error:", e);
        // Don't block approval if payment recording fails - log and continue
      }
    }

    try {
      await createNotification(result.guestId, {
        type: "booking_approved",
        title: "Booking Approved! 🎉",
        message: `Your booking for ${result.roomName} has been approved.`,
        link: "/my-bookings"
      });
    } catch (e) { console.error("Notif error", e); }

    // Send booking confirmation email (fire-and-forget)
    try {
      const guestDoc = await getDoc(doc(db, getCol("users"), result.guestId));
      if (guestDoc.exists()) {
        const guestData = guestDoc.data();
        const toEmail = guestData.email;
        const toName = guestData.fullName || guestData.email?.split('@')[0] || "Guest";

        // Format dates for email
        const checkInDate = result.booking.checkInDate?.toDate ? result.booking.checkInDate.toDate() : new Date();
        const checkOutDate = result.booking.checkOutDate?.toDate ? result.booking.checkOutDate.toDate() : new Date();
        const checkInStr = checkInDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const checkOutStr = checkOutDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const paymentType = result.booking.paymentType || "Full";

        sendBookingConfirmation({
          toEmail,
          toName,
          roomName: result.roomName,
          checkIn: checkInStr,
          checkOut: checkOutStr,
          bookingId: bookingId,
          paymentType});
      }
    } catch (e) {
      console.error("Email service error:", e);
    }

    return result;
  });
}

export async function checkInBooking(bookingId) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to checkInBooking");
  }

  return runTransaction(db, async (transaction) => {
    const bCol = bookingsCollection();
    const rCol = getCol("rooms");

    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const booking = bookingSnap.data();
    if (booking.status !== "Approved") {
      throw new Error("Booking must be Approved to check in.");
    }

    const roomId = booking.roomId;
    if (!roomId || typeof roomId !== "string")
      throw new Error("Booking has invalid roomId.");

    const roomRef = doc(db, rCol, roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found.");

    transaction.update(bookingRef, {
      status: "Checked In",
      updatedAt: serverTimestamp()});

    transaction.update(roomRef, {
      status: ROOM_STATUS.OCCUPIED,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp()});

    return { ok: true, booking };
  }).then(async (result) => {
    // Refresh availability marker status after check-in so the guest
    // calendar shows "Checked In" instead of the stale "Approved".
    try {
      await setBookingMarked({
        roomId: result.booking.roomId,
        bookingId,
        checkIn: result.booking.checkInDate,
        checkOut: result.booking.checkOutDate,
        status: "Checked In"});
    } catch (e) {
      console.warn("Availability marker refresh failed:", e);
    }
    return { ok: true };
  });
}

export async function checkOutBooking(bookingId) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to checkOutBooking");
  }

  return runTransaction(db, async (transaction) => {
    const bCol = bookingsCollection();
    const rCol = getCol("rooms");

    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const booking = bookingSnap.data();
    if (booking.status !== "Checked In") {
      throw new Error("Booking must be Checked In to check out.");
    }

    const roomId = booking.roomId;
    if (!roomId || typeof roomId !== "string")
      throw new Error("Booking has invalid roomId.");

    const roomRef = doc(db, rCol, roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found.");

    const roomData = roomSnap.data() || {};
    // An open mid-stay request belongs to the checking-out guest — clear it so
    // the room lands in Turnover, not Mid-Stay. (Stale-flag cleanup otherwise
    // only runs on the *next* request; see requestMidStayHousekeeping.)
    const wasMidStay = !!roomData.isMidStayRequest;

    transaction.update(bookingRef, {
      status: "Checked Out",
      updatedAt: serverTimestamp()});

    const roomUpdate = {
      status: ROOM_STATUS.DIRTY,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp()};
    if (wasMidStay) {
      roomUpdate.isMidStayRequest = deleteField();
      roomUpdate.midStayNote = deleteField();
      roomUpdate.midStayGuestId = deleteField();
      roomUpdate.midStayGuestName = deleteField();
      roomUpdate.midStayBookingId = deleteField();
      roomUpdate.midStayRequestedAt = deleteField();
      roomUpdate.midStayRequestId = deleteField();
    }
    transaction.update(roomRef, roomUpdate);

    if (wasMidStay) {
      const logRef = doc(collection(db, getCol("housekeeping_logs")));
      transaction.set(logRef, {
        roomId,
        bookingId: roomData.midStayBookingId || bookingId,
        requestId: roomData.midStayRequestId || null,
        fromStatus: roomData.status || "Unknown",
        toStatus: ROOM_STATUS.DIRTY,
        changedByRole: "fo",
        changedByUserId: null,
        changedByName: "",
        isMidStayRequest: true,
        note: "[Mid-Stay superseded by checkout — converted to turnover]",
        photoUrls: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()});
    }

    return { booking: { id: bookingId, ...booking }, ok: true };
  }).then(async (result) => {
    // Free availability markers on check-out so the nights can be re-booked.
    await releaseAvailabilityMarkers(result.booking);
    return { ok: true };
  });
}

/**
 * Front Office action: Extend an active Checked-In booking to a new check-out date.
 * Validates conflicts on the extended nights and writes availability markers.
 */
export async function extendStayBooking(bookingId, { newCheckOutDate, additionalCost = 0, expectedCheckOutDate = null } = {}) {
  if (!bookingId || !newCheckOutDate) throw new Error("Booking ID and new check-out date are required.");

  const newOut = toDate(newCheckOutDate);
  if (!newOut) throw new Error("Invalid new check-out date.");

  const bCol = bookingsCollection();
  const bookingRef = doc(db, bCol, bookingId);
  const bookingSnap = await getDoc(bookingRef);
  if (!bookingSnap.exists()) throw new Error("Booking not found.");

  const booking = bookingSnap.data();
  if (booking.status !== "Checked In") {
    throw new Error("Only Checked-In bookings can have their stay extended.");
  }

  const currentOut = toDate(booking.checkOutDate);
  const checkIn = toDate(booking.checkInDate);

  if (newOut <= currentOut) {
    throw new Error("New check-out date must be later than the current check-out date.");
  }

  // Fast-path conflict check for the extended nights [currentOut, newOut].
  // Local date keys (not UTC): toISOString can shift the day for +UTC zones.
  // The transaction below re-checks the markers — this is only UX fast-fail.
  const curOutStr = dateKey(currentOut);
  const newOutStr = dateKey(newOut);
  const blockedRoomIds = await getAvailableRoomIds(curOutStr, newOutStr);
  if (blockedRoomIds.has(booking.roomId)) {
    throw new Error("Cannot extend stay: The room is reserved by another booking for the extended dates.");
  }

  const cost = Number(additionalCost ?? 0);

  // Transaction: concurrent extends serialize; the loser either sees live
  // markers from another booking on the new nights, or a changed check-out
  // (a fellow extend committed first) and aborts. Money moves via
  // increment() so a racing overstay fee adds up instead of being lost.
  await runTransaction(db, async (transaction) => {
    const currentBookingSnap = await transaction.get(bookingRef);
    if (!currentBookingSnap.exists() || currentBookingSnap.data().status !== "Checked In") {
      throw new Error("Booking changed before stay extension could be completed.");
    }
    const live = currentBookingSnap.data();
    if (expectedCheckOutDate && dateKey(live.checkOutDate) !== dateKey(expectedCheckOutDate)) {
      throw new Error("This stay changed since you opened the dialog — close and reopen it to re-price.");
    }
    // Claim the new nights in-transaction: a racing extend (or booking)
    // conflicts on the marker docs, retries, and aborts on the winner's
    // live markers instead of double-holding the nights.
    try {
      await claimBookingMarkedInTx(transaction, {
        roomId: live.roomId,
        bookingId,
        checkIn: toDate(live.checkOutDate),
        checkOut: newOut,
        status: "Checked In"});
    } catch (e) {
      if (e?.message === MARKER_CONFLICT_MESSAGE) {
        throw new Error("Cannot extend stay: The room is reserved by another booking for the extended dates.");
      }
      throw e;
    }
    const liveOut = toDate(live.checkOutDate);
    const liveIn = toDate(live.checkInDate);
    transaction.update(bookingRef, {
      checkOutDate: Timestamp.fromDate(newOut),
      nights: calcNights(liveIn, newOut),
      totalCost: increment(cost),
      subtotal: increment(cost),
      baseTotal: increment(cost),
      isExtended: true,
      extendedNights: (live.extendedNights || 0) + calcNights(liveOut, newOut),
      updatedAt: serverTimestamp()});
  });

  const newTotalNights = calcNights(checkIn, newOut);
  const updatedTotalCost = Number(booking.totalCost ?? 0) + cost;

  // Notify guest
  if (booking.guestId) {
    try {
      await createNotification(booking.guestId, {
        type: "stay_extended",
        title: "Stay Extended",
        message: `Your stay in ${booking.roomName || "your room"} has been extended until ${newOut.toLocaleDateString()}.`,
        link: "/my-bookings"});
    } catch (e) {
      console.error("Notif error", e);
    }
  }

  return { ok: true, newCheckOutDate: newOut, totalNights: newTotalNights, totalCost: updatedTotalCost };
}

/**
 * Front Office action: move (upgrade or downgrade) a Checked-In guest to a
 * different room. One transaction frees the old room's night markers, claims
 * the new room's, flips room statuses (old -> turnover, new -> occupied) and
 * appends the move to the booking's roomMoves audit trail. Pricing is
 * informational only — rateDelta is a note; money changes go through
 * adjustBookingRate / addFolioCharge, so no re-payment happens here.
 */
export async function moveBookingRoom(bookingId, { newRoomId, reason } = {}) {
  if (!bookingId || typeof newRoomId !== "string" || !newRoomId) {
    throw new Error("Move requires a booking and a new room.");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("A reason is required to move a guest to another room.");
  }
  const user = getAuth().currentUser;
  if (!user) throw new Error("Please sign in before moving a booking to another room.");

  const bCol = bookingsCollection();
  const rCol = getCol("rooms");
  const bookingRef = doc(db, bCol, bookingId);
  const newRoomRef = doc(db, rCol, newRoomId);

  // Pre-reads are UX fast-fails; the transaction below re-checks everything.
  const preSnap = await getDoc(bookingRef);
  if (!preSnap.exists()) throw new Error("Booking not found.");
  const preBooking = preSnap.data();
  if (preBooking.status !== "Checked In") {
    throw new Error("Only Checked-In bookings can move rooms.");
  }
  if (preBooking.roomId === newRoomId) {
    throw new Error("The guest is already booked into that room.");
  }

  const preRoomSnap = await getDoc(newRoomRef);
  if (!preRoomSnap.exists()) throw new Error("Target room not found.");
  if (preRoomSnap.data().status !== "Available") {
    throw new Error("The target room is not available for a move right now.");
  }

  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(bookingRef);
    if (!snap.exists()) throw new Error("Booking not found.");
    const live = snap.data();
    if (live.status !== "Checked In") {
      throw new Error("This booking changed since you opened the dialog — close and reopen it to move the room.");
    }
    if (live.roomId === newRoomId) {
      throw new Error("The guest is already booked into that room.");
    }

    const newRoomSnap = await transaction.get(newRoomRef);
    if (!newRoomSnap.exists() || newRoomSnap.data().status !== "Available") {
      throw new Error("The target room is not available for a move right now.");
    }
    const newRoom = newRoomSnap.data();

    const oldRoomId = live.roomId;
    const oldRoomRef = doc(db, rCol, oldRoomId);
    const oldRoomSnap = await transaction.get(oldRoomRef);
    if (!oldRoomSnap.exists()) throw new Error("Current room not found.");
    const oldRoom = oldRoomSnap.data();
    const wasMidStay = !!oldRoom.isMidStayRequest;

    // Free the old room's nights in-transaction — clearBookingMarked spins up
    // its own transaction, so the release is manual here. Only markers this
    // booking holds are deleted; a stale marker for someone else stays.
    // Reads all complete before any write: claim reads the new room's markers,
    // so old-marker deletes must wait until the claim has finished reading.
    const dates = nightKeys(live.checkInDate, live.checkOutDate);
    if (dates.length === 0) throw new Error("Booking has invalid stay dates.");
    const ownedOldMarkerRefs = [];
    for (const date of dates) {
      const markerRef = doc(db, markersCollection(), `${oldRoomId}_${date}`);
      const markerSnap = await transaction.get(markerRef);
      if (markerSnap.exists() && markerSnap.data().bookingId === bookingId) {
        ownedOldMarkerRefs.push(markerRef);
      }
    }

    try {
      await claimBookingMarkedInTx(transaction, {
        roomId: newRoomId,
        bookingId,
        checkIn: toDate(live.checkInDate),
        checkOut: toDate(live.checkOutDate),
        status: "Checked In"});
    } catch (e) {
      if (e?.message === MARKER_CONFLICT_MESSAGE) {
        throw new Error("Cannot move rooms: the room is reserved by another booking for some of these nights.");
      }
      throw e;
    }
    ownedOldMarkerRefs.forEach((markerRef) => transaction.delete(markerRef));

    const rateDelta =
      Math.round(Number(newRoom.ratePerNight ?? 0)) -
      Math.round(Number(oldRoom.ratePerNight ?? 0));

    transaction.update(bookingRef, {
      roomId: newRoomId,
      roomMoves: [
        ...(live.roomMoves || []),
        {
          fromRoomId: oldRoomId,
          toRoomId: newRoomId,
          rateDelta,
          reason: reason.trim(),
          byUid: user.uid,
          byEmail: user.email || "",
          at: serverTimestamp()}],
      updatedAt: serverTimestamp()});

    // Old room becomes turnover (its mid-stay flag, if any, cleared like
    // checkout does), new room is occupied — check-in/out status form.
    const roomUpdate = {
      status: ROOM_STATUS.DIRTY,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp()};
    if (wasMidStay) {
      roomUpdate.isMidStayRequest = deleteField();
      roomUpdate.midStayNote = deleteField();
      roomUpdate.midStayGuestId = deleteField();
      roomUpdate.midStayGuestName = deleteField();
      roomUpdate.midStayBookingId = deleteField();
      roomUpdate.midStayRequestedAt = deleteField();
      roomUpdate.midStayRequestId = deleteField();
    }
    transaction.update(oldRoomRef, roomUpdate);
    transaction.update(newRoomRef, {
      status: ROOM_STATUS.OCCUPIED,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp()});

    if (wasMidStay) {
      const logRef = doc(collection(db, getCol("housekeeping_logs")));
      transaction.set(logRef, {
        roomId: oldRoomId,
        bookingId: oldRoom.midStayBookingId || bookingId,
        requestId: oldRoom.midStayRequestId || null,
        fromStatus: oldRoom.status || "Unknown",
        toStatus: ROOM_STATUS.DIRTY,
        changedByRole: "fo",
        changedByUserId: null,
        changedByName: "",
        isMidStayRequest: true,
        note: "[Mid-Stay superseded by room move — converted to turnover]",
        photoUrls: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()});
    }

    return {
      ok: true,
      fromRoomId: oldRoomId,
      toRoomId: newRoomId,
      newRoomName: newRoom.name || "",
      rateDelta,
      guestId: live.guestId || null};
  });

  if (result.guestId) {
    try {
      const diff = result.rateDelta === 0
        ? ""
        : ` Rate difference: ${result.rateDelta > 0 ? "+" : ""}${result.rateDelta}/night (your booking total is unchanged).`;
      await createNotification(result.guestId, {
        type: "room_moved",
        title: "Room Changed",
        message: `You have been moved to room ${result.newRoomName || result.toRoomId}. Reason: ${reason.trim()}.${diff}`,
        link: "/my-bookings"});
    } catch (e) {
      console.error("Notif error", e);
    }
  }

  return result;
}

/**
 * Front Office action: Add an incidental fee (e.g. Late Checkout / Overstay Fee)
 * to a booking folio before checkout.
 */
export async function addOverstayFee(bookingId, { feeAmount, feeReason = "Late checkout fee" } = {}) {
  const fee = Number(feeAmount);
  if (!bookingId || !Number.isFinite(fee) || fee <= 0) {
    throw new Error("Please provide a valid positive fee amount.");
  }

  const bCol = bookingsCollection();
  const bookingRef = doc(db, bCol, bookingId);

  const preSnap = await getDoc(bookingRef);
  if (!preSnap.exists()) throw new Error("Booking not found.");
  if (preSnap.data().status !== "Checked In") {
    throw new Error("Only Checked-In bookings can incur overstay fees.");
  }

  // increment() transforms commute: concurrent fees (or a fee racing an
  // extension, which also increments) add up instead of last-write-wins.
  // The read only validates the booking exists — it feeds no write.
  return runTransaction(db, async (transaction) => {
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const booking = bookingSnap.data();
    if (booking.status !== "Checked In") {
      throw new Error("Only Checked-In bookings can incur overstay fees.");
    }
    transaction.update(bookingRef, {
      overstayFee: increment(fee),
      overstayReason: feeReason,
      totalCost: increment(fee),
      subtotal: increment(fee),
      updatedAt: serverTimestamp()});

    const currentCost = Number(booking.totalCost ?? 0);
    const currentOverstayFee = Number(booking.overstayFee ?? 0);
    return { ok: true, newTotalCost: currentCost + fee, overstayFee: currentOverstayFee + fee };
  });
}

function newChargeId() {
  return "chg-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Front Office desk charge (minibar, damage, etc.) on a Checked-In booking.
 * Appends to otherCharges[] — a booking-local audit trail, because FO sessions
 * cannot write /audit_logs (Admin-write-only in firestore.rules). Cash is
 * untouched: a charge is NOT a payment record, the night-audit sums stay valid.
 */
export async function addFolioCharge(bookingId, { label, amount: rawAmount } = {}) {
  if (typeof label !== "string" || !label.trim()) {
    throw new Error("A description of the charge is required.");
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Please provide a valid positive amount.");
  }

  const authUser = getAuth().currentUser;
  if (!authUser) throw new Error("Sign in first.");

  const bCol = bookingsCollection();
  const bookingRef = doc(db, bCol, bookingId);
  const preSnap = await getDoc(bookingRef);
  if (!preSnap.exists()) throw new Error("Booking not found.");
  const preBooking = preSnap.data();
  if (preBooking.status !== "Checked In") {
    throw new Error("Only Checked-In bookings can incur folio charges.");
  }

  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(bookingRef);
    if (!snap.exists()) throw new Error("Booking not found.");
    const live = snap.data();
    if (live.status !== "Checked In") {
      throw new Error(
        "This booking changed since you opened the dialog — close and reopen it to add charges.");
    }

    transaction.update(bookingRef, {
      subtotal: Number(live.subtotal ?? live.totalCost ?? 0) + amount,
      totalCost: Number(live.totalCost ?? 0) + amount,
      otherCharges: [...(live.otherCharges || []), {
        chargeId: newChargeId(),
        label: label.trim(),
        amount,
        byUid: authUser.uid,
        byEmail: authUser.email || "",
        voided: false,
        at: serverTimestamp()}],
      updatedAt: serverTimestamp()});

    return { ok: true, newTotalCost: Number(live.totalCost ?? 0) + amount };
  });

  if (preBooking.guestId) {
    try {
      await createNotification(preBooking.guestId, {
        type: "folio_charge_added",
        title: "Folio Charge Added",
        message: `${label.trim()} (₱${amount.toLocaleString()}) was added to your ${preBooking.roomName || "booking"} folio.`,
        link: "/my-bookings"});
    } catch (e) {
      console.error("[bookingsService] folio charge notification failed:", e);
    }
  }

  return result;
}

/**
 * Counter-entry for a mistaken or disputed charge (desk error, guest disputes
 * the minibar, ...). Never removed: the entry keeps its audit fields and is
 * flagged voided — the amount is subtracted from totalCost again.
 */
export async function voidFolioCharge(bookingId, { chargeId, reason } = {}) {
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("A reason is required to void a charge.");
  }

  const authUser = getAuth().currentUser;
  if (!authUser) throw new Error("Sign in first.");

  const bCol = bookingsCollection();
  const bookingRef = doc(db, bCol, bookingId);
  const preSnap = await getDoc(bookingRef);
  if (!preSnap.exists()) throw new Error("Booking not found.");
  const preBooking = preSnap.data();
  if (preBooking.status !== "Checked In") {
    throw new Error("Only Checked-In bookings can have charges voided.");
  }
  const entry = (preBooking.otherCharges || []).find((c) => c.chargeId === chargeId);
  if (!entry) throw new Error("No charge with that ID on this booking.");
  if (entry.voided) throw new Error("This charge was already voided.");

  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(bookingRef);
    if (!snap.exists()) throw new Error("Booking not found.");
    const live = snap.data();
    if (live.status !== "Checked In") {
      throw new Error(
        "This booking changed since you opened the dialog — close and reopen it to void charges.");
    }
    const stored = (live.otherCharges || []).find((c) => c.chargeId === chargeId);
    if (!stored || stored.voided) {
      throw new Error("This charge was already voided — refresh and try again.");
    }

    transaction.update(bookingRef, {
      subtotal: Number(live.subtotal ?? live.totalCost ?? 0) - stored.amount,
      totalCost: Number(live.totalCost ?? 0) - stored.amount,
      otherCharges: (live.otherCharges || []).map((c) =>
        c.chargeId === chargeId
          ? { ...c, voided: true, voidReason: reason.trim(), voidedByEmail: authUser.email || "" }
          : c),
      updatedAt: serverTimestamp()});

    return { ok: true, newTotalCost: Number(live.totalCost ?? 0) - stored.amount };
  });

  if (preBooking.guestId) {
    try {
      await createNotification(preBooking.guestId, {
        type: "folio_charge_voided",
        title: "Folio Charge Removed",
        message: `"${entry.label}" (₱${entry.amount.toLocaleString()}) was removed from your folio.`,
        link: "/my-bookings"});
    } catch (e) {
      console.error("[bookingsService] folio void notification failed:", e);
    }
  }

  return result;
}

export const RATE_ADJUSTABLE_STATUSES = ["Pending", "Approved"];

/**
 * Front Office action: adjust a pre-check-in (Pending/Approved) booking's
 * nightly rate for a negotiated or walk-in price. Recomputes baseTotal via a
 * delta so concurrent overstay fees / extensions stay intact. Every change is
 * appended to rateAdjustments[] — a booking-local audit trail, because
 * /audit_logs is Admin-write-only in firestore.rules, so an FO session cannot
 * write there.
 */
export async function adjustBookingRate(bookingId, { newRatePerNight, reason } = {}) {
  const rate = Number(newRatePerNight);
  if (!bookingId || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Please provide a valid positive nightly rate.");
  }

  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("A reason is required to adjust the rate.");
  }

  const authUser = getAuth().currentUser;
  if (!authUser) throw new Error("Sign in first.");

  const bCol = bookingsCollection();
  const bookingRef = doc(db, bCol, bookingId);
  const preSnap = await getDoc(bookingRef);
  if (!preSnap.exists()) throw new Error("Booking not found.");
  const preBooking = preSnap.data();
  if (!RATE_ADJUSTABLE_STATUSES.includes(preBooking.status)) {
    throw new Error("Only Pending or Approved bookings can have their rate adjusted.");
  }

  // Absolute writes inside the tx (with a fresh re-read) commute with racing
  // overstay fees / stay extensions the same way the increment() writers do:
  // any writer that saw stale state is rejected and retried server-side.
  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(bookingRef);
    if (!snap.exists()) throw new Error("Booking not found.");
    const live = snap.data();
    if (!RATE_ADJUSTABLE_STATUSES.includes(live.status)) {
      // Pre-read already passed the gate, so a different state here means the
      // booking moved while the FO had the dialog open — not a boring reject.
      throw new Error(
        "This booking changed since you opened the dialog — close and reopen it to adjust the rate.");
    }
    const nights = Number(live.nights);
    if (!Number.isFinite(nights) || nights <= 0) {
      throw new Error("This booking has an invalid nights count.");
    }

    // Legacy bookings may predate baseTotal — derive it the same way every
    // other consumer does (BookingCard.jsx) or the delta would double-charge
    // the whole new base into totalCost.
    const previousBase = Number(live.baseTotal ??
      (live.totalCost - (live.extraPaxTotal || 0) - (live.overstayFee || 0)));
    const newBase = Math.round(rate * nights);
    const delta = newBase - previousBase;
    const newTotal = Number(live.totalCost ?? 0) + delta;
    const previousRatePerNight = Math.round(previousBase / nights);
    const newRatePerNight = Math.round(rate);

    transaction.update(bookingRef, {
      baseTotal: newBase,
      totalCost: newTotal,
      // subtotal only exists on bookings that had an extension/fee later —
      // create() never writes it (see the /bookings create whitelist).
      ...(Number.isFinite(Number(live.subtotal))
        ? { subtotal: Number(live.subtotal) + delta }
        : {}),
      rateAdjustments: [...(live.rateAdjustments || []), {
        previousRatePerNight,
        newRatePerNight,
        baseDelta: delta,
        reason: reason.trim(),
        byUid: authUser.uid,
        byEmail: authUser.email || "",
        at: serverTimestamp()}],
      updatedAt: serverTimestamp()});

    return { ok: true, previousRatePerNight, newRatePerNight, baseTotal: newBase, totalCost: newTotal };
  });

  // Guest is informed (rate changes what they owe at the desk). Bell-only —
  // the FO is standing next to this screen, same rationale as stay_extended.
  if (preBooking.guestId) {
    try {
      await createNotification(preBooking.guestId, {
        type: "booking_rate_adjusted",
        title: "Booking Rate Updated",
        message: `The nightly rate for ${preBooking.roomName || "your booking"} was adjusted to ₱${result.newRatePerNight.toLocaleString()} · new total: ₱${result.totalCost.toLocaleString()}.`,
        link: "/my-bookings"});
    } catch (e) {
      console.error("[bookingsService] rate adjustment notification failed:", e);
    }
  }

  return result;
}

export async function checkAndExpireStaleBookings() {
  const col = bookingsCollection();
  const now = new Date();

  // Awaiting Payment holds expire when the guest misses the payment deadline.
  // Unpaid Pending holds (Card/OTC with no payment signal) get the same
  // treatment; paid Pending bookings stay in the FO review queue.
  const expiredBookings = [];
  for (const status of ["Awaiting Payment", "Pending"]) {
    const q = query(
      collection(db, col),
      where("status", "==", status),
      where("paymentDeadline", "<", Timestamp.fromDate(now)));
    const snap = await getDocs(q);
    expiredBookings.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  let expiredCount = 0;
  for (const booking of expiredBookings) {
    if (booking.status === "Pending" && hasRecordedPayment(booking)) continue;
    const ref = doc(db, col, booking.id);
    // Transaction: a guest payment landing between the query above and this
    // write flips status to Pending first — the tx re-reads, sees it, and
    // skips instead of resurrecting/cancelling a paid hold. Same the other
    // way: payment txs abort against our commit rather than paying a corpse.
    const cancelled = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return false;
      const live = snap.data();
      if (live.status !== booking.status) return false;
      if (live.status === "Pending" && hasRecordedPayment(live)) return false;
      const deadline = live.paymentDeadline?.toDate?.() || live.paymentDeadline;
      if (!(deadline instanceof Date) || deadline > new Date()) return false;
      transaction.update(ref, {
        status: "Cancelled",
        rejectionReason: "Payment deadline expired",
        updatedAt: serverTimestamp()});
      return true;
    });
    if (!cancelled) continue;
    expiredCount += 1;

    // Marker cleanup must not prevent later expired bookings from processing.
    try {
      await releaseAvailabilityMarkers(booking);
    } catch (e) {
      console.error("Expired booking marker cleanup failed:", e);
    }
    
    try {
      await createNotification(booking.guestId, {
        type: "booking_cancelled",
        title: "Booking Cancelled",
        message: `Your booking was cancelled because payment was not submitted before the deadline.`,
        link: "/my-bookings"});
    } catch (e) {
      console.error("Notif error", e);
    }
  }
  
  return { expiredCount };
}
