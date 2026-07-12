import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";

function favoritesCollection(userId) {
  return collection(db, "users", userId, "favorites");
}

function favoriteDoc(userId, roomId) {
  return doc(db, "users", userId, "favorites", roomId);
}

export function subscribeToFavorites(userId, callback) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const q = query(favoritesCollection(userId), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error("[favoritesService] subscribeToFavorites error:", error);
      callback([]);
    },
  );
}

export async function addFavorite(userId, roomId) {
  if (!userId || !roomId) throw new Error("User and room are required.");
  await setDoc(favoriteDoc(userId, roomId), {
    roomId,
    createdAt: serverTimestamp(),
  });
  return true;
}

export async function removeFavorite(userId, roomId) {
  if (!userId || !roomId) throw new Error("User and room are required.");
  await deleteDoc(favoriteDoc(userId, roomId));
  return true;
}

export async function toggleFavorite(userId, roomId) {
  if (!userId || !roomId) throw new Error("User and room are required.");

  const ref = favoriteDoc(userId, roomId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }

  await setDoc(ref, {
    roomId,
    createdAt: serverTimestamp(),
  });
  return true;
}
