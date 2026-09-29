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
// Inbox must follow the training sandbox like every other collection — a
// hardcoded "notifications" writes training-mode demo alerts into production.
import { getCol } from "@/lib/db-utils";

/**
 * Creates a notification for a specific user.
 */
export async function createNotification(userId, { type, title, message, link }, { trainingMode = null } = {}) {
  if (!userId) return;
  const notifRef = doc(collection(db, getCol("notifications", trainingMode), userId, "items"));
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

const FANOUT_CHUNK_SIZE = 500;

/**
 * P1 scalability: fan-out to many users in batched commits (≤500 writes each)
 * instead of N individual setDocs. Same docs, same content, same recipients —
 * fewer RPC round-trips and a partial failure only loses one chunk instead of
 * aborting the whole fan-out. Note: billed writes are unchanged (Firestore
 * bills per document); true write reduction needs a pull model (P2).
 */
export async function createNotificationsBulk(recipients, { trainingMode = null } = {}) {
  const list = (recipients || []).filter((r) => r?.userId);
  let sent = 0;
  const errors = [];
  for (let i = 0; i < list.length; i += FANOUT_CHUNK_SIZE) {
    const chunk = list.slice(i, i + FANOUT_CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ userId, type, title, message, link }) => {
      const notifRef = doc(collection(db, getCol("notifications", trainingMode), userId, "items"));
      batch.set(notifRef, {
        id: notifRef.id,
        type,
        title,
        message,
        link: link || "/",
        isRead: false,
        createdAt: serverTimestamp(),
      });
    });
    try {
      await batch.commit();
      sent += chunk.length;
    } catch (e) {
      errors.push(e);
      console.error("[notificationService] fan-out chunk failed:", e);
    }
  }
  return { sent, failed: list.length - sent, errors };
}

/**
 * Marks a specific notification as read.
 */
export async function markAsRead(userId, notifId, { trainingMode = null } = {}) {
  if (!userId || !notifId) return;
  const notifRef = doc(db, getCol("notifications", trainingMode), userId, "items", notifId);
  await updateDoc(notifRef, { isRead: true });
}

/**
 * Marks all unread notifications as read.
 */
export async function markAllAsRead(userId, { trainingMode = null } = {}) {
  if (!userId) return;
  const q = query(
    collection(db, getCol("notifications", trainingMode), userId, "items"),
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
export function subscribeToNotifications(userId, callback, { trainingMode = null } = {}) {
  if (!userId) return () => {};

  const q = query(
    collection(db, getCol("notifications", trainingMode), userId, "items"),
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
