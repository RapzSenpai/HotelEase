/**
 * HotelEase backend proxy — keeps server-side secrets out of the browser.
 *
 * Routes:
 *   POST /delete-user   → deletes a user's Firebase Auth account + Firestore docs
 *                         (FIREBASE_SERVICE_ACCOUNT secret; verified admin
 *                         Firebase ID token required)
 *   scheduled (cron)    → hourly stale-hold sweep: cancels Awaiting Payment
 *                         bookings past their deadline and frees their
 *                         room_availability markers, then purges any orphan
 *                         markers left behind by a failed client cleanup
 *                         (FIREBASE_SERVICE_ACCOUNT)
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
 *   npx wrangler deploy
 *
 * Then point the app at it: VITE_GROQ_PROXY_URL=https://<worker>.workers.dev
 * Requests to /delete-user must carry `Authorization: Bearer <admin ID token>`.
 * (Optional) ALLOWED_ORIGINS="https://a.com,https://b.com" to allow extra origins.
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
  "3-5 concrete, actionable next steps.",
  "",
  "Rules:",
  "- Use ONLY numbers present in the snapshot. Never invent or extrapolate data.",
  "- Currency is PHP. Use the peso sign or 'PHP'.",
  "- If a metric is zero or null, state it plainly instead of speculating.",
  "- No preamble like 'Sure' — start directly with the report.",
].join("\n");

const BRIEFING_SYSTEM_PROMPT = [
  "You are the HotelEase Ops Briefing generator for Consolatrix Suites (Toledo City, Philippines).",
  "You receive one JSON snapshot. The `rightNow` section is the live operational state (queues, expiring holds, arrivals, room statuses); the rest is 30-day trend history.",
  "",
  "Produce a ranked to-do list of what needs the admin's attention.",
  'Output ONLY a JSON array — no markdown, no code fences, no commentary. Example shape:',
  '[{"title":"...","severity":"high","evidence":"...","recommendation":"...","link":"/fo/bookings"}]',
  "",
  "Rules:",
  "- Max 5 items, most severe first. If nothing needs attention, return [].",
  "- Every item MUST cite exact numbers from the snapshot in `evidence`. Never invent numbers.",
  "- `severity`: high = time-sensitive with revenue or guest impact (e.g. expiring holds, cancellations, dirty rooms with arrivals today); medium = queues growing; low = opportunities.",
  "- `recommendation`: ONE concrete action the admin can take right now.",
  "- `link` MUST be one of: /fo/bookings, /fo/check-in, /fo/check-out, /fo/housekeeping, /fo/cancellations, /admin/messages, /admin/testimonials, /admin/room-rates, /admin",
  "- Title is at most 60 characters.",
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
  "5. You cannot create, edit, or delete anything in the system. However, when the admin explicitly asks you to DRAFT an announcement, append ONE fenced code block tagged 'action' containing STRICT JSON, nothing else inside the fence:",
  FENCE + 'action',
  '{"type":"draft_announcement","title":"...","body":"..."}',
  FENCE,
  "   - title: at most 80 characters. body: at most 600 characters of plain text.",
  "   - Only include an action block when explicitly asked to draft. Never combine action and chart blocks in the same reply.",
  "6. Currency is PHP.",
].join("\n");

// ===========================================================================
function getAllowedOrigin(request, workerEnv) {
  if (!request) return "";
  const origin = request.headers.get("Origin");
  if (!origin) return "";

  // Allow local development (localhost / 127.0.0.1 on any port)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }

  // Firebase Hosting domains are always allowed.
  if (origin.endsWith(".web.app") || origin.endsWith(".firebaseapp.com")) {
    return origin;
  }

  // Any other origin must be explicitly listed (comma-separated) in
  // ALLOWED_ORIGINS (or the legacy single ALLOWED_ORIGIN). Unknown origins get
  // no CORS grant instead of being reflected — an echo-any policy lets any site
  // drive authenticated requests against this proxy.
  const allowed = String(workerEnv?.ALLOWED_ORIGINS || workerEnv?.ALLOWED_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : "";
}

function json(body, status = 200, request = null, workerEnv = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowedOrigin(request, workerEnv),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-HE-AUTH",
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
 * GET a single Firestore document. Returns { exists, fields } — a 404 means the
 * document is gone (exists: false) rather than an error.
 */
