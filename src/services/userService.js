import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, onSnapshot, query, where } from "firebase/firestore";
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
    { uid, email: email ?? null, fullName, phone, role, emailVerified: false, createdAt: serverTimestamp() },
    { merge: true }
  );
}

export async function listUsers({ trainingMode = false } = {}) {
  const col = usersCollection(trainingMode);
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Guest-safe way to fetch Front Office staff only. Guests can read FO-role
 * user docs (for cancellation/notification fan-out) but must NOT be able to
 * read other guests — so use this instead of listUsers() in guest flows.
 */
export async function listFoUsers({ trainingMode = false } = {}) {
  const col = usersCollection(trainingMode);
  const q = query(collection(db, col), where("role", "==", "fo"));
  const snap = await getDocs(q);
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

const DELETE_PROXY_URL = import.meta.env.VITE_GROQ_PROXY_URL;
const DELETE_PROXY_KEY = import.meta.env.VITE_DELETE_KEY;

/**
 * Permanently delete a user: Firebase Auth account + Firestore user docs.
 *
 * The web client is forbidden from deleting Auth accounts, so this goes through
 * the Cloudflare Worker (server-side) which holds the service-account key and a
 * shared DELETE_KEY. Requires VITE_GROQ_PROXY_URL + VITE_DELETE_KEY in .env.
 */
export async function deleteUserFully(uid) {
  if (!uid || typeof uid !== "string") throw new Error("Invalid uid passed to deleteUserFully");
  if (!DELETE_PROXY_URL || !DELETE_PROXY_KEY) {
    throw new Error("Full user deletion is not configured (missing VITE_GROQ_PROXY_URL / VITE_DELETE_KEY).");
  }

  const base = DELETE_PROXY_URL.replace(/\/+$/, "");
  const response = await fetch(`${base}/delete-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DELETE-KEY": DELETE_PROXY_KEY,
    },
    body: JSON.stringify({ uid }),
  });

  const data = await response.json().catch(() => ({}));

  // 404 auth_not_found: the Auth account is already gone, but Firestore docs
  // were still deleted — treat as a successful full deletion.
  if (response.status === 404 && data?.reason === "auth_not_found") {
    return { ...data, ok: true };
  }

  if (!response.ok) {
    const detail = data?.error || data?.detail || `HTTP ${response.status}`;
    throw new Error(`Failed to fully delete user: ${detail}`);
  }
  return data;
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
