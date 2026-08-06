import { collection, addDoc, query, where, orderBy, onSnapshot, getDocs, limit, getDoc, doc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

/**
 * Log an audit event
 * @param {Object} params
 * @param {string} params.actionType - Type of action (e.g., 'USER_ROLE_CHANGE', 'ROOM_UPDATE', 'BOOKING_CANCEL')
 * @param {string} params.userId - User ID who performed the action
 * @param {string} params.userEmail - Email of user who performed the action
 * @param {string} params.userRole - Role of user who performed the action
 * @param {string} params.targetId - ID of the target entity (user, room, booking, etc.)
 * @param {string} params.targetType - Type of target entity ('user', 'room', 'booking', etc.)
 * @param {Object} params.changes - Object describing what changed (before/after values)
 * @param {string} params.description - Human-readable description of the action
 * @param {Object} params.metadata - Additional metadata
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @returns {Promise<void>}
 */
export async function logAuditEvent(
  {
    actionType,
    userId,
    userEmail,
    userRole,
    targetId,
    targetType,
    changes = {},
    description,
    metadata = {},
  },
  { trainingMode = false } = {}
) {
  const col = getCol("audit_logs", trainingMode);
  const ref = collection(db, col);

  await addDoc(ref, {
    actionType,
    userId,
    userEmail,
    userRole,
    targetId,
    targetType,
    changes,
    description,
    metadata,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log an audit event using the currently authenticated user as the actor.
 * Never throws — audit failures should not break the underlying action.
 * @param {string} actionType - Action type (see AUDIT_ACTIONS)
 * @param {Object} params
 * @param {string} [params.targetId] - Target entity ID
 * @param {string} [params.targetType] - Target entity type ('user', 'room', 'booking', ...)
 * @param {Object} [params.changes] - Before/after values
 * @param {string} [params.description] - Human-readable description
 * @param {Object} [params.metadata] - Extra metadata
 * @param {boolean} [params.trainingMode] - Whether the action happened in training mode
 * @returns {Promise<void>}
 */
export async function auditAction(
  actionType,
  { targetId, targetType, changes = {}, description, metadata = {}, trainingMode = false } = {}
) {
  try {
    const authUser = getAuth().currentUser;
    if (!authUser) return;

    let actorRole = null;
    try {
      const snap = await getDoc(doc(db, getCol("users", trainingMode), authUser.uid));
      actorRole = snap.exists() ? snap.data().role || null : null;
    } catch {
      // Role lookup failure shouldn't block the audit write
    }

    await logAuditEvent(
      {
        actionType,
        userId: authUser.uid,
        userEmail: authUser.email || null,
        userRole: actorRole,
        targetId,
        targetType,
        changes,
        description,
        metadata,
      },
      { trainingMode }
    );
  } catch (e) {
    console.error("Audit log write failed:", e);
  }
}

/**
 * Subscribe to audit logs with optional filters
 * @param {Object} params
 * @param {string} params.actionType - Filter by action type
 * @param {string} params.userId - Filter by user ID
 * @param {string} params.targetType - Filter by target type
 * @param {number} params.limit - Maximum number of logs to return
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @param {Function} options.onData - Callback for data updates
 * @param {Function} options.onError - Callback for errors
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAuditLogs(
  { actionType, userId, targetType, limit: maxResults = 100 } = {},
  { trainingMode = false, onData, onError } = {}
) {
  const col = getCol("audit_logs", trainingMode);
  const ref = collection(db, col);
  
  let q = query(ref, orderBy("timestamp", "desc"));
  
  if (actionType) {
    q = query(q, where("actionType", "==", actionType));
  }
  if (userId) {
    q = query(q, where("userId", "==", userId));
  }
  if (targetType) {
    q = query(q, where("targetType", "==", targetType));
  }
  
  if (maxResults) {
    q = query(q, limit(maxResults));
  }

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      onData?.(logs);
    },
    (error) => {
      onError?.(error);
    }
  );

  return unsubscribe;
}

/**
 * Get audit logs once (not real-time)
 * @param {Object} params
 * @param {string} params.actionType - Filter by action type
 * @param {string} params.userId - Filter by user ID
 * @param {string} params.targetType - Filter by target type
 * @param {number} params.limit - Maximum number of logs to return
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @returns {Promise<Array>} Array of audit logs
 */
export async function getAuditLogs(
  { actionType, userId, targetType, limit: maxResults = 100 } = {},
  { trainingMode = false } = {}
) {
  const col = getCol("audit_logs", trainingMode);
  const ref = collection(db, col);
  
  let q = query(ref, orderBy("timestamp", "desc"));
  
  if (actionType) {
    q = query(q, where("actionType", "==", actionType));
  }
  if (userId) {
    q = query(q, where("userId", "==", userId));
  }
  if (targetType) {
    q = query(q, where("targetType", "==", targetType));
  }
  
  if (maxResults) {
    q = query(q, limit(maxResults));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Export audit logs to CSV
 * @param {Array} logs - Array of audit log objects
 * @returns {string} CSV string
 */
export function exportAuditLogsToCSV(logs) {
  const headers = [
    "Timestamp",
    "Action Type",
    "User Email",
    "User Role",
    "Target Type",
    "Target ID",
    "Description",
    "Changes",
  ];

  const rows = logs.map((log) => [
    log.timestamp,
    log.actionType,
    log.userEmail,
    log.userRole,
    log.targetType,
    log.targetId,
    log.description,
    JSON.stringify(log.changes),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const cellStr = String(cell || "");
          if (cellStr.includes(",") || cellStr.includes('"') || cellStr.includes("\n")) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        })
        .join(",")
    ),
  ].join("\n");

  return "\uFEFF" + csvContent;
}

/**
 * Download audit logs as CSV file
 * @param {Array} logs - Array of audit log objects
 * @param {string} filename - Name of the file to download
 */
export function downloadAuditLogsCSV(logs, filename = "audit-logs.csv") {
  const csv = exportAuditLogsToCSV(logs);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

// Action type constants for consistency
export const AUDIT_ACTIONS = {
  USER_ROLE_CHANGE: "USER_ROLE_CHANGE",
  USER_DELETE: "USER_DELETE",
  USER_FORCE_LOGOUT: "USER_FORCE_LOGOUT",
  ROOM_UPDATE: "ROOM_UPDATE",
  ROOM_STATUS_CHANGE: "ROOM_STATUS_CHANGE",
  BOOKING_CREATE: "BOOKING_CREATE",
  BOOKING_CANCEL: "BOOKING_CANCEL",
  BOOKING_UPDATE: "BOOKING_UPDATE",
  PAYMENT_PROCESS: "PAYMENT_PROCESS",
  PAYMENT_REFUND: "PAYMENT_REFUND",
  MAINTENANCE_MODE_TOGGLE: "MAINTENANCE_MODE_TOGGLE",
  TRAINING_MODE_TOGGLE: "TRAINING_MODE_TOGGLE",
  ANNOUNCEMENT_CREATE: "ANNOUNCEMENT_CREATE",
  ANNOUNCEMENT_UPDATE: "ANNOUNCEMENT_UPDATE",
  ANNOUNCEMENT_DELETE: "ANNOUNCEMENT_DELETE",
  SYSTEM_SETTINGS_CHANGE: "SYSTEM_SETTINGS_CHANGE",
};
