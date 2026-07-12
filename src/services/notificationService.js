import {
  collection,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp,
  where
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";

/**
 * Creates a notification for a specific user.
 */
export async function createNotification(userId, { type, title, message, link }) {
  if (!userId) return;
  const notifRef = doc(collection(db, "notifications", userId, "items"));
  await setDoc(notifRef, {
    id: notifRef.id,
    type,
    title,
    message,
    link: link || "/",
    isRead: false,
    createdAt: serverTimestamp()
  });
}

/**
 * Marks a specific notification as read.
 */
export async function markAsRead(userId, notifId) {
  if (!userId || !notifId) return;
  const notifRef = doc(db, "notifications", userId, "items", notifId);
  await updateDoc(notifRef, { isRead: true });
}

/**
 * Marks all unread notifications as read.
 */
export async function markAllAsRead(userId) {
  if (!userId) return;
  const q = query(
    collection(db, "notifications", userId, "items"),
    where("isRead", "==", false)
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, { isRead: true });
  });

  await batch.commit();
}

/**
 * Subscribes to the latest 20 notifications for a user.
 */
export function subscribeToNotifications(userId, callback) {
  if (!userId) return () => {};

  const q = query(
    collection(db, "notifications", userId, "items"),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(notifications);
  }, (error) => {
    console.error("Error subscribing to notifications:", error);
  });
}
