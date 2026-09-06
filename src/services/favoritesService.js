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
import { getCol } from "@/lib/db-utils";

// Favorites live under the user doc — prod users/{uid}/favorites, sandbox
// training_guests/{uid}/favorites — so routing follows the users collection.
function favoritesCollection(userId, trainingMode = null) {
  return collection(db, getCol("users", trainingMode), userId, "favorites");
}

function favoriteDoc(userId, roomId, trainingMode = null) {
  return doc(db, getCol("users", trainingMode), userId, "favorites", roomId);
}

export function subscribeToFavorites(userId, callback, { trainingMode = null } = {}) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const q = query(favoritesCollection(userId, trainingMode), orderBy("createdAt", "desc"));

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

export async function addFavorite(userId, roomId, { trainingMode = null } = {}) {
  if (!userId || !roomId) throw new Error("User and room are required.");
  await setDoc(favoriteDoc(userId, roomId, trainingMode), {
    roomId,
    createdAt: serverTimestamp(),
  });
  return true;
}

export async function removeFavorite(userId, roomId, { trainingMode = null } = {}) {
  if (!userId || !roomId) throw new Error("User and room are required.");
  await deleteDoc(favoriteDoc(userId, roomId, trainingMode));
  return true;
}

export async function toggleFavorite(userId, roomId, { trainingMode = null } = {}) {
  if (!userId || !roomId) throw new Error("User and room are required.");

  const ref = favoriteDoc(userId, roomId, trainingMode);
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
