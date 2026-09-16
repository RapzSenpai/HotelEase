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
 *                         plus abandoned training-guest accounts
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
 *
 * Implementation lives in sibling modules (moved verbatim); this file is only
 * the fetch router + scheduled entry that wrangler.toml points at.
 */
import { getAllowedOrigin, json } from "./http.js";
import { rateLimited } from "./rate-limit.js";
import { resolveAiIdentity } from "./firebase-jwt.js";
import { getAiDailyCount, incrementAiDailyCount } from "./ai-limits.js";
import { expireStaleHolds, sweepOrphanMarkers, sweepStaleTrainingGuests } from "./sweeps.js";
import { handleDeleteUser } from "./handlers/delete-user.js";
import { handleChatRequest } from "./handlers/chat.js";
import { handleInsightsRequest } from "./handlers/insights.js";
import { handleBriefingRequest } from "./handlers/briefing.js";
import { handleAdminChatRequest } from "./handlers/admin-chat.js";

// djb2, hex. Not security — just a compact per-device bucket key so one IP
// shared by many phones doesn't collapse into a single rate-limit bucket.
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
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
      const res = json({ error: "Method not allowed." }, 405);
      res.headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request, workerEnv));
      return res;
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    // Handlers build json() without the request, so their responses carry an
    // empty ACAO header and browsers block them. Stamp it here — the single
    // point every router response passes through.
    const origin = getAllowedOrigin(request, workerEnv);
    const send = (res) => {
      res.headers.set("Access-Control-Allow-Origin", origin);
      return res;
    };

    if (path === "/delete-user") {
      return send(await handleDeleteUser(request, workerEnv));
    }

    // ---- AI endpoints: identity + tiered limits ---------------------------
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const identity = await resolveAiIdentity(request, workerEnv);

    // Anonymous scope is IP + a User-Agent hash (per-device buckets). A whole
    // class on shared venue WiFi shares one IP — IP-only buckets would let 3
    // students burn the daily budget for everyone. UA rotation can evade this,
    // accepted: the anon tier is a free sample, signed-in users get uid buckets.
    const uaHash = hashString(request.headers.get("User-Agent") || "no-ua");
    const anonScope = `ip:${ip}:ua:${uaHash}`;

    // Minute limits: trusted users get a wider bucket, keyed by uid so
    // rotating IPs don't reset it; anonymous callers stay scope-keyed.
    const minuteCap = identity.uid
      ? Number(workerEnv.RATE_LIMIT_USER_MAX || 20)
      : Number(workerEnv.RATE_LIMIT_ANON_MAX || 3);
    if (rateLimited(identity.uid ? `u:${identity.uid}` : anonScope, minuteCap)) {
      return send(json({ error: "Rate limit exceeded. Please slow down.", code: "RATE_LIMIT" }, 429));
    }

    // Admin-only AI features require a verified signed-in user.
    if (!identity.uid && (path === "/insights" || path === "/admin-chat" || path === "/briefing")) {
      return send(json({ error: "Sign in required to use this feature.", code: "AUTH_REQUIRED" }, 401));
    }

    // Daily budget (KV-backed). Counted before the Groq call so parallel
    // bursts can't race past the cap; failed requests still spend one.
    const dailyScopeId = identity.uid ? `u:${identity.uid}` : anonScope;
    const dailyCap = identity.uid
      ? Number(workerEnv.DAILY_USER_MAX || 100)
      : Number(workerEnv.DAILY_ANON_MAX || 5);
    const usedToday = await getAiDailyCount(workerEnv, dailyScopeId);
    if (usedToday >= dailyCap) {
      return send(json(
        {
          error: identity.uid
            ? "You've reached your AI assistant limit for today."
            : "You've used your free AI messages for today.",
          code: "DAILY_CAP",
        },
        402,
      ));
    }
    await incrementAiDailyCount(workerEnv, dailyScopeId);

    if (path === "/insights") {
      return send(await handleInsightsRequest(request, workerEnv));
    }
    if (path === "/briefing") {
      return send(await handleBriefingRequest(request, workerEnv));
    }
    if (path === "/admin-chat") {
      return send(await handleAdminChatRequest(request, workerEnv));
    }

    return send(await handleChatRequest(request, workerEnv));
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

    // Sandbox hygiene: purge anonymous trainee accounts abandoned via kick,
    // expiry, or tab-close (they never run the logout cleanup).
    try {
      const zombies = await sweepStaleTrainingGuests(workerEnv);
      console.log(`[scheduled] stale-guest sweep → ${JSON.stringify(zombies)}`);
    } catch (e) {
      console.error("[scheduled] stale-guest sweep failed:", String(e?.message || e));
    }
  },
};
