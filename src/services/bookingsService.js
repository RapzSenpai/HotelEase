import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { isRoomActive, isRoomBookable, listRooms } from "./roomsService";
import { listFoUsers } from "./userService";
import {
  clearBookingMarked,
  getBlockedRoomIds,
  nightKeys,
  setBookingMarked,
} from "./availabilityService";
import { createNotification } from "./notificationService";
import { uploadImageToCloudinary } from "./cloudinaryService";
import { sendBookingConfirmation } from "./emailService";
import { recordPayment } from "./paymentsService";
import { calculatePartialPayment, PROOF_REQUIRED_METHODS } from "@/lib/paymentDetails";
import { getRoomCapacity } from "@/lib/roomCapacity";
import { auth } from "@/firebase/firebase.config";

const CANCELLED_STATUS = "Cancelled";

function bookingsCollection(trainingMode) {
  return getCol("bookings", trainingMode);
}

function toDate(dateLike) {
  if (!dateLike) return null;
  if (dateLike instanceof Date) return dateLike;
  if (typeof dateLike === "string") {
    // Expect YYYY-MM-DD from <input type="date" />
    return new Date(`${dateLike}T00:00:00`);
  }
  // Timestamp
  if (typeof dateLike.toDate === "function") return dateLike.toDate();
  return null;
}

