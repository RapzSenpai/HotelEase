import { collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit, serverTimestamp, setDoc, updateDoc, onSnapshot,
  query, where } from "firebase/firestore";
import { db, auth } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

/**
 * Firestore collections (from BSHM-PMS overview):
 * - `users`: { uid, role: 'guest' | 'fo' | 'admin', ... }
 * - `training_guests`: sandbox for training mode
 */

function usersCollection(trainingMode) {
  return getCol("users", trainingMode);
}

// Reserved docs that live in the users collection but are not people
// (session state). Never shown in user lists or counts.
export const NON_USER_DOC_IDS = ["system"];

export function isPersonDoc(docId) {
  return !NON_USER_DOC_IDS.includes(docId);
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
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => isPersonDoc(u.id));
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

// P1 scalability: role-scoped guest list for announcement fan-out. Same
// recipient set as listUsers().filter(role === "guest") without reading
// fo/admin docs; reserved non-person docs stay excluded either way.
export async function listGuests({ trainingMode = false } = {}) {
  const col = usersCollection(trainingMode);
  const q = query(collection(db, col), where("role", "==", "guest"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => isPersonDoc(u.id));
}

// P2 scalability: staff-only list for reassignment pickers. One `in` query
// instead of the whole users collection; single-field, no composite index.
export async function listStaffUsers({ trainingMode = false } = {}) {
  const col = usersCollection(trainingMode);
  const q = query(collection(db, col), where("role", "in", ["fo", "admin"]));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => isPersonDoc(u.id));
}

/**
 * Subscribe to live changes in the users collection.
 * @param {Object} options
 * @param {boolean} options.trainingMode - Whether to watch training_guests instead
 * @param {(users: Array) => void} options.onData - Callback receiving the full list
 * @param {(error: Error) => void} [options.onError] - Optional error callback
 * @returns {() => void} Unsubscribe function
 */
export const USERS_PAGE_SIZE = 50;

export function subscribeToUsers({ trainingMode = false, onData, onError, limit: maxDocs = null, role = null }) {
  const col = usersCollection(trainingMode);
  const constraints = [];
  if (role) constraints.push(where("role", "==", role));
  if (maxDocs) constraints.push(limit(maxDocs));
  const target = constraints.length ? query(collection(db, col), ...constraints) : collection(db, col);
  const unsub = onSnapshot(
    target,
    (snap) => {
      onData(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => isPersonDoc(u.id)),
      );
    },
    (error) => onError?.(error)
  );
  return unsub;
}

// Server-side counts so badges and the last-admin shield stay exact without
// loading the collection. Role equality needs no composite index.
export async function countUsers({ trainingMode = false, role = null } = {}) {
  const col = usersCollection(trainingMode);
  const target = role
    ? query(collection(db, col), where("role", "==", role))
    : collection(db, col);
  const snap = await getCountFromServer(target);
  return snap.data().count;
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

/**
 * Permanently delete a user: Firebase Auth account + Firestore user docs.
 *
 * Calls the Cloudflare Worker proxy (/delete-user), authenticated via the
 * signed-in admin's Firebase ID token.
 */
export async function deleteUserFully(uid) {
  if (!uid || typeof uid !== "string") throw new Error("Invalid uid passed to deleteUserFully");
  if (!DELETE_PROXY_URL) {
    throw new Error("Full user deletion is not configured (missing VITE_GROQ_PROXY_URL).");
  }

  const user = auth?.currentUser;
  let token = null;
  if (user && !user.isAnonymous) {
    token = await user.getIdToken().catch(() => null);
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const base = DELETE_PROXY_URL.replace(/\/+$/, "");
  const response = await fetch(`${base}/delete-user`, {
    method: "POST",
    headers,
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
