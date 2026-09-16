// Moved verbatim from src/index.js — CORS + JSON helpers, no logic changes.
// ===========================================================================
export function getAllowedOrigin(request, workerEnv) {
  if (!request) return "";
  const origin = request.headers.get("Origin");
  if (!origin) return "";

  // Allow local development (localhost / 127.0.0.1 on any port)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }

  // This project's Firebase Hosting domains, exact match only. A suffix
  // check would grant CORS to ANY *.web.app / *.firebaseapp.com site.
  if (
    origin === "https://hotelease-9e3a0.web.app" ||
    origin === "https://hotelease-9e3a0.firebaseapp.com" ||
    // Firebase preview channels for THIS project only
    // (hotelease-9e3a0--<channel>.web.app) — scoped to our site name so no
    // other *.web.app site can ride along.
    /^https:\/\/hotelease-9e3a0--[a-z0-9-]+\.web\.app$/.test(origin)
  ) {
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

export function json(body, status = 200, request = null, workerEnv = null) {
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
