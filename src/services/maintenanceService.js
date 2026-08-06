import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";

const MAINTENANCE_DOC_ID = "system";
const MAINTENANCE_COLLECTION = "system_settings";

/**
 * Get the current maintenance mode status
 * @returns {Promise<{enabled: boolean, message: string, startTime: string|null, endTime: string|null}>}
 */
export async function getMaintenanceStatus() {
  try {
    const docRef = doc(db, MAINTENANCE_COLLECTION, MAINTENANCE_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        enabled: data.maintenanceEnabled || false,
        message: data.maintenanceMessage || "System is currently under maintenance. Please try again later.",
        startTime: data.maintenanceStartTime || null,
        endTime: data.maintenanceEndTime || null,
      };
    }
    
    // Default: maintenance disabled
    return {
      enabled: false,
      message: "System is currently under maintenance. Please try again later.",
      startTime: null,
      endTime: null,
    };
  } catch (error) {
    console.error("Error fetching maintenance status:", error);
    // On error, assume maintenance is disabled to avoid blocking users
    return {
      enabled: false,
      message: "System is currently under maintenance. Please try again later.",
      startTime: null,
      endTime: null,
    };
  }
}

/**
 * Set maintenance mode status
 * @param {Object} params
 * @param {boolean} params.enabled - Whether maintenance mode is enabled
 * @param {string} params.message - Custom maintenance message
 * @param {string|null} params.startTime - Optional start time (ISO string)
 * @param {string|null} params.endTime - Optional end time (ISO string)
 * @returns {Promise<void>}
 */
export async function setMaintenanceStatus({ enabled, message, startTime, endTime }) {
  try {
    const docRef = doc(db, MAINTENANCE_COLLECTION, MAINTENANCE_DOC_ID);
    await setDoc(
      docRef,
      {
        maintenanceEnabled: enabled,
        maintenanceMessage: message || "System is currently under maintenance. Please try again later.",
        maintenanceStartTime: startTime || null,
        maintenanceEndTime: endTime || null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error setting maintenance status:", error);
    throw new Error("Failed to update maintenance status");
  }
}

/**
 * Subscribe to maintenance mode status changes
 * @param {Function} callback - Callback function that receives maintenance status
 * @returns {Function} Unsubscribe function
 */
export function subscribeToMaintenanceStatus(callback) {
  const docRef = doc(db, MAINTENANCE_COLLECTION, MAINTENANCE_DOC_ID);
  
  const unsubscribe = onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        callback({
          enabled: data.maintenanceEnabled || false,
          message: data.maintenanceMessage || "System is currently under maintenance. Please try again later.",
          startTime: data.maintenanceStartTime || null,
          endTime: data.maintenanceEndTime || null,
        });
      } else {
        // Default: maintenance disabled
        callback({
          enabled: false,
          message: "System is currently under maintenance. Please try again later.",
          startTime: null,
          endTime: null,
        });
      }
    },
    (error) => {
      console.error("Error subscribing to maintenance status:", error);
      // On error, assume maintenance is disabled
      callback({
        enabled: false,
        message: "System is currently under maintenance. Please try again later.",
        startTime: null,
        endTime: null,
      });
    }
  );
  
  return unsubscribe;
}
