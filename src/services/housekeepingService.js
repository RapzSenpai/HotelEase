import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { isValidFoTransition } from "@/lib/room-status-transitions";
import { listFoUsers } from "./userService";
import { createNotification } from "./notificationService";

function housekeepingLogsCollection(trainingMode) {
  return getCol("housekeeping_logs", trainingMode);
}

export async function updateRoomStatus({
  roomId,
  newStatus,
  changedByRole = "fo",
  changedByUserId = null,
  changedByName = "",
  assignedToUserId = null,
  assignedToName = "",
  note = "",
  photoUrls = [],
  trainingMode = null,
}) {
  if (!roomId || typeof roomId !== "string")
    throw new Error("Invalid roomId passed to updateRoomStatus");
  if (!newStatus || typeof newStatus !== "string")
    throw new Error("Invalid newStatus passed to updateRoomStatus");

  return runTransaction(db, async (transaction) => {
    const roomsCol = getCol("rooms", trainingMode);
    const roomRef = doc(db, roomsCol, roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found.");

    const roomData = roomSnap.data() || {};
    const fromStatus = roomData.status || "Unknown";
    const isMidStay = !!roomData.isMidStayRequest;
    const guestIdForNotif = roomData.midStayGuestId || null;
    const midStayRequestId = roomData.midStayRequestId || null;

    // Enforce the room status state machine for FO moves. The FO housekeeping
    // page only moves rooms along valid transitions (Dirty -> Being Cleaned ->
    // Pending Approval -> Available, plus reject/re-clean paths).
    if (fromStatus !== newStatus && !isValidFoTransition(fromStatus, newStatus)) {
      throw new Error(
        `Invalid room status transition: ${fromStatus} -> ${newStatus}.`,
      );
    }

    const roomUpdate = {
      status: newStatus,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
    };

    if (newStatus === "Being Cleaned") {
      roomUpdate.cleaningStartedAt = serverTimestamp();
      roomUpdate.photoUrls = deleteField();
      if (assignedToUserId) {
        roomUpdate.assignedToUserId = assignedToUserId;
        roomUpdate.assignedToName = assignedToName || "";
      }
    }

    if (newStatus === "Pending Approval") {
      roomUpdate.photoUrls = Array.isArray(photoUrls) ? photoUrls : [];
    }

    if (newStatus === "Available") {
      roomUpdate.cleaningStartedAt = deleteField();
      roomUpdate.assignedToUserId = deleteField();
      roomUpdate.assignedToName = deleteField();
      roomUpdate.photoUrls = deleteField();
      if (isMidStay) {
        roomUpdate.isMidStayRequest = deleteField();
        roomUpdate.midStayNote = deleteField();
        roomUpdate.midStayGuestId = deleteField();
        roomUpdate.midStayGuestName = deleteField();
        roomUpdate.midStayBookingId = deleteField();
        roomUpdate.midStayRequestedAt = deleteField();
        roomUpdate.midStayRequestId = deleteField();
      }
    }

    const midStayBookingId = roomData.midStayBookingId || null;

    transaction.update(roomRef, roomUpdate);

    const logsCol = housekeepingLogsCollection(trainingMode);
    const logRef = doc(collection(db, logsCol));
    transaction.set(logRef, {
      roomId,
      bookingId: midStayBookingId || null,
      requestId: midStayRequestId || null,
      fromStatus,
      toStatus: newStatus,
      changedByRole,
      changedByUserId: changedByUserId || null,
      changedByName: changedByName || "",
      note: note || (isMidStay ? "[Mid-Stay Cleaning]" : ""),
      photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
      isMidStayRequest: isMidStay,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      ok: true,
      logId: logRef.id,
      roomName: roomData.name || roomData.type || "Room",
      newStatus,
      isMidStay,
      guestIdForNotif,
    };
  }).then(async (result) => {
    if (result.newStatus === "Dirty / Needs Cleaning") {
      try {
        const foUsers = await listFoUsers({ trainingMode });
        await Promise.all(foUsers.map(fo => createNotification(fo.id, {
          type: "room_dirty",
          title: "Room Needs Cleaning 🧹",
          message: `${result.roomName} is ready for housekeeping.`,
          link: "/fo/housekeeping"
        })));
      } catch(e) { console.error("Notif error", e); }
    }

    if (result.isMidStay && result.guestIdForNotif) {
      try {
        if (result.newStatus === "Being Cleaned") {
          await createNotification(result.guestIdForNotif, {
            type: "housekeeping_in_progress",
            title: "Housekeeping in Progress 🧹",
            message: `Housekeeping staff is currently cleaning your room (${result.roomName}).`,
            link: "/housekeeping",
          });
        } else if (result.newStatus === "Available") {
          await createNotification(result.guestIdForNotif, {
            type: "housekeeping_done",
            title: "Housekeeping Completed ✨",
            message: `Your room (${result.roomName}) has been cleaned! Check your booking to view photos or leave feedback.`,
            link: "/housekeeping",
          });
        }
      } catch (e) {
        console.error("Guest mid-stay notif error", e);
      }
    }

    return { ok: true, logId: result.logId };
  });
}

export async function requestMidStayHousekeeping({
  roomId,
  bookingId,
  guestId,
  guestName,
  note = "",
  trainingMode = null,
}) {
  if (!roomId) throw new Error("Invalid roomId passed to requestMidStayHousekeeping");
  if (!bookingId) throw new Error("A bookingId is required for a mid-stay housekeeping request.");

  return runTransaction(db, async (transaction) => {
    const roomsCol = getCol("rooms", trainingMode);
    const roomRef = doc(db, roomsCol, roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found.");

    const roomData = roomSnap.data();
    const fromStatus = roomData?.status || "Occupied / Checked In";

    if (roomData?.isMidStayRequest) {
      // Lifecycle hygiene: if the flagged request belongs to a booking that is
      // no longer checked in (checked out, cancelled, etc.), it is stale —
      // clear it and allow a fresh request. Otherwise block.
      const midBookingId = roomData.midStayBookingId;
      let midStatus = null;
      if (midBookingId) {
        const midBookingRef = doc(db, getCol("bookings", trainingMode), midBookingId);
        const midBookingSnap = await transaction.get(midBookingRef);
        midStatus = midBookingSnap.exists() ? midBookingSnap.data()?.status : null;
      }
      if (midStatus !== "Checked In") {
        transaction.update(roomRef, {
          isMidStayRequest: deleteField(),
          midStayNote: deleteField(),
          midStayGuestId: deleteField(),
          midStayGuestName: deleteField(),
          midStayBookingId: deleteField(),
          midStayRequestedAt: deleteField(),
          midStayRequestId: deleteField(),
        });
      } else {
        throw new Error(
          "There is already a housekeeping request in progress for this room. Please wait for it to be completed.",
        );
      }
    }

    // The request log is the origin of this request cycle; its id becomes the
    // requestId stamped on the room and every log entry of the cycle.
    const logsCol = housekeepingLogsCollection(trainingMode);
    const logRef = doc(collection(db, logsCol));
    const requestId = logRef.id;

    transaction.update(roomRef, {
      status: "Dirty / Needs Cleaning",
      isMidStayRequest: true,
      midStayNote: note || "",
      midStayGuestId: guestId || null,
      midStayGuestName: guestName || "Guest",
      midStayBookingId: bookingId,
      midStayRequestId: requestId,
      midStayRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
    });

    transaction.set(logRef, {
      roomId,
      bookingId,
      requestId,
      fromStatus,
      toStatus: "Dirty / Needs Cleaning",
      changedByRole: "guest",
      changedByUserId: guestId || null,
      changedByName: guestName || "Guest",
      isMidStayRequest: true,
      note: note ? `[Mid-Stay Request] ${note}` : "[Mid-Stay Request]",
      photoUrls: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      ok: true,
      logId: logRef.id,
      roomName: roomData.name || roomData.type || "Room",
    };
  }).then(async (result) => {
    try {
      const foUsers = await listFoUsers({ trainingMode });
      await Promise.all(
        foUsers.map((fo) =>
          createNotification(fo.id, {
            type: "room_dirty",
            title: "Mid-Stay Cleaning Requested 🧹",
            message: `Guest (${guestName}) requested cleaning for ${result.roomName}${
              note ? `: "${note}"` : "."
            }`,
            link: "/fo/housekeeping",
          }),
        ),
      );
    } catch (e) {
      console.error("Notif error", e);
    }
    return { ok: true, logId: result.logId };
  });
}

/**
 * Cancel a pending mid-stay housekeeping request. Guests may cancel their own
 * request while the room is still "Dirty / Needs Cleaning" (before cleaning
 * starts); FO may cancel at that stage as well. The room reverts to
 * "Occupied / Checked In" and all mid-stay fields are cleared.
 */
export async function cancelMidStayRequest({
  roomId,
  bookingId,
  cancelledByRole = "guest",
  cancelledByUserId = null,
  cancelledByName = "",
  reason = "",
  trainingMode = null,
}) {
  if (!roomId || !bookingId)
    throw new Error("Invalid roomId/bookingId passed to cancelMidStayRequest");

  return runTransaction(db, async (transaction) => {
    const roomsCol = getCol("rooms", trainingMode);
    const roomRef = doc(db, roomsCol, roomId);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) throw new Error("Room not found.");

    const roomData = roomSnap.data() || {};
    if (!roomData.isMidStayRequest) {
      throw new Error("No active housekeeping request to cancel.");
    }
    if (cancelledByRole === "guest" && roomData.midStayBookingId !== bookingId) {
      throw new Error("This housekeeping request does not belong to your booking.");
    }
    if (roomData.status !== "Dirty / Needs Cleaning") {
      throw new Error(
        "This request can no longer be cancelled — cleaning may already be in progress. Please contact Front Office.",
      );
    }

    const fromStatus = roomData.status;
    const requestId = roomData.midStayRequestId || null;

    transaction.update(roomRef, {
      status: "Occupied / Checked In",
      isMidStayRequest: deleteField(),
      midStayNote: deleteField(),
      midStayGuestId: deleteField(),
      midStayGuestName: deleteField(),
      midStayBookingId: deleteField(),
      midStayRequestedAt: deleteField(),
      midStayRequestId: deleteField(),
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
    });

    const logsCol = housekeepingLogsCollection(trainingMode);
    const logRef = doc(collection(db, logsCol));
    transaction.set(logRef, {
      roomId,
      bookingId,
      requestId,
      fromStatus,
      toStatus: "Occupied / Checked In",
      changedByRole: cancelledByRole,
      changedByUserId: cancelledByUserId || null,
      changedByName: cancelledByName || "",
      isMidStayRequest: true,
      note: reason ? `[Mid-Stay Request Cancelled] ${reason}` : "[Mid-Stay Request Cancelled]",
      photoUrls: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      ok: true,
      logId: logRef.id,
      roomName: roomData.name || roomData.type || "Room",
      guestIdForNotif: roomData.midStayGuestId || null,
    };
  }).then(async (result) => {
    if (cancelledByRole === "fo" && result.guestIdForNotif) {
      try {
        await createNotification(result.guestIdForNotif, {
          type: "housekeeping_cancelled",
          title: "Housekeeping Request Cancelled",
          message: `Your housekeeping request for ${result.roomName} was cancelled${
            reason ? ` (${reason})` : "."
          }`,
          link: "/housekeeping",
        });
      } catch (e) {
        console.error("Guest cancel notif error", e);
      }
    }
    return { ok: true, logId: result.logId };
  });
}

/**
 * Persist verification photos as they are uploaded so a page reload (or a
 * status move) never loses them. FO-only operation.
 */
export async function saveHousekeepingPhotos({
  roomId,
  photoUrls = [],
  trainingMode = null,
}) {
  if (!roomId || typeof roomId !== "string")
    throw new Error("Invalid roomId passed to saveHousekeepingPhotos");
  const roomsCol = getCol("rooms", trainingMode);
  await updateDoc(doc(db, roomsCol, roomId), {
    photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
    updatedAt: serverTimestamp(),
  });
  return { ok: true };
}

/**
 * Rate the completed housekeeping job for a request. The rating is stored
 * directly on the completion log (the log whose toStatus is "Available"), so
 * it is inherently tied to the exact request and never pollutes the public
 * room reviews collection. FO staff are notified.
 */
export async function rateHousekeeping({
  logId,
  rating,
  feedback = "",
  roomName = "",
  trainingMode = null,
}) {
  if (!logId) throw new Error("Invalid logId passed to rateHousekeeping");
  const stars = Math.min(5, Math.max(1, Math.round(Number(rating) || 1)));
  const logsCol = housekeepingLogsCollection(trainingMode);
  await updateDoc(doc(db, logsCol, logId), {
    rating: stars,
    ratingFeedback: String(feedback || "").slice(0, 1000),
    ratedAt: serverTimestamp(),
  });

  try {
    const foUsers = await listFoUsers({ trainingMode });
    await Promise.all(
      foUsers.map((fo) =>
        createNotification(fo.id, {
          type: "housekeeping_rated",
          title: "Guest Rated Housekeeping ⭐",
          message: `A guest rated the housekeeping for ${roomName || "a room"} ${stars}/5.`,
          link: "/fo/housekeeping",
        }),
      ),
    );
  } catch (e) {
    console.error("Notif error", e);
  }
  return { ok: true };
}

export async function assignHousekeepingStaff({
  roomId,
  assignedToUserId,
  assignedToName = "",
  trainingMode = null,
}) {
  if (!roomId || typeof roomId !== "string")
    throw new Error("Invalid roomId passed to assignHousekeepingStaff");

  const roomsCol = getCol("rooms", trainingMode);
  const roomRef = doc(db, roomsCol, roomId);
  await updateDoc(roomRef, {
    assignedToUserId: assignedToUserId || null,
    assignedToName: assignedToName || "",
    updatedAt: serverTimestamp(),
  });
  return { ok: true };
}

export async function bulkUpdateRoomStatus({
  roomIds,
  newStatus,
  trainingMode = null,
  ...options
}) {
  if (!Array.isArray(roomIds) || roomIds.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const results = await Promise.allSettled(
    roomIds.map((roomId) =>
      updateRoomStatus({
        roomId,
        newStatus,
        trainingMode,
        ...options,
      }),
    ),
  );

  const succeeded = [];
  const failed = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      succeeded.push(roomIds[index]);
    } else {
      failed.push({ roomId: roomIds[index], error: result.reason });
    }
  });

  return { succeeded, failed };
}

export async function listHousekeepingLogsForRoom(
  roomId,
  { trainingMode = null } = {},
) {
  if (!roomId || typeof roomId !== "string") return [];

  const logsCol = housekeepingLogsCollection(trainingMode);

  // Try ordered query first, fall back to unordered if missing index
  let snap;
  try {
    const q = query(
      collection(db, logsCol),
      where("roomId", "==", roomId),
      orderBy("createdAt", "desc"),
    );
    snap = await getDocs(q);
  } catch (err) {
    console.warn(
      "[housekeepingService] Ordered query failed (missing index?), falling back to unordered:",
      err?.message,
    );
    const qFallback = query(
      collection(db, logsCol),
      where("roomId", "==", roomId),
    );
    snap = await getDocs(qFallback);
  }

  const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Sort client-side by createdAt desc as fallback
  logs.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0;
    return bTime - aTime;
  });

  return logs;
}

export function subscribeToHousekeepingLogsForRoom(
  roomId,
  callback,
  { trainingMode = null } = {},
) {
  if (!roomId || typeof roomId !== "string") {
    callback([]);
    return () => {};
  }

  const logsCol = housekeepingLogsCollection(trainingMode);
  const q = query(
    collection(db, logsCol),
    where("roomId", "==", roomId),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(
    q,
    (snap) => {
      const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(logs);
    },
    (err) => {
      console.warn(
        "[housekeepingService] onSnapshot error, falling back to getDocs:",
        err?.message,
      );
      // Fallback: try without orderBy
      const qFallback = query(
        collection(db, logsCol),
        where("roomId", "==", roomId),
      );
      getDocs(qFallback)
        .then((fallbackSnap) => {
          const logs = fallbackSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          logs.sort((a, b) => {
            const aTime =
              a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0;
            const bTime =
              b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0;
            return bTime - aTime;
          });
          callback(logs);
        })
        .catch(() => callback([]));
    },
  );
}
