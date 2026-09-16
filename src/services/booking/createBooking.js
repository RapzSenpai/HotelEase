import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
// Shared with availabilityService — see lib/time-utils.js for the local-midnight rule.
import { toLocalDate as toDate } from "@/lib/time-utils";
import { getCol } from "@/lib/db-utils";
import { isRoomActive, isRoomBookable } from "../roomsService";
import { getBlockedRoomIds, setBookingMarked } from "../availabilityService";
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
  // PROD: read the PII-free availability markers (guests can't query bookings).
  // Training: legacy overlap query against the open sandbox.
  let hasConflict = false;
  if (trainingMode) {
    const conflictsQuery = query(
      collection(db, BOOKINGS_COL),
      where("roomId", "==", roomId),
      where("status", "in", ["Awaiting Payment", "Pending", "Approved", "Checked In"]),
    );
    const conflictsSnap = await getDocs(conflictsQuery);
    hasConflict = conflictsSnap.docs.some((conflictDoc) => {
      const b = conflictDoc.data();
      const bIn = toDate(b.checkInDate);
      const bOut = toDate(b.checkOutDate);
      return checkIn < bOut && checkOut > bIn;
    });
  } else {
    hasConflict = (await getBlockedRoomIds(checkIn, checkOut)).has(roomId);
  }

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

    return { id: bookingRef.id, roomName: roomData.name || roomData.type || "Room" };
  }).then(async (result) => {
    try {
      // PROD: write the PII-free availability marker so guests can read
      // occupancy without access to other guests' bookings. Training keeps
      // reading the legacy sandbox directly, so no markers are needed there.
      if (!trainingMode) {
        await setBookingMarked({
          roomId,
          bookingId: result.id,
          checkIn,
          checkOut,
          status: PROOF_REQUIRED_METHODS.includes(payload.paymentMethod)
            ? "Awaiting Payment"
            : "Pending",
        });
      }
    } catch (e) {
      console.warn("Availability marker write failed (booking still created):", e);
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
      })));

      // Guest notification: payment proof required — only for methods that need proof upload
      if (PROOF_REQUIRED_METHODS.includes(payload.paymentMethod)) {
        await createNotification(guestId, {
          type: "payment_proof_required",
          title: "Payment Proof Required",
          message: `Upload payment proof to complete your booking for ${result.roomName}`,
          link: "/my-bookings"
        });
      }
    } catch (e) { console.error("Notif error", e); }
    return result;
  });
}

function dataOr(obj, key, fallback) {
  if (!obj) return fallback;
  return obj[key] === undefined ? fallback : obj[key];
}
