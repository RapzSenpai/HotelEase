/**
 * HotelEase backend proxy — keeps server-side secrets out of the browser.
 *
 * Routes:
 *   POST /delete-user   → deletes a user's Firebase Auth account + Firestore docs
 *                         (FIREBASE_SERVICE_ACCOUNT + DELETE_KEY secrets)
 *   POST /insights      → one-shot analyst report over an admin-built data
 *                         snapshot { context } (GROQ_API_KEY secret)
 *   POST /admin-chat    → multi-turn ops assistant over { messages, context };
 *                         may emit ```chart JSON blocks for the UI to render
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
const MODEL_ID = "openai/gpt-oss-20b";

const RATE_WINDOW_MS = 60 * 1000;

// Fenced-block marker used by the admin assistant's chart-spec protocol.
const FENCE = "```";

const INSIGHTS_SYSTEM_PROMPT = [
  "You are a hotel business analyst for HotelEase — a hotel management system for Consolatrix Suites, Toledo City, Philippines.",
  "You receive one JSON snapshot of aggregated hotel performance (last 30 days vs previous 30 days).",
  "",
  "Produce a concise markdown report with exactly these sections:",
  "## Summary",
  "2-3 sentences on overall performance.",
  "## Key Trends",
  "Bullet points that reference actual numbers from the snapshot.",
  "## Potential Issues",
  "Warnings such as stuck bookings (Awaiting Payment/Pending), rising cancellations, low occupancy, weak ratings, unanswered messages.",
  "## Recommendations",
  "3-5 concrete, actionable next steps for the admin.",
  "",
  "Rules:",
  "- Use ONLY numbers present in the snapshot. Never invent or extrapolate data.",
  "- Currency is PHP. Use the peso sign or 'PHP'.",
  "- If a metric is zero or null, state it plainly instead of speculating.",
  "- No preamble like 'Sure' — start directly with the report.",
].join("\n");

const ADMIN_CHAT_SYSTEM_PROMPT = [
  "You are HotelEase Ops Assistant — an admin-only assistant embedded in the HotelEase admin dashboard for Consolatrix Suites.",
  "You help admins understand analytics, bookings, revenue, rooms, reviews and operations using ONLY the DATA SNAPSHOT embedded below.",
  "",
  "Rules:",
  "1. Answer strictly from the snapshot. Never invent numbers. If something is not in the snapshot, say so plainly.",
  "2. Be direct and concise: 1-5 sentences unless listing options.",
  "3. When a visualization genuinely helps, append ONE fenced code block tagged 'chart' containing STRICT JSON, nothing else inside the fence:",
  FENCE + 'chart',
  '{"type":"bar","title":"Revenue by Payment Method","data":[{"label":"GCash","value":12500}]}',
  FENCE,
  "   - type MUST be one of: bar, line, pie, area",
  "   - data items are {label, value} with numeric value; use 2-31 items",
  "   - line/area for daily trends, bar for comparisons, pie for shares (max 6 slices)",
  "4. No markdown tables. No emojis.",
  "5. You analyze and advise only — you cannot create, edit, or delete anything.",
  "6. Currency is PHP.",
].join("\n");

// ===========================================================================
function getAllowedOrigin(request, workerEnv) {
  if (!request) return "*";
  const origin = request.headers.get("Origin");
  if (!origin) return "*";

  // Allow local development (localhost / 127.0.0.1 on any port)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }

  // Allow standard Firebase hosting domains or custom configured origin
  if (
    origin.endsWith(".web.app") ||
    origin.endsWith(".firebaseapp.com") ||
    (workerEnv?.ALLOWED_ORIGIN && origin === workerEnv.ALLOWED_ORIGIN)
  ) {
    return origin;
  }

  // Default to echoing origin to prevent breaking valid frontends
  return origin;
}

function json(body, status = 200, request = null, workerEnv = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowedOrigin(request, workerEnv),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-DELETE-KEY, X-HE-AUTH",
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
// AI abuse protection: Firebase ID token verification + tiered limits
//
// Tiers (per isolate for minute limits; KV-backed per day):
//   signed-in user  → 20 req/min, 30 req/day   (keyed by uid)
//   anonymous       →  3 req/min,  5 req/day   (keyed by IP)
// /insights and /admin-chat additionally require a verified user token.
// Anonymous Firebase sessions (training sandbox) count as anonymous.
// ===========================================================================

const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const TOKEN_SKEW_SECONDS = 60;

let firebaseCertsCache = null; // { certs: Map<kid, pem>, fetchedAt }

function base64ToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Decode a PEM certificate body ("-----BEGIN CERTIFICATE-----..." wrapper
 * removed) into DER bytes. The armor lines are plain ASCII and corrupt the
 * output if fed through a lenient base64 decoder.
 */
