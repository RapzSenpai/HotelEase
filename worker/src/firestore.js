// Moved verbatim from src/index.js — Firestore REST helpers, no logic changes.
/**
 * Delete the Firebase Auth account so the user can no longer sign in.
 * Returns "deleted" on success, or "not_found" if the account is already gone.
 */
export async function deleteAuthAccount(accessToken, projectId, uid) {
  const resp = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ localId: uid, targetProjectId: projectId }),
  });

  // 400 with USER_NOT_FOUND just means it's already gone — treat as success.
  const responseText = !resp.ok ? await resp.text().catch(() => "") : "";
  if (!resp.ok && resp.status === 400) {
    let data = null;
    try {
      data = JSON.parse(responseText || "null");
    } catch {
      // Malformed 400 responses remain failures.
    }
    if (data?.error?.message === "USER_NOT_FOUND") return "not_found";
  }
  if (!resp.ok) {
    throw new Error(`Failed to delete auth account (${resp.status}): ${responseText.slice(0, 300)}`);
  }
  return "deleted";
}

/**
 * Delete a Firestore document, ignoring 404s as success.
 */
export async function deleteFirestoreDoc(accessToken, projectId, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encodedPath}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to delete Firestore doc ${path} (${resp.status}): ${text.slice(0, 300)}`);
  }
}

/**
 * List document IDs of a subcollection, e.g. ("users", uid, "favorites").
 * Used to purge per-user data (favorites, notification items) that a plain
 * document DELETE would otherwise orphan — Firestore never cascades.
 */
export async function listSubcollectionIds(accessToken, projectId, parentPath, collectionId) {
  const encodedParent = parentPath.split("/").map(encodeURIComponent).join("/");
  const ids = [];
  let pageToken = "";
  do {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encodedParent}/${encodeURIComponent(collectionId)}?pageSize=300${tokenParam}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resp.status === 404) return ids;
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Failed to list ${parentPath}/${collectionId} (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => ({}));
    ids.push(...(Array.isArray(data.documents) ? data.documents : []).map(
      (d) => (d.name || "").split("/").pop() || "",
    ).filter(Boolean));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return ids;
}

/**
 * GET a single Firestore document. Returns { exists, fields } — a 404 means the
 * document is gone (exists: false) rather than an error.
 */
export async function getFirestoreDoc(accessToken, projectId, collectionId, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}/${encodeURIComponent(docId)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) return { exists: false, fields: {} };
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to GET ${collectionId}/${docId} (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json().catch(() => ({}));
  return { exists: true, fields: data.fields || {} };
}

/**
 * Retrieve a user's role from Firestore to verify admin privilege.
 */
export async function getFirestoreUserRole(accessToken, projectId, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  return data?.fields?.role?.stringValue || null;
}

/** Pull a single field out of a Firestore REST `fields` map. */
export function fsValue(fields, path) {
  const v = fields?.[path];
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  return undefined;
}

/** Run a structuredQuery against a collection; returns [{ id, fields }]. */
export async function runFirestoreQuery(accessToken, projectId, collectionId, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Firestore runQuery ${collectionId} failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const results = await resp.json().catch(() => []);
  return (Array.isArray(results) ? results : [])
    .filter((r) => r?.document)
    .map((r) => ({
      id: (r.document.name || "").split("/").pop() || "",
      fields: r.document.fields || {},
      updateTime: r.document.updateTime || null,
    }));
}

export async function deleteUserProfileWithAdminGuard(accessToken, projectId, uid) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const transactionResponse = await fetch(`${base}:beginTransaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  if (!transactionResponse.ok) {
    const text = await transactionResponse.text().catch(() => "");
    throw new Error(`Failed to begin admin deletion transaction: ${text.slice(0, 300)}`);
  }
  const transaction = (await transactionResponse.json()).transaction;
  const queryResponse = await fetch(`${base}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "role" },
            op: "EQUAL",
            value: { stringValue: "admin" },
          },
        },
      },
      transaction,
    }),
  });
  if (!queryResponse.ok) {
    const text = await queryResponse.text().catch(() => "");
    throw new Error(`Failed to check admin membership: ${text.slice(0, 300)}`);
  }
  const queryResults = await queryResponse.json().catch(() => []);
  const admins = queryResults.filter((item) => item?.document);
  if (admins.length <= 1) {
    await fetch(`${base}:rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ transaction }),
    });
    return false;
  }

  const commitResponse = await fetch(`${base}:commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      transaction,
      writes: [{
        delete: `${base}/users/${encodeURIComponent(uid)}`,
      }],
    }),
  });
  if (!commitResponse.ok) {
    const text = await commitResponse.text().catch(() => "");
    throw new Error(`Failed to commit admin deletion: ${text.slice(0, 300)}`);
  }
  return true;
}

/**
 * PATCH a Firestore document, updating exactly the listed field paths.
 * Pass `preconditionUpdateTime` (a document updateTime from a prior read) to
 * make the write compare-and-swap: it fails with 412 if anything touched the
 * doc since — the sweeps use this so a guest payment landing mid-sweep wins
 * instead of being cancelled underneath.
 */
export async function patchFirestoreDoc(accessToken, projectId, collectionId, docId, fields, masks, preconditionUpdateTime = null) {
  const maskParams = masks
    .map((m, i) => `${i === 0 ? "?" : "&"}updateMask.fieldPaths=${encodeURIComponent(m)}`)
    .join("");
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}/${encodeURIComponent(docId)}${maskParams}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      fields,
      ...(preconditionUpdateTime
        ? { currentDocument: { updateTime: preconditionUpdateTime } }
        : {}),
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Firestore PATCH ${collectionId}/${docId} failed (${resp.status}): ${text.slice(0, 300)}`);
  }
}