async function getFirestoreDoc(accessToken, projectId, collectionId, docId) {
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

// ===========================================================================
// Scheduled stale-hold sweep (Cloudflare Cron Triggers)
//
// The client-side checkAndExpireStaleBookings() only runs when staff load
// RoomsPage / FoBookingsPage — guests never trigger it and nothing else does.
// Abandoned "Awaiting Payment" holds would therefore keep their nights blocked
// in room_availability until a staff member happens to open a page. This cron
// cancels them server-side (hourly) and frees their availability markers.
//
// The same cron then runs sweepOrphanMarkers() to purge any marker a failed
// client-side cleanup left behind (see that function for the rationale).
// ===========================================================================

/** Pull a single field out of a Firestore REST `fields` map. */
function fsValue(fields, path) {
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
async function runFirestoreQuery(accessToken, projectId, collectionId, structuredQuery) {
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
    }));
}

/** PATCH a Firestore document, updating exactly the listed field paths. */
async function patchFirestoreDoc(accessToken, projectId, collectionId, docId, fields, masks) {
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
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Firestore PATCH ${collectionId}/${docId} failed (${resp.status}): ${text.slice(0, 300)}`);
  }
}

const EXPIRY_SWEEP_MAX_PER_COLLECTION = 100;

/**
 * Cancel Awaiting Payment bookings whose payment deadline has passed and free
 * their room_availability markers. Sweeps prod `bookings` + `training_bookings`.
 */
async function expireStaleHolds(workerEnv) {
  const sa = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT not configured" };

  let projectId;
  try {
    projectId = JSON.parse(sa).project_id;
  } catch {
    return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT is not valid JSON" };
  }
  if (!projectId) return { ok: false, reason: "project_id missing" };

  const accessToken = await getGoogleAccessToken(sa);
  const nowIso = new Date().toISOString();

  const summary = { expiredBookings: 0, releasedMarkers: 0, errors: 0 };

  // PROD holds live in `bookings` and block nights via `room_availability`
  // markers; training holds live in the open `training_bookings` sandbox and
  // block nights via the bookings themselves (no markers to clean).
  for (const col of ["bookings", "training_bookings"]) {
    try {
      const expired = await runFirestoreQuery(accessToken, projectId, col, {
        from: [{ collectionId: col }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "status" },
                  op: "EQUAL",
                  value: { stringValue: "Awaiting Payment" },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "paymentDeadline" },
                  op: "LESS_THAN",
                  value: { timestampValue: nowIso },
                },
              },
            ],
          },
        },
      });

      for (const booking of expired.slice(0, EXPIRY_SWEEP_MAX_PER_COLLECTION)) {
        const bookingId = booking.id;
        try {
          await patchFirestoreDoc(
            accessToken,
            projectId,
            col,
            bookingId,
            {
              status: { stringValue: "Cancelled" },
              rejectionReason: { stringValue: "Payment deadline expired" },
              updatedAt: { timestampValue: nowIso },
            },
            ["status", "rejectionReason", "updatedAt"],
          );
          summary.expiredBookings += 1;

          // Release the PROD availability markers tied to this hold.
          if (col === "bookings" && fsValue(booking.fields, "roomId")) {
            const markers = await runFirestoreQuery(accessToken, projectId, "room_availability", {
              from: [{ collectionId: "room_availability" }],
              where: {
                fieldFilter: {
                  field: { fieldPath: "bookingId" },
                  op: "EQUAL",
                  value: { stringValue: bookingId },
                },
              },
            });
            for (const marker of markers) {
              try {
                await deleteFirestoreDoc(accessToken, projectId, `room_availability/${marker.id}`);
                summary.releasedMarkers += 1;
              } catch (e) {
                summary.errors += 1;
                console.error(`[sweep] marker delete failed ${marker.id}:`, String(e?.message || e));
              }
            }
          }
        } catch (e) {
          summary.errors += 1;
          console.error(`[sweep] expiry failed for ${col}/${bookingId}:`, String(e?.message || e));
        }
      }
    } catch (e) {
      summary.errors += 1;
      console.error(`[sweep] query failed for ${col}:`, String(e?.message || e));
    }
  }

  return { ok: true, ...summary };
}

const ORPHAN_SWEEP_MAX_DELETES = 200;

/**
 * Purge `room_availability` markers whose linked booking is terminal
 * (Cancelled / Checked Out) or missing entirely.
 *
 * Marker cleanup runs on the client AFTER the booking flips to a terminal
 * status. Before the /room_availability delete rule allowed a guest to release
 * markers post-cancellation, that delete was denied and swallowed — leaving
 * "orphan" markers that permanently block their nights (guests saw the room as
 * unavailable and the calendar rendered a stale hold). Even with the rule
 * fixed, a dropped network request or an unhandled path can still leak a
 * marker, so this hourly sweep guarantees eventual consistency. "Cancellation
 * Requested" is still an active hold and is deliberately left alone.
 */
async function sweepOrphanMarkers(workerEnv) {
  const sa = workerEnv.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT not configured" };

  let projectId;
  try {
    projectId = JSON.parse(sa).project_id;
  } catch {
    return { ok: false, reason: "FIREBASE_SERVICE_ACCOUNT is not valid JSON" };
  }
  if (!projectId) return { ok: false, reason: "project_id missing" };

  const accessToken = await getGoogleAccessToken(sa);
  const summary = { markers: 0, orphansDeleted: 0, errors: 0 };

  const markers = await runFirestoreQuery(accessToken, projectId, "room_availability", {
    from: [{ collectionId: "room_availability" }],
  });
  summary.markers = markers.length;
  if (markers.length === 0) return { ok: true, ...summary };

  // Group markers by the booking they reference. A marker with no bookingId
  // can never belong to an active booking, so it is an orphan by definition.
  const byBooking = new Map(); // bookingId -> markerId[]
  const orphanIds = [];
  for (const marker of markers) {
    const bookingId = fsValue(marker.fields, "bookingId");
    if (!bookingId) {
      orphanIds.push(marker.id);
      continue;
    }
    if (!byBooking.has(bookingId)) byBooking.set(bookingId, []);
    byBooking.get(bookingId).push(marker.id);
  }

  for (const [bookingId, markerIds] of byBooking) {
    let booking;
    try {
      booking = await getFirestoreDoc(accessToken, projectId, "bookings", bookingId);
    } catch (e) {
      summary.errors += 1;
      console.error(`[sweep] booking lookup failed for ${bookingId}:`, String(e?.message || e));
      continue;
    }
    const status = booking.exists ? fsValue(booking.fields, "status") : null;
    const isOrphan =
      !booking.exists || status === "Cancelled" || status === "Checked Out";
    if (isOrphan) orphanIds.push(...markerIds);
  }

  const targets = orphanIds.slice(0, ORPHAN_SWEEP_MAX_DELETES);
  const CONCURRENCY = 10;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    await Promise.all(
      targets.slice(i, i + CONCURRENCY).map(async (markerId) => {
        try {
          await deleteFirestoreDoc(accessToken, projectId, `room_availability/${markerId}`);
          summary.orphansDeleted += 1;
        } catch (e) {
          summary.errors += 1;
          console.error(`[sweep] orphan marker delete failed ${markerId}:`, String(e?.message || e));
        }
      }),
    );
  }

  if (orphanIds.length > targets.length) {
    console.warn(
      `[sweep] orphan deletion capped at ${ORPHAN_SWEEP_MAX_DELETES}; ` +
        `${orphanIds.length - targets.length} left for the next run`,
    );
  }

  return { ok: true, ...summary };
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

  // Authorize caller: Bearer Firebase ID token, verified against Google certs +
  // a Firestore admin role check. No shared-secret fallback (a VITE_-prefixed
  // key would be inlined into the public client bundle).
  const authHeader = request.headers.get("Authorization") || request.headers.get("X-HE-AUTH") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());

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
 * Ops Briefing: ranked, structured JSON to-do list derived from the snapshot.
 * The client renders each item as an actionable card with a deep link.
 */
function parseBriefingArray(text) {
  const raw = String(text ?? "").trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    const allowedLinks = new Set([
      "/fo/bookings", "/fo/check-in", "/fo/check-out", "/fo/housekeeping",
      "/fo/cancellations", "/admin/messages", "/admin/testimonials",
      "/admin/room-rates", "/admin",
    ]);
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.title === "string" &&
          typeof item.recommendation === "string",
      )
      .slice(0, 5)
      .map((item) => ({
        title: String(item.title).slice(0, 90),
        severity: ["high", "medium", "low"].includes(item.severity) ? item.severity : "medium",
        evidence: String(item.evidence ?? "").slice(0, 240),
        recommendation: String(item.recommendation).slice(0, 240),
        link: allowedLinks.has(item.link) ? item.link : "/admin",
      }));
  } catch {
    return [];
  }
}

async function handleBriefingRequest(request, workerEnv) {
  const apiKey = workerEnv.GROQ_API_KEY;
  if (!apiKey) {
    return json({ error: "AI proxy is not configured (missing GROQ_API_KEY secret)." }, 500);
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
        { role: "system", content: BRIEFING_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Generate the ops briefing JSON array for this snapshot:\n\n" +
            snapshotJson,
        },
      ],
      { maxTokens: 900, temperature: 0.2 },
    );
    const items = parseBriefingArray(content);
    return json({ items });
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
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-HE-AUTH",
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
    if (!identity.uid && (path === "/insights" || path === "/admin-chat" || path === "/briefing")) {
      return json({ error: "Sign in required to use this feature.", code: "AUTH_REQUIRED" }, 401);
    }

    // Daily budget (KV-backed). Counted before the Groq call so parallel
    // bursts can't race past the cap; a failed Groq call still spends one.
    const dailyScopeId = identity.uid ? `u:${identity.uid}` : `ip:${ip}`;
    const dailyCap = identity.uid
      ? Number(workerEnv.DAILY_USER_MAX || 100)
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
    if (path === "/briefing") {
      return handleBriefingRequest(request, workerEnv);
    }
    if (path === "/admin-chat") {
      return handleAdminChatRequest(request, workerEnv);
    }

    return handleChatRequest(request, workerEnv);
  },

  // Cron (see [triggers] in wrangler.toml): hourly stale-hold sweep so
  // abandoned Awaiting Payment bookings release their nights even when no
  // staff page has been loaded.
  async scheduled(event, workerEnv) {
    try {
      const result = await expireStaleHolds(workerEnv);
      console.log(`[scheduled] stale-hold sweep → ${JSON.stringify(result)}`);
    } catch (e) {
      console.error("[scheduled] stale-hold sweep failed:", String(e?.message || e));
    }

    // Backstop: clean up any marker a client cleanup failed to remove, so a
    // leaked hold can never permanently block a room.
    try {
      const swept = await sweepOrphanMarkers(workerEnv);
      console.log(`[scheduled] orphan-marker sweep → ${JSON.stringify(swept)}`);
    } catch (e) {
      console.error("[scheduled] orphan-marker sweep failed:", String(e?.message || e));
    }
  },
};