function pemToDerBytes(pem) {
  const body = String(pem)
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");
  return base64ToBytes(body);
}

function decodeJwtSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64ToBytes(segment)));
}

async function getFirebasePublicCerts() {
  if (firebaseCertsCache && Date.now() - firebaseCertsCache.fetchedAt < 60 * 60 * 1000) {
    return firebaseCertsCache.certs;
  }
  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Firebase public certs (${res.status})`);
  const obj = await res.json();
  firebaseCertsCache = { certs: new Map(Object.entries(obj)), fetchedAt: Date.now() };
  return firebaseCertsCache.certs;
}

function readDerTlv(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1];
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i += 1) len = len * 256 + buf[pos + 2 + i];
    return { tag, contentStart: pos + 2 + n, contentLen: len };
  }
  return { tag, contentStart: pos + 2, contentLen: len };
}

function derSequence(contentBytes) {
  const len = contentBytes.length;
  let header;
  if (len < 128) {
    header = new Uint8Array([0x30, len]);
  } else {
    const lenBytes = [];
    let l = len;
    while (l > 0) {
      lenBytes.unshift(l & 0xff);
      l >>= 8;
    }
    header = new Uint8Array([0x30, 0x80 | lenBytes.length, ...lenBytes]);
  }
  const out = new Uint8Array(header.length + len);
  out.set(header, 0);
  out.set(contentBytes, header.length);
  return out;
}

/**
 * Extract the SubjectPublicKeyInfo DER from an X.509 certificate.
 * Inside tbsCertificate the SPKI is the only SEQUENCE whose second child is a
 * BIT STRING, so it can be located without a full ASN.1 library.
 */
function extractSpkiFromCertificate(certDer) {
  const outer = readDerTlv(certDer, 0); // Certificate SEQUENCE
  const tbs = readDerTlv(certDer, outer.contentStart); // tbsCertificate
  const end = Math.min(tbs.contentStart + tbs.contentLen, certDer.length);

  let pos = tbs.contentStart;
  while (pos < end) {
    const tlv = readDerTlv(certDer, pos);
    if (tlv.tag === 0x30 && tlv.contentStart + tlv.contentLen <= end) {
      const first = readDerTlv(certDer, tlv.contentStart);
      const secondPos = first.contentStart + first.contentLen;
      if (secondPos < end) {
        const second = readDerTlv(certDer, secondPos);
        if (first.tag === 0x30 && second.tag === 0x03) {
          return derSequence(certDer.subarray(tlv.contentStart, tlv.contentStart + tlv.contentLen));
        }
      }
    }
    pos = tlv.contentStart + tlv.contentLen;
  }
  throw new Error("SubjectPublicKeyInfo not found in certificate");
}

async function verifyFirebaseIdToken(token, projectId) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    let header;
    let claims;
    try {
      header = decodeJwtSegment(parts[0]);
      claims = decodeJwtSegment(parts[1]);
    } catch {
      return null;
    }
    if (!header || header.alg !== "RS256" || typeof claims !== "object" || claims === null) {
      return null;
    }

    const certs = await getFirebasePublicCerts();
    const pem = certs.get(String(header.kid || ""));
    if (!pem) return null;

    const spkiDer = extractSpkiFromCertificate(pemToDerBytes(pem));
    const key = await crypto.subtle.importKey(
      "spki",
      spkiDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = base64ToBytes(parts[2]);
    const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, signedData);
    if (!valid) {
      console.error("verifyFirebaseIdToken: signature check failed");
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp < now - TOKEN_SKEW_SECONDS) return null;
    if (typeof claims.iat !== "number" || claims.iat > now + TOKEN_SKEW_SECONDS) return null;
    if (claims.aud !== projectId) return null;
    if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
    return claims;
  } catch (e) {
    console.error("verifyFirebaseIdToken: verification error:", String(e?.message || e).slice(0, 200));
    return null;
  }
}

/**
 * Resolve the caller tier from the X-HE-AUTH header.
 * Returns { uid } for verified real users, or { uid: null } for everyone else
 * (missing header, bad/expired token, or anonymous training sessions).
 */
async function resolveAiIdentity(request, workerEnv) {
  const header = request.headers.get("X-HE-AUTH") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || !workerEnv.FIREBASE_SERVICE_ACCOUNT) return { uid: null };

  let projectId = null;
  try {
    projectId = JSON.parse(workerEnv.FIREBASE_SERVICE_ACCOUNT).project_id;
  } catch {
    return { uid: null };
  }
  if (!projectId) return { uid: null };

  const claims = await verifyFirebaseIdToken(match[1], projectId);
  if (!claims) return { uid: null };
  if (claims.firebase?.sign_in_provider === "anonymous") return { uid: null };
  return { uid: claims.sub };
}

// Daily counters: KV-backed when the AI_LIMITS binding exists, with an
// in-isolate memory fallback so infra hiccups never hard-block users.
const memDailyCounters = new Map();

function aiDailyKey(scopeId) {
  return `${new Date().toISOString().slice(0, 10)}:${scopeId}`;
}

async function getAiDailyCount(workerEnv, scopeId) {
  const key = aiDailyKey(scopeId);
  try {
    if (workerEnv.AI_LIMITS) {
      const v = await workerEnv.AI_LIMITS.get(key);
      return v == null ? 0 : Number(v) || 0;
    }
    } catch {
      // KV binding missing or read failed — fall through to the in-memory counter.
    }
    return memDailyCounters.get(key) || 0;
}

async function incrementAiDailyCount(workerEnv, scopeId) {
  const key = aiDailyKey(scopeId);
  const next = (await getAiDailyCount(workerEnv, scopeId)) + 1;
  try {
    if (workerEnv.AI_LIMITS) {
      // TTL of 48h lets date-keyed entries clean themselves up.
      await workerEnv.AI_LIMITS.put(key, String(next), { expirationTtl: 172800 });
    }
  } catch {
    // KV write failed — the in-memory counter below still tracks this isolate.
  }
  memDailyCounters.set(key, next);
  if (memDailyCounters.size > 5000) {
    for (const [k] of memDailyCounters) {
      if (k.split(":")[0] !== new Date().toISOString().slice(0, 10)) memDailyCounters.delete(k);
    }
  }
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

/**
 * Retrieve a user's role from Firestore to verify admin privilege.
 */
async function getFirestoreUserRole(accessToken, projectId, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  return data?.fields?.role?.stringValue || null;
}

async function handleDeleteUser(request, workerEnv) {
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

  // Authorize caller:
  // Primary (Secure): Bearer Firebase ID token -> verified against Google certs + Firestore admin role check.
  // Legacy Fallback: X-DELETE-KEY header matching DELETE_KEY secret.
  const authHeader = request.headers.get("Authorization") || request.headers.get("X-HE-AUTH") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const deleteKey = workerEnv.DELETE_KEY;
  const sentKey = request.headers.get("X-DELETE-KEY") || "";

  let isAuthorized = false;
  let accessToken = null;

  if (match) {
    const claims = await verifyFirebaseIdToken(match[1], projectId);
    if (!claims || !claims.sub || claims.firebase?.sign_in_provider === "anonymous") {
      return json({ error: "Unauthorized: Invalid or expired Firebase ID token." }, 401, request, workerEnv);
    }
    const callerUid = claims.sub;
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
  } else if (deleteKey && sentKey === deleteKey) {
    isAuthorized = true;
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
        request,
        workerEnv,
      );
    }
    return json({ ok: true, uid, deletedFirestore: deleted }, 200, request, workerEnv);
  } catch (e) {
    return json({ error: "Delete failed.", detail: String(e?.message || e) }, 502, request, workerEnv);
  }
}

async function callGroq(apiKey, messages, { maxTokens = 300, temperature = 0.7, extraBody = {} } = {}) {
  const groqRes = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages,
      max_tokens: maxTokens,
      temperature,
      // gpt-oss is a reasoning model: hidden thinking tokens count against
      // max_tokens. "low" keeps answers from being truncated mid-JSON.
      reasoning_effort: "low",
      ...extraBody,
    }),
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text();
    const err = new Error(`Groq upstream error: ${errText.slice(0, 300)}`);
    err.status = groqRes.status;
    throw err;
  }

  const data = await groqRes.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
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
    const content = await callGroq(apiKey, payload.messages, { maxTokens: 300, temperature: 0.7 });
    return json({ content });
  } catch (e) {
    if (e.status) return json({ error: "Groq upstream error.", detail: String(e.message || e) }, e.status);
    return json({ error: "Failed to reach Groq.", detail: String(e) }, 502);
  }
}

/**
 * One-shot analyst report over the admin-built snapshot.
 */
async function handleInsightsRequest(request, workerEnv) {
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

  const context = payload?.context;
  if (!context || typeof context !== "object") {
    return json({ error: "Missing context object." }, 400);
  }

  const snapshotJson = JSON.stringify(context);
  if (snapshotJson.length > 200_000) {
    return json({ error: "Context payload too large." }, 413);
  }

  try {
    const content = await callGroq(
      apiKey,
      [
        { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Analyze this hotel performance snapshot and produce the markdown report:\n\n" +
            snapshotJson,
        },
      ],
      { maxTokens: 1200, temperature: 0.4 },
    );
    return json({ content });
  } catch (e) {
    if (e.status) return json({ error: "Groq upstream error.", detail: String(e.message || e) }, e.status);
    return json({ error: "Failed to reach Groq.", detail: String(e) }, 502);
  }
}

/**
 * Multi-turn admin assistant. The client supplies its own conversation
 * history; the snapshot is injected fresh into the system prompt each call.
 */
async function handleAdminChatRequest(request, workerEnv) {
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

  const incoming = payload?.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return json({ error: "Missing messages array." }, 400);
  }
  if (incoming.length > 40) {
    return json({ error: "Too many messages." }, 400);
  }
  for (const m of incoming) {
    if (!m || typeof m.content !== "string" || (m.role !== "user" && m.role !== "assistant")) {
      return json({ error: "Invalid message format." }, 400);
    }
  }

  const context = payload?.context;
  if (!context || typeof context !== "object") {
    return json({ error: "Missing context object." }, 400);
  }

  const snapshotJson = JSON.stringify(context);
  if (snapshotJson.length > 200_000) {
    return json({ error: "Context payload too large." }, 413);
  }

  try {
    const content = await callGroq(
      apiKey,
      [
        {
          role: "system",
          content:
            ADMIN_CHAT_SYSTEM_PROMPT +
            "\n\nDATA SNAPSHOT (aggregated, current vs previous period):\n" +
            snapshotJson,
        },
        ...incoming.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
      ],
      { maxTokens: 2000, temperature: 0.3 },
    );
    return json({ content });
  } catch (e) {
    if (e.status) return json({ error: "Groq upstream error.", detail: String(e.message || e) }, e.status);
    return json({ error: "Failed to reach Groq.", detail: String(e) }, 502);
  }
}

export default {
  async fetch(request, workerEnv) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": getAllowedOrigin(request, workerEnv),
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-DELETE-KEY, X-HE-AUTH",
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

    // ---- AI endpoints: identity + tiered limits ---------------------------
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const identity = await resolveAiIdentity(request, workerEnv);

    // Minute limits: trusted users get a wider bucket, keyed by uid so
    // rotating IPs don't reset it; anonymous callers stay IP-keyed.
    const minuteCap = identity.uid
      ? Number(workerEnv.RATE_LIMIT_USER_MAX || 20)
      : Number(workerEnv.RATE_LIMIT_ANON_MAX || 3);
    if (rateLimited(identity.uid ? `u:${identity.uid}` : `ip:${ip}`, minuteCap)) {
      return json({ error: "Rate limit exceeded. Please slow down.", code: "RATE_LIMIT" }, 429);
    }

    // Admin-only AI features require a verified signed-in user.
    if (!identity.uid && (path === "/insights" || path === "/admin-chat")) {
      return json({ error: "Sign in required to use this feature.", code: "AUTH_REQUIRED" }, 401);
    }

    // Daily budget (KV-backed). Counted before the Groq call so parallel
    // bursts can't race past the cap; a failed Groq call still spends one.
    const dailyScopeId = identity.uid ? `u:${identity.uid}` : `ip:${ip}`;
    const dailyCap = identity.uid
      ? Number(workerEnv.DAILY_USER_MAX || 30)
      : Number(workerEnv.DAILY_ANON_MAX || 5);
    const usedToday = await getAiDailyCount(workerEnv, dailyScopeId);
    if (usedToday >= dailyCap) {
      return json(
        {
          error: identity.uid
            ? "You've reached your AI assistant limit for today."
            : "You've used your free AI messages for today.",
          code: "DAILY_CAP",
        },
        402,
      );
    }
    await incrementAiDailyCount(workerEnv, dailyScopeId);

    if (path === "/insights") {
      return handleInsightsRequest(request, workerEnv);
    }
    if (path === "/admin-chat") {
      return handleAdminChatRequest(request, workerEnv);
    }

    return handleChatRequest(request, workerEnv);
  },
};