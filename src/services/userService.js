import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

/**
 * Firestore collections (from BSHM-PMS overview):
 * - `users`: { uid, role: 'guest' | 'fo' | 'admin', ... }
 * - `training_guests`: sandbox for training mode
 */

function usersCollection(trainingMode) {
  return getCol("users", trainingMode);
}

export async function getUserDoc(uid, { preferTraining = false } = {}) {
  const trainingCol = getCol("users", true);
  const primary = preferTraining ? trainingCol : "users";
  const secondary = preferTraining ? "users" : trainingCol;

  const pRef = doc(db, primary, uid);
  const pSnap = await getDoc(pRef);
  if (pSnap.exists()) return pSnap.data();

  const sRef = doc(db, secondary, uid);
  const sSnap = await getDoc(sRef);
  if (sSnap.exists()) return sSnap.data();

  return null;
}

export async function getUserRoleByUid(uid, { preferTraining = false } = {}) {
  const data = await getUserDoc(uid, { preferTraining });
  if (data && ["fo", "admin", "guest"].includes(data?.role)) return data.role;
  return "guest";
}


export async function createUserProfile({
  uid,
  email,
  role = "guest",
  fullName = "",
  phone = "",
  trainingMode = false,
} = {}) {
  const col = usersCollection(trainingMode);
  const ref = doc(db, col, uid);
  await setDoc(
    ref,
    { uid, email: email ?? null, fullName, phone, role, createdAt: serverTimestamp() },
    { merge: true }
  );
}

export async function listUsers({ trainingMode = false } = {}) {
  const col = usersCollection(trainingMode);
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to live changes in the users collection.
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to watch training_guests instead
 * @param {(users: Array) => void} options.onData - Callback receiving the full list
 * @param {(error: Error) => void} [options.onError] - Optional error callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToUsers({ trainingMode = false, onData, onError }) {
  const col = usersCollection(trainingMode);
  const unsub = onSnapshot(
    collection(db, col),
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => onError?.(error)
  );
  return unsub;
}

export async function updateUserProfile(uid, patch, { trainingMode = false } = {}) {
  if (!uid || typeof uid !== "string") throw new Error("Invalid uid passed to updateUserProfile");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Invalid patch passed to updateUserProfile");
  }

  const allowed = ["fullName", "phone", "photoUrl"];
  const invalid = Object.keys(patch).filter((k) => !allowed.includes(k));
  if (invalid.length > 0) {
    throw new Error(`Cannot update field(s): ${invalid.join(", ")}`);
  }

  const col = usersCollection(trainingMode);
  const ref = doc(db, col, uid);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  return { ok: true };
}

export async function setUserRole(uid, role, { trainingMode = false } = {}) {
  if (!uid || typeof uid !== "string") throw new Error("Invalid uid passed to setUserRole");

  const nextRole = String(role || "").trim();
  const allowed = ["guest", "fo", "admin"];
  if (!allowed.includes(nextRole)) throw new Error(`Invalid role. Allowed: ${allowed.join(", ")}`);

  const col = usersCollection(trainingMode);
  const ref = doc(db, col, uid);
  await updateDoc(ref, { role: nextRole, updatedAt: serverTimestamp() });
  return { ok: true };
}

export async function deleteUser(uid, { trainingMode = false } = {}) {
  if (!uid || typeof uid !== "string") throw new Error("Invalid uid passed to deleteUser");

  const col = usersCollection(trainingMode);
  const ref = doc(db, col, uid);
  await deleteDoc(ref);
  return { ok: true };
}

export async function updateLastLogin(uid, { trainingMode = false } = {}) {
  if (!uid || typeof uid !== "string") throw new Error("Invalid uid passed to updateLastLogin");

  const col = usersCollection(trainingMode);
  const ref = doc(db, col, uid);
  await updateDoc(ref, { 
    lastLoginAt: serverTimestamp(),
    lastLoginIp: null, // Can be enhanced later with IP detection
  });
  return { ok: true };
}

export async function setOnlineStatus(uid, isOnline, { trainingMode = false } = {}) {
  if (!uid || typeof uid !== "string") throw new Error("Invalid uid passed to setOnlineStatus");

  const col = usersCollection(trainingMode);
  const ref = doc(db, col, uid);
  await updateDoc(ref, { 
    isOnline,
    lastSeenAt: serverTimestamp(),
  });
  return { ok: true };
}
