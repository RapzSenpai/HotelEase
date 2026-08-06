import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { isOnlineNow } from "@/services/presenceService";

/**
 * Subscribe to active users count in real-time
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @param {Function} callback - Callback function that receives the count
 * @returns {Function} Unsubscribe function
 */
export function subscribeToActiveUsersCount({ trainingMode = false }, callback) {
  const col = getCol("users", trainingMode);
  const q = query(collection(db, col), where("isOnline", "==", true));
  
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const activeUsers = snapshot.docs.map(doc => doc.data()).filter(u => isOnlineNow(u));
      callback(activeUsers.length);
    },
    (error) => {
      console.error("Error subscribing to active users:", error);
      callback(0);
    }
  );
  
  return unsubscribe;
}

/**
 * Subscribe to active users by role breakdown
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to use training collection
 * @param {Function} callback - Callback function that receives the breakdown
 * @returns {Function} Unsubscribe function
 */
export function subscribeToActiveUsersByRole({ trainingMode = false }, callback) {
  const col = getCol("users", trainingMode);
  const q = query(collection(db, col), where("isOnline", "==", true));
  
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data()).filter(u => isOnlineNow(u));
      const breakdown = {
        total: users.length,
        guest: users.filter(u => u.role === "guest").length,
        fo: users.filter(u => u.role === "fo").length,
        admin: users.filter(u => u.role === "admin").length,
      };
      callback(breakdown);
    },
    (error) => {
      console.error("Error subscribing to active users by role:", error);
      callback({ total: 0, guest: 0, fo: 0, admin: 0 });
    }
  );
  
  return unsubscribe;
}
