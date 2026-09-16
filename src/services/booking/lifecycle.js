import {
  collection,
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
import { isRoomActive } from "../roomsService";
import { setBookingMarked } from "../availabilityService";
import { createNotification } from "../notificationService";
import { sendBookingConfirmation } from "../emailService";
import { recordPayment } from "../paymentsService";
import { calculatePartialPayment, PROOF_REQUIRED_METHODS } from "@/lib/paymentDetails";
import {
  bookingsCollection,
  calcNights,
  releaseAvailabilityMarkers,
} from "./core";
import { getAvailableRoomIds } from "./queries";

/**
 * Front-office lifecycle transitions on a booking: approve, check in, check out,
 * extend the stay, add an overstay fee, and the sweep that expires unpaid holds.
 * Moved from bookingsService without changes.
 */

const ROOM_STATUS = {
  RESERVED: "Reserved",
  OCCUPIED: "Occupied",
  DIRTY: "Dirty / Needs Cleaning",
};

export async function approveBooking(bookingId, { trainingMode = null } = {}) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to approveBooking");
  }

  const bCol = bookingsCollection(trainingMode);

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
      where("status", "in", ["Approved", "Checked In"]),
    );
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
        "Cannot approve — another booking for this room already covers these dates.",
      );
    }
  }

  return runTransaction(db, async (transaction) => {
    const rCol = getCol("rooms", trainingMode);

    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const booking = bookingSnap.data();
    if (booking.status !== "Pending") {
      throw new Error("Booking must be Pending to approve.");
    }

    // Phase 17.3: Only require payment proof for GCash and Bank Transfer methods.
    // Simulated gateway payments carry a gatewayRef instead of a proof image.
    const requiresProof = PROOF_REQUIRED_METHODS.includes(booking.paymentMethod);
    if (requiresProof && !booking.paymentProofUrl && booking.paymentGateway !== "simulated") {
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

    transaction.update(bookingRef, {
      status: "Approved",
      proofVerifiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.update(roomRef, {
      status: ROOM_STATUS.RESERVED,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, roomName: roomSnap.data().name || roomSnap.data().type || "Room", guestId: booking.guestId, booking };
  }).then(async (result) => {
    // PROD: refresh availability marker status after approval.
    if (!trainingMode) {
      try {
        await setBookingMarked({
          roomId: result.booking.roomId,
          bookingId,
          checkIn: result.booking.checkInDate,
          checkOut: result.booking.checkOutDate,
          status: "Approved",
        });
      } catch (e) {
        console.warn("Availability marker refresh failed:", e);
      }
    }

    // Only auto-record payment for proof-required methods that actually uploaded proof
    // or completed the simulated gateway checkout.
    // OTC/Card: deposit stays 0 until FO manually records payment at the desk.
    const requiresProof = PROOF_REQUIRED_METHODS.includes(result.booking.paymentMethod);
    if (requiresProof && (result.booking.paymentProofUrl || result.booking.paymentGateway === "simulated")) {
      try {
        const paymentType = result.booking.paymentType || "Full";
        const paymentMethod = result.booking.paymentMethod || "GCash";
        const totalCost = Number(result.booking.totalCost ?? 0);
        const paymentAmount = paymentType === "Partial"
          ? calculatePartialPayment(totalCost)
          : totalCost;
        const isSimulated = result.booking.paymentGateway === "simulated";

        await recordPayment({
          bookingId,
          amount: paymentAmount,
          method: paymentMethod,
          note: isSimulated
            ? `Initial payment via simulated gateway (${result.booking.gatewayRef || "no ref"})`
            : "Initial payment via proof upload",
          source: isSimulated ? "simulated_gateway" : "guest_proof",
          processedBy: "system",
          trainingMode,
        });
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
      const guestDoc = await getDoc(doc(db, getCol("users", trainingMode), result.guestId));
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

        // Training guests have no email address — skip the doomed EmailJS call.
        if (!trainingMode) sendBookingConfirmation({
          toEmail,
          toName,
          roomName: result.roomName,
          checkIn: checkInStr,
          checkOut: checkOutStr,
          bookingId: bookingId,
          paymentType,
        });
      }
    } catch (e) {
      console.error("Email service error:", e);
    }

    return result;
  });
}

export async function checkInBooking(bookingId, { trainingMode = null } = {}) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to checkInBooking");
  }

  return runTransaction(db, async (transaction) => {
    const bCol = bookingsCollection(trainingMode);
    const rCol = getCol("rooms", trainingMode);

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
      updatedAt: serverTimestamp(),
    });

    transaction.update(roomRef, {
      status: ROOM_STATUS.OCCUPIED,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
    });

    return { ok: true, booking };
  }).then(async (result) => {
    // PROD: refresh availability marker status after check-in so the guest
    // calendar shows "Checked In" instead of the stale "Approved".
    if (!trainingMode) {
      try {
        await setBookingMarked({
          roomId: result.booking.roomId,
          bookingId,
          checkIn: result.booking.checkInDate,
          checkOut: result.booking.checkOutDate,
          status: "Checked In",
        });
      } catch (e) {
        console.warn("Availability marker refresh failed:", e);
      }
    }
    return { ok: true };
  });
}

