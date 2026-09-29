import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { listRooms } from "@/services/roomsService";

const ALERTS_COL = "system_alerts";

export const SEVERITIES = ["critical", "high", "medium", "low"];

/**
 * Create a system alert.
 * @param {Object} params
 * @param {string} params.type - 'system_error' | 'quota' | 'payment_failed' | 'unusual_activity' | 'manual'
 * @param {'critical'|'high'|'medium'|'low'} params.severity
 * @param {string} params.title
 * @param {string} [params.message]
 * @param {Object} [params.metadata]
 * @param {boolean} [params.trainingMode]
 * @returns {Promise<{ id: string }>}
 */
export async function createAlert({
  type = "manual",
  severity = "medium",
  title,
  message = "",
  metadata = {},
  trainingMode = false,
} = {}) {
  if (!title) throw new Error("Alert title is required.");
  if (!SEVERITIES.includes(severity)) {
    throw new Error(`Unsupported alert severity "${severity}". Expected one of: ${SEVERITIES.join(", ")}`);
  }
  const col = getCol(ALERTS_COL, trainingMode);
  const ref = await addDoc(collection(db, col), {
    type,
    severity,
    title,
    message,
    metadata,
    status: "unresolved",
    createdAt: serverTimestamp(),
    resolvedAt: null,
  });
  return { id: ref.id };
}

/**
 * Subscribe to system alerts, unresolved-first.
 * @param {Function} callback
 * @param {Object} options
 * @param {boolean} options.trainingMode
 * @returns {() => void} Unsubscribe function
 */
// The list stays bounded; separate Firestore buckets enforce priority before
// each bucket's limit is applied.
export const ALERTS_PAGE_SIZE = 500;
const ALERT_BUCKETS = ["unresolved", "resolved"].flatMap((status) =>
  SEVERITIES.map((severity) => ({ status, severity })),
);

export function subscribeToAlerts(callback, { trainingMode = false, limitCount = ALERTS_PAGE_SIZE } = {}) {
  const col = getCol(ALERTS_COL, trainingMode);
  const bucketAlerts = new Map();
  const publish = () => callback(
    ALERT_BUCKETS.flatMap(({ status, severity }) =>
      bucketAlerts.get(`${status}:${severity}`) || [],
    ).slice(0, limitCount),
  );
  const unsubscribers = ALERT_BUCKETS.map(({ status, severity }) => {
    const key = `${status}:${severity}`;
    return onSnapshot(
      query(
        collection(db, col),
        where("status", "==", status),
        where("severity", "==", severity),
        orderBy("createdAt", "desc"),
        limit(limitCount),
      ),
      (snap) => {
        bucketAlerts.set(key, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        publish();
      },
      (error) => {
        console.error("[alertService] subscribeToAlerts error:", error);
        bucketAlerts.set(key, []);
        publish();
      },
    );
  });
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

/**
 * Exact unresolved-alert count, polled independently from the bounded list.
 */
export function subscribeToUnresolvedCount(callback, { trainingMode = false } = {}) {
  const col = getCol(ALERTS_COL, trainingMode);
  let active = true;
  let requestSequence = 0;
  const refresh = () => {
    const request = ++requestSequence;
    getCountFromServer(query(collection(db, col), where("status", "==", "unresolved")))
      .then((snap) => {
        if (active && request === requestSequence) callback(snap.data().count);
      })
      .catch((e) => {
        console.error("[alertService] unresolved count failed:", e);
        if (active && request === requestSequence) callback(0);
      });
  };
  refresh();
  const interval = setInterval(refresh, 30000);
  return () => {
    active = false;
    requestSequence += 1;
    clearInterval(interval);
  };
}

/**
 * Fetch unresolved alerts once. Used by auto-scan dedup.
 * @param {boolean} [trainingMode]
 * @returns {Promise<Array>}
 */
export async function listAlerts({ trainingMode = false, status = null, limitCount = ALERTS_PAGE_SIZE } = {}) {
  const col = getCol(ALERTS_COL, trainingMode);
  const base = collection(db, col);
  const constraints = status ? [where("status", "==", status)] : [];
  const q = query(base, ...constraints, limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Mark an alert resolved.
 * @param {string} alertId
 * @param {boolean} [trainingMode]
 */
export async function resolveAlert(alertId, { trainingMode = false } = {}) {
  if (!alertId) throw new Error("Invalid alertId");
  const col = getCol(ALERTS_COL, trainingMode);
  await updateDoc(doc(db, col, alertId), {
    status: "resolved",
    resolvedAt: serverTimestamp(),
  });
  return { ok: true };
}

/**
 * Delete an alert permanently.
 * @param {string} alertId
 * @param {boolean} [trainingMode]
 */
export async function deleteAlert(alertId, { trainingMode = false } = {}) {
  if (!alertId) throw new Error("Invalid alertId");
  const col = getCol(ALERTS_COL, trainingMode);
  await deleteDoc(doc(db, col, alertId));
  return { ok: true };
}

/**
 * Auto-detect operational issues and raise alerts once per issue.
 * Currently scans rooms for long-neglected dirty rooms and out-of-order
 * rooms. Designed to be called from the admin alerts page on load.
 * @param {Object} params
 * @param {boolean} params.trainingMode
 * @returns {Promise<{ created: number }>}
 */
/**
 * Targeted dedup check: does an UNRESOLVED alert with this key exist?
 * Single-field query (no composite index) over a tiny key-scoped set, so it
 * stays exact no matter how many unresolved alerts exist — unlike scanning
 * the capped listAlerts window.
 */
async function hasUnresolvedDedupKey(key, trainingMode) {
  const col = getCol(ALERTS_COL, trainingMode);
  const snap = await getDocs(
    query(
      collection(db, col),
      where("metadata.dedupKey", "==", key),
      where("status", "==", "unresolved"),
      limit(1),
    ),
  );
  return !snap.empty;
}

export async function scanAndCreateAlerts({ trainingMode = false } = {}) {
  const created = [];

  async function createOnce(key, payload) {
    if (await hasUnresolvedDedupKey(key, trainingMode)) return;
    created.push(createAlert({ ...payload, trainingMode }));
  }

  const rooms = await listRooms({ trainingMode });
  const dirtyCount = rooms.filter(
    (r) => r.status === "Dirty / Needs Cleaning"
  ).length;
  const outOfOrder = rooms.filter((r) => r.status === "Out of Order");

  if (dirtyCount >= 5) {
    await createOnce("dirty-rooms-5", {
      type: "system_issue",
      severity: "medium",
      title: `${dirtyCount} rooms need cleaning`,
      message: "Multiple rooms are marked Dirty. Housekeeping may be backed up.",
      metadata: { dedupKey: "dirty-rooms-5", roomCount: dirtyCount },
    });
  }

  if (outOfOrder.length > 0) {
    for (const room of outOfOrder.slice(0, 3)) {
      const key = `out-of-order-${room.roomNumber || room.id}`;
      await createOnce(key, {
        type: "system_issue",
        severity: "high",
        title: `Room ${room.roomNumber || room.id} is out of order`,
        message:
          room.emergencyNote ||
          "This room is flagged Out of Order and cannot be booked.",
        metadata: { dedupKey: key, roomId: room.id },
      });
    }
  }

  await Promise.all(created);
  return { created: created.length };
}