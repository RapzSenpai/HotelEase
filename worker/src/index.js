/**
 * HotelEase backend proxy — keeps server-side secrets out of the browser.
 *
 * Routes:
 *   POST /delete-user   → deletes a user's Firebase Auth account + Firestore docs
 *                         (FIREBASE_SERVICE_ACCOUNT + DELETE_KEY secrets)
 *   POST (default)      → forwards { messages } to Groq (GROQ_API_KEY secret)
 *
 * Set secrets (never in code / git):
 *   npx wrangler login
 *   npx wrangler secret put GROQ_API_KEY
 *   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT   # full service-account JSON
 *   npx wrangler secret put DELETE_KEY                 # shared key the app sends
 *   npx wrangler deploy
 *
 * Then point the app at it: VITE_GROQ_PROXY_URL=https://<worker>.workers.dev
 * Requests to /delete-user must carry `X-DELETE-KEY: <DELETE_KEY>`.
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_ID = "llama-3.1-8b-instant";

const RATE_WINDOW_MS = 60 * 1000;

// ===========================================================================
// Small helpers
// ===========================================================================

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-DELETE-KEY",
      "Cache-Control": "no-store",
    },
  });
}

// Simple in-memory per-IP rate limiter (per worker isolate).
// Durable objects / KV would be needed for global consistency.
const buckets = new Map();
function rateLimited(ip, max) {
  const now = Date.now();
  const key = ip || "unknown";
  const entry = buckets.get(key) || { count: 0, resetAt: 0 };

  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }

  entry.count += 1;
  buckets.set(key, entry);

  // Bound memory growth.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  return entry.count > max;
}

// ===========================================================================
// Firebase Admin-style helpers (service account via Google OAuth)
// =========================================================================

function base64urlEncodeBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncodeText(text) {
  return base64urlEncodeBytes(new TextEncoder().encode(text));
}

async function importPrivateKey(pem) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Sign a Google service-account JWT (RS256) and swap it for an OAuth2 access
 * token covering Firebase + Firestore admin scopes.
 */
async function getGoogleAccessToken(rawServiceAccount) {
  const sa = JSON.parse(rawServiceAccount);
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncodeText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64urlEncodeText(
    JSON.stringify({
      iss: sa.client_email,
      scope:
        "https://www.googleapis.com/auth/firebase " +
        "https://www.googleapis.com/auth/cloud-platform " +
        "https://www.googleapis.com/auth/datastore",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64urlEncodeBytes(new Uint8Array(signature))}`;

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(
      "Failed to exchange service-account JWT for access token: " +
        (data?.error_description || data?.error || resp.status),
    );
  }
  return data.access_token;
}

/**
 * Delete the Firebase Auth account so the user can no longer sign in.
 * Returns "deleted" on success, or "not_found" if the account is already gone.
 */
async function deleteAuthAccount(accessToken, projectId, uid) {
  const resp = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ localId: uid, targetProjectId: projectId }),
  });

  // 400 with USER_NOT_FOUND just means it's already gone — treat as success.
  if (!resp.ok && resp.status !== 400) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to delete auth account (${resp.status}): ${text.slice(0, 300)}`);
  }
  return resp.ok ? "deleted" : "not_found";
}

/**
 * Delete a Firestore document, ignoring 404s as success.
 */
async function deleteFirestoreDoc(accessToken, projectId, path) {
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

async function handleDeleteUser(request, workerEnv) {
  const deleteKey = workerEnv.DELETE_KEY;
  if (!deleteKey) {
    return json({ error: "DELETE_KEY secret is not configured." }, 500);
  }

  const sentKey = request.headers.get("X-DELETE-KEY") || "";
  if (sentKey !== deleteKey) {
    return json({ error: "Invalid delete key." }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const uid = typeof payload?.uid === "string" ? payload.uid.trim() : "";
  if (!uid) {
    return json({ error: "Missing uid." }, 400);
  }

  const sa = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    return json({ error: "FIREBASE_SERVICE_ACCOUNT secret is not configured." }, 500);
  }

  let projectId;
  try {
    projectId = JSON.parse(sa).project_id;
  } catch {
    return json({ error: "FIREBASE_SERVICE_ACCOUNT is not valid JSON." }, 500);
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
    );
  }

  try {
    const accessToken = await getGoogleAccessToken(sa);
    const authResult = await deleteAuthAccount(accessToken, projectId, uid);

    const deleted = [];
    for (const col of ["users", "training_guests"]) {
      await deleteFirestoreDoc(accessToken, projectId, `${col}/${uid}`);
      deleted.push(col);
    }

    if (authResult === "not_found") {
      return json(
        { ok: false, uid, reason: "auth_not_found", deletedFirestore: deleted },
        404,
      );
    }
    return json({ ok: true, uid, deletedFirestore: deleted });
  } catch (e) {
    return json({ error: "Delete failed.", detail: String(e?.message || e) }, 502);
  }
}

async function handleChatRequest(request, workerEnv) {
  const apiKey = workerEnv.GROQ_API_KEY;
  if (!apiKey) {
    return json({ error: "Groq proxy is not configured (missing GROQ_API_KEY secret)." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (!Array.isArray(payload?.messages) || payload.messages.length === 0) {
    return json({ error: "Missing messages array." }, 400);
  }

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: payload.messages,
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return json({ error: "Groq upstream error.", detail: errText }, groqRes.status);
    }

    const data = await groqRes.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    return json({ content: content || "" });
  } catch (e) {
    return json({ error: "Failed to reach Groq.", detail: String(e) }, 502);
  }
}

export default {
  async fetch(request, workerEnv) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-DELETE-KEY",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/delete-user") {
      return handleDeleteUser(request, workerEnv);
    }

    const maxPerWindow = Number(workerEnv.RATE_LIMIT_MAX || 10);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip, maxPerWindow)) {
      return json({ error: "Rate limit exceeded. Please try again shortly." }, 429);
    }

    return handleChatRequest(request, workerEnv);
  },
};