export async function checkOutBooking(bookingId, { trainingMode = null } = {}) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to checkOutBooking");
  }

  return runTransaction(db, async (transaction) => {
    const bCol = bookingsCollection(trainingMode);
    const rCol = getCol("rooms", trainingMode);

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

    transaction.update(bookingRef, {
      status: "Checked Out",
      updatedAt: serverTimestamp(),
    });

    transaction.update(roomRef, {
      status: ROOM_STATUS.DIRTY,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
    });

    return { booking, ok: true };
  }).then(async (result) => {
    // PROD: free availability markers on check-out so the nights can be re-booked.
    if (!trainingMode) await releaseAvailabilityMarkers(result.booking);
    return { ok: true };
  });
}

/**
 * Front Office action: Extend an active Checked-In booking to a new check-out date.
 * Validates conflicts on the extended nights and writes availability markers.
 */
export async function extendStayBooking(bookingId, { newCheckOutDate, additionalCost = 0, trainingMode = null } = {}) {
  if (!bookingId || !newCheckOutDate) throw new Error("Booking ID and new check-out date are required.");

  const newOut = toDate(newCheckOutDate);
  if (!newOut) throw new Error("Invalid new check-out date.");

  const bCol = bookingsCollection(trainingMode);
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

  // Check conflicts for the extended date range [currentOut, newOut]
  const curOutStr = currentOut.toISOString().split("T")[0];
  const newOutStr = newOut.toISOString().split("T")[0];
  const blockedRoomIds = await getAvailableRoomIds(curOutStr, newOutStr, { trainingMode });
  if (blockedRoomIds.has(booking.roomId)) {
    throw new Error("Cannot extend stay: The room is reserved by another booking for the extended dates.");
  }

  const newTotalNights = calcNights(checkIn, newOut);
  const addedNights = calcNights(currentOut, newOut);
  const updatedTotalCost = Number(booking.totalCost ?? 0) + Number(additionalCost);

  await updateDoc(bookingRef, {
    checkOutDate: Timestamp.fromDate(newOut),
    nights: newTotalNights,
    totalCost: updatedTotalCost,
    subtotal: updatedTotalCost,
    baseTotal: Number(booking.baseTotal ?? booking.totalCost) + Number(additionalCost),
    isExtended: true,
    extendedNights: (booking.extendedNights || 0) + addedNights,
    updatedAt: serverTimestamp(),
  });

  // PROD: mark the newly extended nights as Checked In
  if (!trainingMode) {
    try {
      await setBookingMarked({
        roomId: booking.roomId,
        bookingId,
        checkIn: currentOut,
        checkOut: newOut,
        status: "Checked In",
      });
    } catch (e) {
      console.warn("Availability marker update for extension failed:", e);
    }
  }

  // Notify guest
  if (booking.guestId) {
    try {
      await createNotification(booking.guestId, {
        type: "stay_extended",
        title: "Stay Extended",
        message: `Your stay in ${booking.roomName || "your room"} has been extended until ${newOut.toLocaleDateString()}.`,
        link: "/my-bookings",
      });
    } catch (e) {
      console.error("Notif error", e);
    }
  }

  return { ok: true, newCheckOutDate: newOut, totalNights: newTotalNights, totalCost: updatedTotalCost };
}

/**
 * Front Office action: Add an incidental fee (e.g. Late Checkout / Overstay Fee)
 * to a booking folio before checkout.
 */
export async function addOverstayFee(bookingId, { feeAmount, feeReason = "Overstay / Late Check-Out Fee", trainingMode = null } = {}) {
  const fee = Number(feeAmount);
  if (!bookingId || !Number.isFinite(fee) || fee <= 0) {
    throw new Error("Please provide a valid positive fee amount.");
  }

  const bCol = bookingsCollection(trainingMode);
  const bookingRef = doc(db, bCol, bookingId);
  const bookingSnap = await getDoc(bookingRef);
  if (!bookingSnap.exists()) throw new Error("Booking not found.");

  const booking = bookingSnap.data();
  const currentCost = Number(booking.totalCost ?? 0);
  const currentOverstayFee = Number(booking.overstayFee ?? 0);
  const newTotal = currentCost + fee;

  await updateDoc(bookingRef, {
    overstayFee: currentOverstayFee + fee,
    overstayReason: feeReason,
    totalCost: newTotal,
    subtotal: newTotal,
    updatedAt: serverTimestamp(),
  });

  return { ok: true, newTotalCost: newTotal, overstayFee: currentOverstayFee + fee };
}

export async function checkAndExpireStaleBookings({ trainingMode = null } = {}) {
  const col = bookingsCollection(trainingMode);
  const now = new Date();
  
  const q = query(
    collection(db, col),
    where("status", "==", "Awaiting Payment"),
    where("paymentDeadline", "<", Timestamp.fromDate(now))
  );
  
  const snap = await getDocs(q);
  const expiredBookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  
  for (const booking of expiredBookings) {
    const ref = doc(db, col, booking.id);
    await updateDoc(ref, {
      status: "Cancelled",
      rejectionReason: "Payment deadline expired",
      updatedAt: serverTimestamp(),
    });

    // PROD: free availability markers for the expired booking's nights.
    if (!trainingMode) await releaseAvailabilityMarkers(booking);
    
    try {
      await createNotification(booking.guestId, {
        type: "booking_cancelled",
        title: "Booking Cancelled",
        message: `Your booking was cancelled because payment was not submitted before the deadline.`,
        link: "/my-bookings",
      });
    } catch (e) {
      console.error("Notif error", e);
    }
  }
  
  return { expiredCount: expiredBookings.length };
}
