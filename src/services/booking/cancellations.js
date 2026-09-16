import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { createNotification } from "../notificationService";
import { listFoUsers } from "../userService";
import { bookingsCollection, releaseAvailabilityMarkers } from "./core";

/**
 * Every path that ends a booking early: rejecting a request, cancelling, the
 * guest-initiated request, and the front office's approve/reject of that
 * request. Each one frees the availability markers on the way out. Moved from
 * bookingsService without changes.
 */

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

    // PROD: free the availability markers for this booking's nights. A
    // rejected booking must never leave orphan blocks on room_availability
    // (same pattern as cancelBooking / approveCancellation / expiry sweep).
    if (!trainingMode) await releaseAvailabilityMarkers(booking);

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
    if (!trainingMode) await releaseAvailabilityMarkers(booking);

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
    if (!trainingMode) await releaseAvailabilityMarkers(booking);

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
