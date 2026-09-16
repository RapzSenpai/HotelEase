// Moved verbatim from src/index.js — delete-user handler, no logic changes.
import { verifyFirebaseIdToken } from "../firebase-jwt.js";
import { getGoogleAccessToken } from "../google-auth.js";
import { deleteAuthAccount, deleteFirestoreDoc, deleteUserProfileWithAdminGuard, getFirestoreDoc, getFirestoreUserRole, listSubcollectionIds } from "../firestore.js";
import { json } from "../http.js";

export async function handleDeleteUser(request, workerEnv) {
  const sa = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    return json({ error: "FIREBASE_SERVICE_ACCOUNT secret is not configured." }, 500, request, workerEnv);
  }

  let projectId;
  try {
    projectId = JSON.parse(sa).project_id;
  } catch {
    return json({ error: "FIREBASE_SERVICE_ACCOUNT is not valid JSON." }, 500, request, workerEnv);
  }

  // Authorize caller: Bearer Firebase ID token, verified against Google certs +
  // a Firestore admin role check. No shared-secret fallback (a VITE_-prefixed
  // key would be inlined into the public client bundle).
  const authHeader = request.headers.get("Authorization") || request.headers.get("X-HE-AUTH") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());

  let isAuthorized = false;
  let accessToken = null;
  let callerUid = null;

  if (match) {
    const claims = await verifyFirebaseIdToken(match[1], projectId);
    if (!claims || !claims.sub || claims.firebase?.sign_in_provider === "anonymous") {
      return json({ error: "Unauthorized: Invalid or expired Firebase ID token." }, 401, request, workerEnv);
    }
    callerUid = claims.sub;
    try {
      accessToken = await getGoogleAccessToken(sa);
      const role = await getFirestoreUserRole(accessToken, projectId, callerUid);
      if (role === "admin") {
        isAuthorized = true;
      } else {
        return json({ error: "Forbidden: Admin role required to delete users." }, 403, request, workerEnv);
      }
    } catch (e) {
      return json({ error: "Failed to verify admin privileges.", detail: String(e?.message || e) }, 500, request, workerEnv);
    }
  }

  if (!isAuthorized) {
    return json({ error: "Unauthorized: Admin authorization required." }, 401, request, workerEnv);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400, request, workerEnv);
  }

  const uid = typeof payload?.uid === "string" ? payload.uid.trim() : "";
  if (!uid) {
    return json({ error: "Missing uid." }, 400, request, workerEnv);
  }

  // Validate the required JWT fields so we fail with a clear, specific error
  // instead of an opaque 500/502.
  const missingFields = ["client_email", "private_key", "token_uri", "project_id"].filter(
    (f) => !JSON.parse(sa)[f],
  );
  if (missingFields.length > 0) {
    return json(
      { error: `FIREBASE_SERVICE_ACCOUNT is missing field(s): ${missingFields.join(", ")}` },
      500,
      request,
      workerEnv,
    );
  }

  try {
    if (!accessToken) {
      accessToken = await getGoogleAccessToken(sa);
    }

    // No self-delete: an admin misclick (or forged POST) must never lock
    // everyone out by removing the caller's own account.
    if (callerUid && callerUid === uid) {
      return json({ error: "You cannot delete your own admin account." }, 403, request, workerEnv);
    }

    // Last-admin shield: check and delete the profile in one Firestore transaction.
    const victim = await getFirestoreDoc(accessToken, projectId, "users", uid);
    if (victim.exists && victim.fields?.role?.stringValue === "admin") {
      const profileDeleted = await deleteUserProfileWithAdminGuard(accessToken, projectId, uid);
      if (!profileDeleted) {
        return json({ error: "Refusing to delete the last admin account. Promote another admin first." }, 409, request, workerEnv);
      }
    }

    const authResult = await deleteAuthAccount(accessToken, projectId, uid);

    // Firestore DELETE never cascades: purge per-user subcollections first so
    // favorites + notification items don't orphan under a deleted profile.
    const deleted = [];
    for (const favId of await listSubcollectionIds(accessToken, projectId, `users/${uid}`, "favorites")) {
      await deleteFirestoreDoc(accessToken, projectId, `users/${uid}/favorites/${favId}`);
    }
    for (const notifId of await listSubcollectionIds(accessToken, projectId, `notifications/${uid}`, "items")) {
      await deleteFirestoreDoc(accessToken, projectId, `notifications/${uid}/items/${notifId}`);
    }
    for (const col of ["users", "training_guests"]) {
      await deleteFirestoreDoc(accessToken, projectId, `${col}/${uid}`);
      deleted.push(col);
    }

    if (authResult === "not_found") {
      return json(
        { ok: false, uid, reason: "auth_not_found", deletedFirestore: deleted },
        404,
        request,
        workerEnv,
      );
    }
    return json({ ok: true, uid, deletedFirestore: deleted }, 200, request, workerEnv);
  } catch (e) {
    return json({ error: "Delete failed.", detail: String(e?.message || e) }, 502, request, workerEnv);
  }
}
