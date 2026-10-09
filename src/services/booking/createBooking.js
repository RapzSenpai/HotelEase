import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
// Shared with availabilityService — see lib/time-utils.js for the local-midnight rule.
import { toLocalDate as toDate } from "@/lib/time-utils";
import { getCol } from "@/lib/db-utils";
import { isRoomActive, isRoomBookable } from "../roomsService";
import { PROOF_REQUIRED_METHODS } from "@/lib/paymentDetails";
import {
  claimBookingMarked,
  getBlockedRoomIds,
  MARKER_CONFLICT_MESSAGE,
  nightKeys} from "../availabilityService";
import { getRoomCapacity } from "@/lib/roomCapacity";
import { bookingsCollection, calcNights } from "./core";

/**
 * Guest-facing booking creation: caps concurrent active bookings, checks for
 * date conflicts, prices the stay inside a transaction, then writes the
 * availability marker and queues server-side notification delivery.
 */

export async function createBooking(payload) {
  const checkIn = toDate(payload.checkInDate);
  const checkOut = toDate(payload.checkOutDate);

  if (!checkIn || !checkOut) throw new Error("Please select valid dates.");
  if (checkOut <= checkIn) throw new Error("Check-out must be after check-in.");

  const nights = calcNights(checkIn, checkOut);
  if (nights <= 0) throw new Error("Invalid stay duration.");

  const checkInTs = Timestamp.fromDate(checkIn);
  const checkOutTs = Timestamp.fromDate(checkOut);

  const guestId = payload.guestId;
  const roomId = payload.roomId;

  if (!guestId || !roomId) throw new Error("Missing booking details.");

  const BOOKINGS_COL = bookingsCollection();

  const MAX_ACTIVE_BOOKINGS_PER_GUEST = 3;
  const guestBookingsQuery = query(
    collection(db, BOOKINGS_COL),
    where("guestId", "==", guestId),
    where("status", "in", ["Awaiting Payment", "Pending", "Approved"]));
  // Two independent reads, one round trip: the guest's active bookings and the
  // night markers (the conflict check must run OUTSIDE the transaction;
  // PII-free markers in both modes, since rules deny trainee guests any
  // collection-wide training_bookings read).
  const [guestBookingsSnap, blockedRoomIds] = await Promise.all([
    getDocs(guestBookingsQuery),
    getBlockedRoomIds(checkIn, checkOut),
  ]);
  if (guestBookingsSnap.size >= MAX_ACTIVE_BOOKINGS_PER_GUEST) {
    throw new Error("You have reached the maximum number of active bookings. Cancel or complete an existing booking before making a new one.");
  }

  if (blockedRoomIds.has(roomId)) {
    throw new Error(
      "Those dates overlap an existing booking. Please choose different dates.");
  }

  return runTransaction(db, async (transaction) => {
    const rCol = getCol("rooms");
    const roomRef = doc(db, rCol, roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Selected room no longer exists.");
    const roomData = roomSnap.data();
    if (!isRoomBookable({ ...roomData, id: roomId })) {
      if (!isRoomActive(roomData)) {
        throw new Error("This room is no longer available for booking.");
      }
      throw new Error("This room is not currently bookable.");
    }

    const paxCount = Number(payload.paxCount ?? 1);
    const roomCapacity = getRoomCapacity(roomData);
    const extraPaxCount = Math.max(0, paxCount - roomCapacity.basePax);
    const baseRate = Number(dataOr(roomData, "ratePerNight", 0));
    const baseTotal = baseRate * nights;
    const extraPaxFee = roomCapacity.extraPaxFee;
    const extraPaxTotal = extraPaxCount * extraPaxFee * nights;
    const totalCost = baseTotal + extraPaxTotal;

    // Phase 18.2: Determine initial status based on payment method
    // Proof-exempt methods (OTC, Card) skip "Awaiting Payment" and go straight to "Pending"
    const paymentMethod = payload.paymentMethod;
    if (!paymentMethod) {
      throw new Error("Payment method is required");
    }
    const requiresProof = PROOF_REQUIRED_METHODS.includes(paymentMethod);
    const initialStatus = requiresProof ? "Awaiting Payment" : "Pending";

    const bookingRef = doc(collection(db, BOOKINGS_COL));
    const paymentDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
    const rateType = payload.rateType === "NonRefundable" ? "NonRefundable" : "Standard";
    const cancellationDeadline = Timestamp.fromDate(new Date(checkIn.getTime() - 24 * 60 * 60 * 1000));

    const bookingData = {
      guestId,
      roomId,
      checkInDate: checkInTs,
      checkOutDate: checkOutTs,
      nights,
      baseTotal,
      totalCost,
      status: initialStatus,
      bookingType: "Online",
      paxCount,
      extraPaxCount,
      extraPaxFee,
      extraPaxTotal,
      specialRequests: payload.specialRequests ?? "",
      // P0.3 — lead guest fields (supports booking-on-behalf-of, separate from guestId)
      leadGuestName: payload.leadGuestName ?? null,
      leadGuestEmail: payload.leadGuestEmail ?? null,
      leadGuestPhone: payload.leadGuestPhone ?? null,
      arrivalTime: payload.arrivalTime ?? "I don't know",
      payment: {
        method: paymentMethod,
        deposit: 0},
      paymentProofUrl: null,
      paymentType: payload.paymentType || null,
      paymentMethod: paymentMethod,
      paymentDeadline: Timestamp.fromDate(paymentDeadline),
      proofUploadedAt: null,
      proofVerifiedAt: null,
      rateType,
      cancellationDeadline,
      cancellationFee: 0,
      refundStatus: null,
      refundAmount: 0,
      refundMethod: null,
      refundReason: null,
      refundProcessedAt: null,
      refundProcessedBy: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()};

    transaction.set(bookingRef, bookingData);
    transaction.set(
      doc(db, getCol("booking_notification_jobs"), bookingRef.id),
      {
        bookingId: bookingRef.id,
        guestId,
        roomId,
        roomName: roomData.name || roomData.type || "Room",
        checkIn: checkIn.toLocaleDateString(),
        checkOut: checkOut.toLocaleDateString(),
        markerDates: nightKeys(checkIn, checkOut),
        paymentMethod,
        status: "waiting_for_markers",
        attempts: 0,
        nextAttemptAt: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()});

    return { id: bookingRef.id, roomName: roomData.name || roomData.type || "Room", status: initialStatus };
  }).then(async (result) => {
    // The Worker atomically claims availability markers and queues this job.
    try {
      await claimBookingMarked({
        bookingId: result.id});
    } catch (e) {
      if (e?.status !== 409 || e?.message !== MARKER_CONFLICT_MESSAGE) {
        throw e;
      }
      // Unwind the just-created hold so a booking NEVER exists without its
      // markers (a markerless hold looks free and reopens the double-booking
      // hole). Pending losers cancel directly; Awaiting Payment losers can't
      // self-cancel per rules, so they expire via the sweep — they hold no
      // markers, so the room stays bookable either way.
      try {
        await updateDoc(doc(db, BOOKINGS_COL, result.id), {
          status: "Cancelled",
          rejectionReason: e?.message === MARKER_CONFLICT_MESSAGE
            ? "Dates taken by an earlier booking."
            : "Availability claim failed.",
          updatedAt: serverTimestamp()});
      } catch (compensationError) {
        console.error("Booking compensation failed after availability claim failure:", compensationError);
        throw new Error(
          e?.message || "Availability claim failed.",
          { cause: compensationError });
      }
      throw e;
    }

    return result;
  });
}

function dataOr(obj, key, fallback) {
  if (!obj) return fallback;
  return obj[key] === undefined ? fallback : obj[key];
}
