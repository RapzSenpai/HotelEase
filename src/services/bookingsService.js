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
import { isRoomActive, isRoomBookable } from "./roomsService";
import { listUsers } from "./userService";
import { createNotification } from "./notificationService";

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

  return runTransaction(db, async (transaction) => {
    const bCol = bookingsCollection(trainingMode);
    const rCol = getCol("rooms", trainingMode);

    const bookingRef = doc(db, bCol, bookingId);
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error("Booking not found.");

    const booking = bookingSnap.data();
    if (booking.status !== "Pending") {
      throw new Error("Booking must be Pending to approve.");
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
      updatedAt: serverTimestamp(),
    });

    transaction.update(roomRef, {
      status: ROOM_STATUS.RESERVED,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, roomName: roomSnap.data().name || roomSnap.data().type || "Room", guestId: booking.guestId };
  }).then(async (result) => {
    try {
      await createNotification(result.guestId, {
        type: "booking_approved",
        title: "Booking Approved! 🎉",
        message: `Your booking for ${result.roomName} has been approved.`,
        link: "/my-bookings"
      });
    } catch (e) { console.error("Notif error", e); }
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
    where("status", "in", ["Pending", "Approved"]),
  );
  const guestBookingsSnap = await getDocs(guestBookingsQuery);
  if (guestBookingsSnap.size >= MAX_ACTIVE_BOOKINGS_PER_GUEST) {
    throw new Error("You have reached the maximum number of active bookings. Cancel or complete an existing booking before making a new one.");
  }

  // ── Conflict check must run OUTSIDE the transaction.
  // transaction.get() only accepts DocumentReferences, not Queries.
  const conflictsQuery = query(
    collection(db, BOOKINGS_COL),
    where("roomId", "==", roomId),
    where("status", "in", ["Pending", "Approved", "Checked In"]),
  );
  const conflictsSnap = await getDocs(conflictsQuery);
  const hasConflict = conflictsSnap.docs.some((conflictDoc) => {
    const b = conflictDoc.data();
    const bIn = toDate(b.checkInDate);
    const bOut = toDate(b.checkOutDate);
    return checkIn < bOut && checkOut > bIn;
  });

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

    const totalCost = Number(dataOr(roomData, "ratePerNight", 0)) * nights;

    const bookingRef = doc(collection(db, BOOKINGS_COL));
    transaction.set(bookingRef, {
      guestId,
      roomId,
      checkInDate: checkInTs,
      checkOutDate: checkOutTs,
      nights,
      totalCost,
      status: "Pending",
      bookingType: "Online",
      paxCount: Number(payload.paxCount ?? 1),
      specialRequests: payload.specialRequests ?? "",
      payment: {
        method: null,
        deposit: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { id: bookingRef.id, roomName: roomData.name || roomData.type || "Room" };
  }).then(async (result) => {
    try {
      // FO Notifications: ONLY notify real 'fo' staff
      // We look in the appropriate collection based on trainingMode
      const foUsers = await listUsers({ trainingMode }).then(users =>
        users.filter(u => u.role === "fo" && u.id !== guestId)
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
    const checkInStr = booking.checkInDate?.toDate
      ? booking.checkInDate.toDate().toLocaleDateString()
      : "unknown date";
    const foUsers = await listUsers({ trainingMode }).then((users) =>
      users.filter((u) => u.role === "fo"),
    );

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
 * A conflict is defined as a booking in status "Pending", "Approved", or "Checked In" 
 * that overlaps with [checkInStr, checkOutStr].
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

  const activeBookings = await listBookingsByStatuses(["Pending", "Approved", "Checked In"], { trainingMode });

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
      const foUsers = await listUsers({ trainingMode }).then(users => users.filter(u => u.role === "fo"));
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