function calcNights(checkIn, checkOut) {
  const ms = checkOut.getTime() - checkIn.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export async function listBookingsForUser(uid, { trainingMode = null } = {}) {
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("guestId", "==", uid),
    orderBy("checkInDate", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToUserBookings(uid, callback, { trainingMode = null } = {}) {
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("guestId", "==", uid),
    orderBy("checkInDate", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(bookings);
    },
    (error) => {
      console.error("[bookingsService] subscribeToUserBookings error:", error);
      callback([]);
    },
  );
}

export async function listBookingsForRoom(
  roomId,
  { trainingMode = null } = {},
) {
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("roomId", "==", roomId),
    orderBy("checkInDate", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBooking(bookingId, { trainingMode = null } = {}) {
  if (!bookingId || typeof bookingId !== "string") return null;
  const col = bookingsCollection(trainingMode);
  const ref = doc(db, col, bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listBookingsByStatuses(
  statuses,
  { trainingMode = null } = {},
) {
  if (!Array.isArray(statuses) || statuses.length === 0) return [];
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("status", "in", statuses),
    orderBy("checkInDate", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

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

    // Phase 17.3: Only require payment proof for GCash and Bank Transfer methods
    const requiresProof = PROOF_REQUIRED_METHODS.includes(booking.paymentMethod);
    if (requiresProof && !booking.paymentProofUrl) {
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

    // Only auto-record payment for proof-required methods that actually uploaded proof.
    // OTC/Card: deposit stays 0 until FO manually records payment at the desk.
    const requiresProof = PROOF_REQUIRED_METHODS.includes(result.booking.paymentMethod);
    if (requiresProof && result.booking.paymentProofUrl) {
      try {
        const paymentType = result.booking.paymentType || "Full";
        const paymentMethod = result.booking.paymentMethod || "GCash";
        const totalCost = Number(result.booking.totalCost ?? 0);
        const paymentAmount = paymentType === "Partial"
          ? calculatePartialPayment(totalCost)
          : totalCost;

        await recordPayment({
          bookingId,
          amount: paymentAmount,
          method: paymentMethod,
          note: "Initial payment via proof upload",
          source: "guest_proof",
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

        sendBookingConfirmation({
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
    if (!trainingMode) {
      try {
        await clearBookingMarked({
          roomId: result.booking.roomId,
          dates: nightKeys(result.booking.checkInDate, result.booking.checkOutDate),
        });
      } catch (e) {
        console.warn("Availability marker cleanup failed:", e);
      }
    }
    return { ok: true };
  });
}

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

export function subscribeToAllBookings(callback, { trainingMode = null } = {}) {
  const col = bookingsCollection(trainingMode);
  const q = query(collection(db, col), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(bookings);
    },
    (error) => {
      console.error("[bookingsService] subscribeToAllBookings error:", error);
      callback([]);
    }
  );
}

export function subscribeToPendingBookingRequests(
  callback,
  { trainingMode = null } = {},
) {
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("status", "==", "Pending"),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const pending = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(pending);
    },
    (error) => {
      console.error("[bookingsService] subscribeToPendingBookingRequests error:", error);
      callback([]);
    }
  );
}

export async function rejectBooking(
  bookingId,
  reason,
  { trainingMode = null } = {},
) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to rejectBooking");
  }
  const col = bookingsCollection(trainingMode);
  const ref = doc(db, col, bookingId);
  await updateDoc(ref, {
    status: "Cancelled",
    rejectionReason: reason || "",
    updatedAt: serverTimestamp(),
  });
  try {
    const bookingSnap = await getDoc(ref);
    const booking = bookingSnap.data();
    const roomSnap = await getDoc(doc(db, getCol("rooms", trainingMode), booking.roomId));
    const roomName = roomSnap.exists() ? roomSnap.data().name || roomSnap.data().type || "Room" : "Room";

    await createNotification(booking.guestId, {
      type: "booking_rejected",
      title: "Booking Update",
      message: `Your booking for ${roomName} was not approved. Reason: ${reason || "Not provided"}`,
      link: "/my-bookings"
    });
  } catch (e) { console.error("Notif error", e); }
  return { ok: true };
}

export async function cancelBooking(bookingId, { trainingMode = null } = {}) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to cancelBooking");
  }
  const col = bookingsCollection(trainingMode);
  const rCol = getCol("rooms", trainingMode);

  const { booking, roomName } = await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, col, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const bookingData = bookingSnap.data();
    const previousStatus = bookingData.status;

    let userSnap = null;
    let userRef = null;
    if (previousStatus === "Approved") {
      const uCol = getCol("users", trainingMode);
      userRef = doc(db, uCol, bookingData.guestId);
      userSnap = await transaction.get(userRef);
    }

    let roomSnap = null;
    let roomRef = null;
    if (bookingData.roomId) {
      roomRef = doc(db, rCol, bookingData.roomId);
      roomSnap = await transaction.get(roomRef);
    }

    // --- All reads done, now perform writes ---

    if (userSnap && userSnap.exists()) {
      const count = userSnap.data().cancellationCount || 0;
      if (count >= 3) {
        throw new Error("This guest has reached the maximum cancellation limit (3). Cannot cancel further bookings.");
      }
      transaction.update(userRef, {
        cancellationCount: count + 1,
        updatedAt: serverTimestamp(),
      });
    }

    let resolvedRoomName = "Room";
    if (roomSnap && roomSnap.exists()) {
      const roomData = roomSnap.data();
      resolvedRoomName = roomData.name || roomData.type || "Room";

      if (previousStatus === "Checked In") {
        transaction.update(roomRef, {
          status: "Dirty / Needs Cleaning",
          updatedAt: serverTimestamp(),
          statusChangedAt: serverTimestamp(),
        });
      } else if (previousStatus === "Approved") {
        transaction.update(roomRef, {
          status: "Available",
          updatedAt: serverTimestamp(),
          statusChangedAt: serverTimestamp(),
        });
      }
    }

    transaction.update(bookingRef, {
      status: "Cancelled",
      updatedAt: serverTimestamp(),
    });

    return { booking: bookingData, roomName: resolvedRoomName };
  });

  try {
    // PROD: free the availability markers for this booking's nights.
    if (!trainingMode) {
      try {
        await clearBookingMarked({
          roomId: booking.roomId,
          dates: nightKeys(booking.checkInDate, booking.checkOutDate),
        });
      } catch (e) {
        console.warn("Availability marker cleanup failed:", e);
      }
    }

    const checkInStr = booking.checkInDate?.toDate
      ? booking.checkInDate.toDate().toLocaleDateString()
      : "unknown date";
    const foUsers = await listFoUsers({ trainingMode }).then((users) => users);

    await Promise.all(
      foUsers.map((fo) =>
        createNotification(fo.id, {
          type: "booking_cancelled",
          title: "Booking Cancelled",
          message: `Booking for ${roomName} on ${checkInStr} has been cancelled.`,
          link: "/fo/bookings",
        }),
      ),
    );
  } catch (e) {
    console.error("Notif error", e);
  }

  return { ok: true };
}

/**
 * Returns a Set of room IDs that have conflicting bookings for the selected date range.
 * A conflict is defined as a booking in status "Awaiting Payment", "Pending", "Approved",
 * or "Checked In" that overlaps with [checkInStr, checkOutStr].
 *
 * @param {string} checkInStr YYYY-MM-DD
 * @param {string} checkOutStr YYYY-MM-DD
 * @param {{ trainingMode?: boolean }} options
 * @returns {Promise<Set<string>>} Set of conflicting room IDs
 */
export async function getAvailableRoomIds(checkInStr, checkOutStr, { trainingMode = null } = {}) {
  const checkIn = toDate(checkInStr);
  const checkOut = toDate(checkOutStr);
  if (!checkIn || !checkOut || checkOut <= checkIn) return new Set();

  // PROD: read the PII-free availability markers. Guests cannot read other
  // guests' bookings, so this is the only safe source.
  if (!trainingMode) {
    return getBlockedRoomIds(checkInStr, checkOutStr);
  }

  // Training: legacy path against the open training_bookings sandbox.
  const activeBookings = await listBookingsByStatuses(
    ["Awaiting Payment", "Pending", "Approved", "Checked In"],
    { trainingMode },
  );

  const conflictingRoomIds = new Set();
  for (const b of activeBookings) {
    const bIn = toDate(b.checkInDate);
    const bOut = toDate(b.checkOutDate);
    if (bIn && bOut && checkIn < bOut && checkOut > bIn) {
      if (b.roomId) {
        conflictingRoomIds.add(b.roomId);
      }
    }
  }
  return conflictingRoomIds;
}

/**
 * Returns full room objects that are available (not conflicted) for the given
 * date range. Only includes active rooms. This is the single source of truth
 * used by Browse Rooms filtering AND the wizard's defensive pre-submit check.
 *
 * @param {string} checkInStr  YYYY-MM-DD
 * @param {string} checkOutStr YYYY-MM-DD
 * @param {{ trainingMode?: boolean }} options
 * @returns {Promise<Array>} Array of room objects available for those dates
 */
export async function getAvailableRooms(checkInStr, checkOutStr, { trainingMode = null } = {}) {
  const checkIn = toDate(checkInStr);
  const checkOut = toDate(checkOutStr);
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];

  const [conflictingIds, allRooms] = await Promise.all([
    getAvailableRoomIds(checkInStr, checkOutStr, { trainingMode }),
    listRooms({ trainingMode }),
  ]);

  return allRooms.filter(
    (room) => isRoomActive(room) && !conflictingIds.has(room.id)
  );
}

export async function requestCancellation(bookingId, guestId, reason, { trainingMode = null } = {}) {
  if (!bookingId || !reason) throw new Error("Missing booking or reason.");

  return runTransaction(db, async (transaction) => {
    const col = bookingsCollection(trainingMode);
    const bookingRef = doc(db, col, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const booking = bookingSnap.data();
    if (booking.guestId !== guestId) throw new Error("Unauthorized.");
    if (booking.status !== "Approved") throw new Error("Only Approved bookings can request cancellation.");

    const uCol = getCol("users", trainingMode);
    const userRef = doc(db, uCol, guestId);
    const userSnap = await transaction.get(userRef);

    if (userSnap.exists()) {
      const count = userSnap.data().cancellationCount || 0;
      if (count >= 3) {
        throw new Error("You have reached the maximum number of cancellations allowed.");
      }
    }

    transaction.update(bookingRef, {
      status: "Cancellation Requested",
      cancellationReason: reason,
      cancellationRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return { ok: true, roomName: "Room" }; 
  }).then(async () => {
    try {
      const foUsers = await listFoUsers({ trainingMode });
      await Promise.all(foUsers.map(fo => createNotification(fo.id, {
        type: "cancellation_requested",
        title: "Cancellation Requested",
        message: `A guest has requested to cancel their booking. Reason: ${reason}`,
        link: "/fo/cancellations"
      })));
    } catch (e) { console.error("Notif error", e); }
    return { ok: true };
  });
}

export async function approveCancellation(bookingId, { trainingMode = null } = {}) {
  if (!bookingId) throw new Error("Invalid bookingId");

  const bCol = bookingsCollection(trainingMode);
  const rCol = getCol("rooms", trainingMode);

  const { booking, roomName } = await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const bookingData = bookingSnap.data();
    if (bookingData.status !== "Cancellation Requested") {
      throw new Error("Booking is not pending cancellation.");
    }

    const uCol = getCol("users", trainingMode);
    const userRef = doc(db, uCol, bookingData.guestId);
    const userSnap = await transaction.get(userRef);

    let roomSnap = null;
    let roomRef = null;
    if (bookingData.roomId) {
      roomRef = doc(db, rCol, bookingData.roomId);
      roomSnap = await transaction.get(roomRef);
    }

    if (userSnap && userSnap.exists()) {
      const count = userSnap.data().cancellationCount || 0;
      if (count >= 3) {
        throw new Error("This guest has reached the maximum cancellation limit (3). Cannot approve further cancellations.");
      }
      transaction.update(userRef, {
        cancellationCount: count + 1,
        updatedAt: serverTimestamp(),
      });
    }

    let resolvedRoomName = "Room";
    if (roomSnap && roomSnap.exists()) {
      resolvedRoomName = roomSnap.data().name || roomSnap.data().type || "Room";
      transaction.update(roomRef, {
        status: "Available",
        updatedAt: serverTimestamp(),
        statusChangedAt: serverTimestamp(),
      });
    }

    transaction.update(bookingRef, {
      status: "Cancelled",
      updatedAt: serverTimestamp(),
    });

    return { booking: bookingData, roomName: resolvedRoomName };
  });

  try {
    // PROD: free the availability markers for this booking's nights.
    if (!trainingMode) {
      try {
        await clearBookingMarked({
          roomId: booking.roomId,
          dates: nightKeys(booking.checkInDate, booking.checkOutDate),
        });
      } catch (e) {
        console.warn("Availability marker cleanup failed:", e);
      }
    }

    await createNotification(booking.guestId, {
      type: "cancellation_approved",
      title: "Cancellation Approved",
      message: `Your cancellation request for ${roomName} has been approved.`,
      link: "/my-bookings",
    });
  } catch (e) {
    console.error("Notif error", e);
  }

  return { ok: true };
}

export async function rejectCancellation(bookingId, rejectionReason, { trainingMode = null } = {}) {
  if (!bookingId) throw new Error("Invalid bookingId");

  const bCol = bookingsCollection(trainingMode);
  const rCol = getCol("rooms", trainingMode);

  const { booking, roomName } = await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const bookingData = bookingSnap.data();
    if (bookingData.status !== "Cancellation Requested") {
      throw new Error("Booking is not pending cancellation.");
    }

    let roomSnap = null;
    let roomRef = null;
    if (bookingData.roomId) {
      roomRef = doc(db, rCol, bookingData.roomId);
      roomSnap = await transaction.get(roomRef);
    }

    let resolvedRoomName = "Room";
    if (roomSnap && roomSnap.exists()) {
      resolvedRoomName = roomSnap.data().name || roomSnap.data().type || "Room";
    }

    transaction.update(bookingRef, {
      status: "Approved",
      rejectionReason: rejectionReason || "",
      updatedAt: serverTimestamp(),
    });

    return { booking: bookingData, roomName: resolvedRoomName };
  });

  try {
    await createNotification(booking.guestId, {
      type: "cancellation_rejected",
      title: "Cancellation Rejected",
      message: `Your cancellation request for ${roomName} was rejected. Reason: ${rejectionReason}`,
      link: "/my-bookings",
    });
  } catch (e) {
    console.error("Notif error", e);
  }

  return { ok: true };
}

export async function uploadPaymentProof(bookingId, file, paymentType, paymentMethod, { trainingMode = null } = {}) {
  if (!bookingId || typeof bookingId !== "string") {
    throw new Error("Invalid bookingId passed to uploadPaymentProof");
  }
  if (!file) {
    throw new Error("File is required for payment proof upload");
  }
  if (!paymentType || !["Full", "Partial"].includes(paymentType)) {
    throw new Error("paymentType must be 'Full' or 'Partial'");
  }
  if (!paymentMethod || !["GCash", "Bank Transfer", "Credit/Debit Card", "Over-the-Counter"].includes(paymentMethod)) {
    throw new Error("Invalid payment method");
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to upload payment proof");
  }

  const col = bookingsCollection(trainingMode);
  const bookingRef = doc(db, col, bookingId);
  const bookingSnap = await getDoc(bookingRef);
  
  if (!bookingSnap.exists()) {
    throw new Error("Booking not found");
  }

  const booking = bookingSnap.data();
  if (booking.guestId !== currentUser.uid) {
    throw new Error("You can only upload payment proof for your own bookings");
  }
  if (booking.status !== "Awaiting Payment") {
    throw new Error("Payment proof can only be uploaded for bookings in 'Awaiting Payment' status");
  }

  const { url } = await uploadImageToCloudinary(file, { compressionPreset: "paymentProofs" });

  await updateDoc(bookingRef, {
    paymentProofUrl: url,
    paymentType: paymentType,
    paymentMethod: paymentMethod,
    proofUploadedAt: serverTimestamp(),
    status: "Pending",
    updatedAt: serverTimestamp(),
  });

  try {
    const foUsers = await listFoUsers({ trainingMode }).then(users =>
      users.filter(u => u.id !== currentUser.uid)
    );

    await Promise.all(foUsers.map(fo => createNotification(fo.id, {
      type: "booking_request",
      title: "Payment Proof Uploaded",
      message: `Payment proof has been uploaded for a booking request`,
      link: "/fo/bookings"
    })));
  } catch (e) {
    console.error("Notif error", e);
  }

  return { ok: true, paymentProofUrl: url };
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
    if (!trainingMode) {
      try {
        await clearBookingMarked({
          roomId: booking.roomId,
          dates: nightKeys(booking.checkInDate, booking.checkOutDate),
        });
      } catch (e) {
        console.warn("Availability marker cleanup failed:", e);
      }
    }
    
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
