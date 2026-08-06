import { doc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

const MAX_SESSIONS = 10;

/**
 * Get device info from browser
 * @returns {Object} Device information
 */
function getDeviceInfo() {
  const userAgent = navigator.userAgent;
  let deviceType = "desktop";
  let browser = "unknown";
  let os = "unknown";

  // Detect device type
  if (/Mobile|Android|iPhone|iPad/i.test(userAgent)) {
    deviceType = "mobile";
  } else if (/Tablet/i.test(userAgent)) {
    deviceType = "tablet";
  }

  // Detect browser
  if (userAgent.includes("Chrome")) browser = "Chrome";
  else if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Safari")) browser = "Safari";
  else if (userAgent.includes("Edge")) browser = "Edge";

  // Detect OS
  if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Mac")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("iOS")) os = "iOS";

  return {
    deviceType,
    browser,
    os,
    userAgent: userAgent.substring(0, 200), // Truncate for storage
  };
}

/**
 * Create a new session for a user
 * @param {string} uid - User ID
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @returns {Promise<Object>} Session data
 */
export async function createSession(uid, { trainingMode = false } = {}) {
  const col = getCol("users", trainingMode);
  const ref = doc(db, col, uid);
  
  const deviceInfo = getDeviceInfo();
  const sessionId = crypto.randomUUID ? crypto.randomUUID() : `${uid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const session = {
    id: sessionId,
    deviceInfo,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    ipAddress: null, // Can be enhanced with IP detection service
    isActive: true,
  };

  // Cap the sessions array so the user doc doesn't grow unboundedly
  const userSnap = await getDoc(ref);
  const existing = userSnap.exists() ? userSnap.data().sessions || [] : [];
  const previous = Array.isArray(existing) ? existing : [];
  const sessions = [
    ...previous.filter((s) => s?.isActive !== false && s?.id !== sessionId),
    session,
  ].slice(-MAX_SESSIONS);

  await updateDoc(ref, {
    sessions,
    lastLoginDevice: deviceInfo,
  });

  return session;
}

/**
 * Update session last active timestamp
 * @param {string} uid - User ID
 * @param {string} sessionId - Session ID
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @returns {Promise<void>}
 */
export async function updateSessionActivity(uid, sessionId, { trainingMode = false } = {}) {
  const col = getCol("users", trainingMode);
  const ref = doc(db, col, uid);
  
  // This would require reading the user doc, updating the specific session, and writing back
  // For simplicity, we'll just update lastActiveAt in a separate field
  await updateDoc(ref, {
    currentSessionId: sessionId,
    lastSessionActiveAt: new Date().toISOString(),
  });
}

/**
 * Revoke a specific session
 * @param {string} uid - User ID
 * @param {string} sessionId - Session ID to revoke
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @returns {Promise<void>}
 */
export async function revokeSession(uid, sessionId, { trainingMode = false } = {}) {
  const col = getCol("users", trainingMode);
  const ref = doc(db, col, uid);
  
  // Mark session as inactive
  // Note: This requires reading the user doc first to get the session array
  // For now, we'll use a simpler approach with a separate revokedSessions array
  await updateDoc(ref, {
    revokedSessions: arrayUnion(sessionId),
  });
}

/**
 * Revoke all sessions except current
 * @param {string} uid - User ID
 * @param {string} currentSessionId - Current session ID to keep active
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @returns {Promise<void>}
 */
export async function revokeAllOtherSessions(uid, currentSessionId, { trainingMode = false } = {}) {
  const col = getCol("users", trainingMode);
  const ref = doc(db, col, uid);
  
  // Store the session to keep as the only active one
  await updateDoc(ref, {
    activeSessionId: currentSessionId,
    sessionRevokeTimestamp: new Date().toISOString(),
  });
}

/**
 * Force logout a user (revoke all sessions)
 * @param {string} uid - User ID
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @returns {Promise<void>}
 */
export async function forceLogoutUser(uid, { trainingMode = false } = {}) {
  const col = getCol("users", trainingMode);
  const ref = doc(db, col, uid);
  
  await updateDoc(ref, {
    forceLogout: true,
    forceLogoutTimestamp: new Date().toISOString(),
  });
}

/**
 * Clear force logout flag after user has been logged out
 * @param {string} uid - User ID
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @returns {Promise<void>}
 */
export async function clearForceLogout(uid, { trainingMode = false } = {}) {
  const col = getCol("users", trainingMode);
  const ref = doc(db, col, uid);
  
  await updateDoc(ref, {
    forceLogout: false,
  });
}
