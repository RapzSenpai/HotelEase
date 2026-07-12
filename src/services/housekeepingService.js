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
import { listUsers } from "./userService";
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

    const fromStatus = roomSnap.data()?.status || "Unknown";

    const roomUpdate = {
      status: newStatus,
      updatedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
    };

    if (newStatus === "Being Cleaned") {
      roomUpdate.cleaningStartedAt = serverTimestamp();
      if (assignedToUserId) {
        roomUpdate.assignedToUserId = assignedToUserId;
        roomUpdate.assignedToName = assignedToName || "";
      }
    }

    if (newStatus === "Available") {
      roomUpdate.cleaningStartedAt = deleteField();
      roomUpdate.assignedToUserId = deleteField();
      roomUpdate.assignedToName = deleteField();
    }

    transaction.update(roomRef, roomUpdate);

    const logsCol = housekeepingLogsCollection(trainingMode);
    const logRef = doc(collection(db, logsCol));
    transaction.set(logRef, {
      roomId,
      fromStatus,
      toStatus: newStatus,
      changedByRole,
      changedByUserId: changedByUserId || null,
      changedByName: changedByName || "",
      note: note || "",
      photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { ok: true, logId: logRef.id, roomName: roomSnap.data().name || roomSnap.data().type || "Room", newStatus };
  }).then(async (result) => {
    if (result.newStatus === "Dirty / Needs Cleaning") {
      try {
        const foUsers = await listUsers({ trainingMode }).then(users => users.filter(u => u.role === "fo"));
        await Promise.all(foUsers.map(fo => createNotification(fo.id, {
          type: "room_dirty",
          title: "Room Needs Cleaning 🧹",
          message: `${result.roomName} is ready for housekeeping.`,
          link: "/fo/housekeeping"
        })));
      } catch(e) { console.error("Notif error", e); }
    }
    return { ok: true, logId: result.logId };
  });
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

  console.log(
    `[housekeepingService] Raw snapshot for roomId=${roomId}, collection=${logsCol}, size=${snap.size}`,
    snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  );

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
      console.log(
        `[housekeepingService] onSnapshot for roomId=${roomId}, size=${snap.size}`,
      );
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
