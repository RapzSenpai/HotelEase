import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
// Shared with availabilityService — see lib/time-utils.js for the local-midnight rule.
import { toLocalDate as toDate } from "@/lib/time-utils";
import { getCol } from "@/lib/db-utils";
import { isRoomActive, isRoomBookable } from "../roomsService";
import {
  claimBookingMarked,
  getBlockedRoomIds,
  MARKER_CONFLICT_MESSAGE,
} from "../availabilityService";
import { createNotification } from "../notificationService";
import { listFoUsers } from "../userService";
import { PROOF_REQUIRED_METHODS } from "@/lib/paymentDetails";
import { getRoomCapacity } from "@/lib/roomCapacity";
import { bookingsCollection, calcNights } from "./core";

/**
 * Guest-facing booking creation: caps concurrent active bookings, checks for
 * date conflicts, prices the stay inside a transaction, then writes the
 * availability marker and notifies the front office. Moved from
 * bookingsService without changes.
 */

export async function createBooking(payload) {
  const trainingMode = payload?.trainingMode ?? null;
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

  const BOOKINGS_COL = bookingsCollection(trainingMode);

  const MAX_ACTIVE_BOOKINGS_PER_GUEST = 3;
  const guestBookingsQuery = query(
    collection(db, BOOKINGS_COL),
    where("guestId", "==", guestId),
    where("status", "in", ["Awaiting Payment", "Pending", "Approved"]),
  );
  const guestBookingsSnap = await getDocs(guestBookingsQuery);
  if (guestBookingsSnap.size >= MAX_ACTIVE_BOOKINGS_PER_GUEST) {
    throw new Error("You have reached the maximum number of active bookings. Cancel or complete an existing booking before making a new one.");
  }

  // ── Conflict check must run OUTSIDE the transaction.
  // PII-free markers in both modes (guests can't query bookings — rules deny
  // trainee guests any collection-wide training_bookings read).
  const hasConflict = (await getBlockedRoomIds(checkIn, checkOut, { trainingMode })).has(roomId);

  if (hasConflict) {
    throw new Error(
      "Those dates overlap an existing booking. Please choose different dates.",
    );
  }

  return runTransaction(db, async (transaction) => {
    const rCol = getCol("rooms", trainingMode);
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
        deposit: 0,
      },
      paymentProofUrl: null,
      paymentType: payload.paymentType || null,
      paymentMethod: paymentMethod,
      paymentDeadline: Timestamp.fromDate(paymentDeadline),
      proofUploadedAt: null,
      proofVerifiedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    transaction.set(bookingRef, bookingData);

    return { id: bookingRef.id, roomName: roomData.name || roomData.type || "Room", status: initialStatus };
  }).then(async (result) => {
    // Claim the PII-free availability markers inside a SECOND transaction.
    // The booking doc commits first so the marker-create rules (guest must own
    // a live booking) evaluate against committed state; concurrent claims for
    // the same room/nights then serialize and the loser aborts here.
    try {
      await claimBookingMarked({
        roomId,
        bookingId: result.id,
        checkIn,
        checkOut,
        status: result.status,
        trainingMode,
      });
    } catch (e) {
      // Unwind the just-created hold so a booking NEVER exists without its
      // markers (a markerless hold looks free and reopens the double-booking
      // hole). Pending losers cancel directly; Awaiting Payment losers can't
      // self-cancel per rules, so they expire via the sweep — they hold no
      // markers, so the room stays bookable either way. Training losers are
      // deleted outright (sandbox rules let owners delete) so the dry run
      // leaves no ghost holds behind.
      try {
        if (trainingMode) {
          await deleteDoc(doc(db, BOOKINGS_COL, result.id));
        } else {
          await updateDoc(doc(db, BOOKINGS_COL, result.id), {
            status: "Cancelled",
            rejectionReason: e?.message === MARKER_CONFLICT_MESSAGE
              ? "Dates taken by an earlier booking."
              : "Availability claim failed.",
            updatedAt: serverTimestamp(),
          });
        }
      } catch (compensationError) {
        console.error("Booking compensation failed after availability claim failure:", compensationError);
        throw new Error(
          e?.message || "Availability claim failed.",
          { cause: compensationError },
        );
      }
      throw e;
    }

    try {
      // FO Notifications: ONLY notify real 'fo' staff
      // We look in the appropriate collection based on trainingMode
      const foUsers = await listFoUsers({ trainingMode }).then(users =>
        users.filter(u => u.id !== guestId)
      );

      const guestDoc = await getDoc(doc(db, getCol("users", trainingMode), guestId));
      const guestName = guestDoc.exists() ? guestDoc.data().fullName || guestDoc.data().email || "Guest" : "Guest";

      const checkInStr = checkIn.toLocaleDateString();
      const checkOutStr = checkOut.toLocaleDateString();

      await Promise.all(foUsers.map(fo => createNotification(fo.id, {
        type: "booking_request",
        title: "New Booking Request",
        message: `${guestName} requested ${result.roomName} from ${checkInStr} to ${checkOutStr}`,
        link: "/fo/bookings"
      }, { trainingMode })));

      // Guest notification: payment proof required — only for methods that need proof upload
      if (PROOF_REQUIRED_METHODS.includes(payload.paymentMethod)) {
        await createNotification(guestId, {
          type: "payment_proof_required",
          title: "Payment Proof Required",
          message: `Upload payment proof to complete your booking for ${result.roomName}`,
          link: "/my-bookings"
        }, { trainingMode });
      }
    } catch (e) { console.error("Notif error", e); }
    return result;
  });
}

function dataOr(obj, key, fallback) {
  if (!obj) return fallback;
  return obj[key] === undefined ? fallback : obj[key];
}
