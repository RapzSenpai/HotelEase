// Server-side admin authorization for the admin-only AI endpoints
// (/insights, /briefing, /admin-chat). A verified Firebase ID token proves
// *a signed-in user*, not the role — the role lives in Firestore, so read it
// with the service account and cache the verdict per isolate.
import { getGoogleAccessToken } from "./google-auth.js";
import { getFirestoreUserRole } from "./firestore.js";

const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;
const adminRoleCache = new Map(); // uid -> { isAdmin: boolean, at: number }

/**
 * True when the uid currently holds the admin role. Throws when the check
 * itself cannot run (missing service account, token exchange or network
 * failure) so the caller can fail closed with a retryable 503. A missing or
 * unreadable user doc resolves to false.
 */
export async function isAdminUser(workerEnv, uid) {
  const cached = adminRoleCache.get(uid);
  if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) return cached.isAdmin;

  const projectId = JSON.parse(workerEnv.FIREBASE_SERVICE_ACCOUNT || "").project_id;
  if (!projectId) throw new Error("FIREBASE_SERVICE_ACCOUNT has no project_id");
  const accessToken = await getGoogleAccessToken(workerEnv.FIREBASE_SERVICE_ACCOUNT);
  const role = await getFirestoreUserRole(accessToken, projectId, uid);
  const isAdmin = role === "admin";
  adminRoleCache.set(uid, { isAdmin, at: Date.now() });
  return isAdmin;
}

/** Test hook — clears the per-isolate cache. */
export function resetAdminRoleCache() {
  adminRoleCache.clear();
}
