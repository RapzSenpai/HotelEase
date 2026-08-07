import { doc, getDoc, onSnapshot, collection, getDocs, query, orderBy, limit, setDoc, addDoc } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";

const HEALTH_DOC_ID = "metrics";
const HEALTH_COLLECTION = "system_health";
const ERROR_LOGS_COLLECTION = "error_logs";

// Honest fallback: only mark the database as reachable (reading this doc proves
// connectivity). Metrics that cannot be computed client-side stay undefined so
// the UI shows "—" instead of a fabricated number.
const DEFAULT_HEALTH = {
  databaseStatus: "healthy",
  apiLatency: null,
  activeSessions: null,
  uptime: null,
  lastUpdated: null,
};

/**
 * Field names that are only ever seeded and never genuinely measured. Older
 * docs may still contain fabricated values we seeded before; strip them so the
 * UI shows "—" instead of a misleading number.
 */
const UNTRUSTED_FIELDS = new Set(["apiLatency", "activeSessions", "uptime"]);

function sanitizeHealth(data) {
  const out = { ...data };
  for (const field of UNTRUSTED_FIELDS) {
    if (field in out) out[field] = null;
  }
  return out;
}

/**
 * Get system health metrics
 * @returns {Promise<Object>} System health data
 */
export async function getSystemHealth() {
  try {
    const docRef = doc(db, HEALTH_COLLECTION, HEALTH_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return sanitizeHealth(docSnap.data());
    }
    
    // Return default health status if no data exists
    return { ...DEFAULT_HEALTH };
  } catch (error) {
    console.error("Error fetching system health:", error);
    // On error, still return the honest fallback so the dashboard stays usable
    return DEFAULT_HEALTH;
  }
}

/**
 * Initialize system health document with default values
 * @returns {Promise<void>}
 */
export async function initializeSystemHealth() {
  try {
    const docRef = doc(db, HEALTH_COLLECTION, HEALTH_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      await setDoc(docRef, DEFAULT_HEALTH);
    } else {
      // Overwrite stale seeded fields (e.g. fake uptime written before we
      // made the defaults honest) so real-time reads no longer surface them.
      const patches = {};
      for (const field of UNTRUSTED_FIELDS) {
        if (docSnap.data()[field] != null) patches[field] = null;
      }
      if (Object.keys(patches).length) await setDoc(docRef, { ...docSnap.data(), ...patches });
    }
  } catch (error) {
    console.error("Error initializing system health:", error);
  }
}

/**
 * Subscribe to system health metrics in real-time
 * @param {Function} callback - Callback function that receives health data
 * @returns {Function} Unsubscribe function
 */
export function subscribeToSystemHealth(callback) {
  const docRef = doc(db, HEALTH_COLLECTION, HEALTH_DOC_ID);
  
  const unsubscribe = onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        callback(sanitizeHealth(docSnap.data()));
      } else {
        // Default values if no data
        callback({ ...DEFAULT_HEALTH });
      }
    },
    (error) => {
      console.error("Error subscribing to system health:", error);
      callback({
        databaseStatus: "error",
        apiLatency: null,
        activeSessions: null,
        uptime: null,
        lastUpdated: new Date().toISOString(),
      });
    }
  );
  
  return unsubscribe;
}

/**
 * Get recent error logs
 * @param {number} limitCount - Number of errors to retrieve
 * @returns {Promise<Array>} Array of error logs
 */
export async function getRecentErrorLogs(limitCount = 10) {
  try {
    const q = query(
      collection(db, ERROR_LOGS_COLLECTION),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching error logs:", error);
    return [];
  }
}

/**
 * Log an error to the error logs collection
 * @param {Object} errorData
 * @param {string} errorData.message - Error message
 * @param {string} errorData.stack - Error stack trace
 * @param {string} errorData.component - Component where error occurred
 * @param {string} errorData.userId - User ID (optional)
 * @returns {Promise<void>}
 */
export async function logError({ message, stack, component, userId }) {
  try {
    await addDoc(collection(db, ERROR_LOGS_COLLECTION), {
      message,
      stack: stack || "",
      component: component || "",
      userId: userId || "",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log error:", error);
  }
}

/**
 * Measure API latency
 * @param {Function} apiCall - The API function to measure
 * @returns {Promise<{data: any, latency: number}>} API response and latency in ms
 */
export async function measureApiLatency(apiCall) {
  const startTime = performance.now();
  try {
    const data = await apiCall();
    const endTime = performance.now();
    return {
      data,
      latency: Math.round(endTime - startTime),
    };
  } catch (error) {
    const endTime = performance.now();
    throw {
      error,
      latency: Math.round(endTime - startTime),
    };
  }
}
