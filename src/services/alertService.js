import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { listRooms } from "@/services/roomsService";

const ALERTS_COL = "system_alerts";

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

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
export function subscribeToAlerts(callback, { trainingMode = false } = {}) {
  const col = getCol(ALERTS_COL, trainingMode);
  return onSnapshot(
    query(collection(db, col)),
    (snap) => {
      const alerts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const sorted = [...alerts].sort((a, b) => {
        // Unresolved first, then by severity, then newest first
        if (a.status !== b.status) return a.status === "unresolved" ? -1 : 1;
        const sevDiff =
          (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
        if (sevDiff !== 0) return sevDiff;
        return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
      });
      callback(sorted);
    },
    (error) => {
      console.error("[alertService] subscribeToAlerts error:", error);
      callback([]);
    }
  );
}

/**
 * Count unresolved alerts.
 * @param {Function} callback
 * @param {Object} options
 * @param {boolean} options.trainingMode
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToUnresolvedCount(callback, { trainingMode = false } = {}) {
  const unsub = subscribeToAlerts(
    (alerts) => {
      const count = alerts.filter((a) => a.status === "unresolved").length;
      callback(count);
    },
    { trainingMode }
  );
  return () => unsub();
}

/**
 * Fetch unresolved alerts once. Used by auto-scan dedup.
 * @param {boolean} [trainingMode]
 * @returns {Promise<Array>}
 */
export async function listAlerts({ trainingMode = false, status = null } = {}) {
  const col = getCol(ALERTS_COL, trainingMode);
  const base = collection(db, col);
  const q = status ? query(base, where("status", "==", status)) : query(base);
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
export async function scanAndCreateAlerts({ trainingMode = false } = {}) {
  const created = [];
  const existing = await listAlerts({ trainingMode, status: "unresolved" });
  const existingKeys = new Set(
    existing
      .map((a) => a.metadata?.dedupKey)
      .filter(Boolean)
  );

  const rooms = await listRooms({ trainingMode });
  const dirtyCount = rooms.filter(
    (r) => r.status === "Dirty / Needs Cleaning"
  ).length;
  const outOfOrder = rooms.filter((r) => r.status === "Out of Order");

  if (dirtyCount >= 5 && !existingKeys.has("dirty-rooms-5")) {
    existingKeys.add("dirty-rooms-5");
    created.push(
      createAlert({
        type: "system_issue",
        severity: "medium",
        title: `${dirtyCount} rooms need cleaning`,
        message: "Multiple rooms are marked Dirty. Housekeeping may be backed up.",
        metadata: { dedupKey: "dirty-rooms-5", roomCount: dirtyCount },
        trainingMode,
      })
    );
  }

  if (outOfOrder.length > 0) {
    for (const room of outOfOrder.slice(0, 3)) {
      const key = `out-of-order-${room.roomNumber || room.id}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      created.push(
        createAlert({
          type: "system_issue",
          severity: "high",
          title: `Room ${room.roomNumber || room.id} is out of order`,
          message:
            room.emergencyNote ||
            "This room is flagged Out of Order and cannot be booked.",
          metadata: { dedupKey: key, roomId: room.id },
          trainingMode,
        })
      );
    }
  }

  await Promise.all(created);
  return { created: created.length };
}