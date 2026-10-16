import { auth } from "@/firebase/firebase.config";

/**
 * Typed error thrown by AI services so UIs can react to specific limits.
 * codes: DAILY_CAP | AUTH_REQUIRED | RATE_LIMIT | UPSTREAM | UNAVAILABLE
 * extra: optional fields from the response body (e.g. resetAt on DAILY_CAP).
 */
export class AiRequestError extends Error {
  constructor(message, code, status, extra = null) {
    super(message);
    this.name = "AiRequestError";
    this.code = code || "UNKNOWN";
    this.status = status;
    if (extra) Object.assign(this, extra);
  }
}

/**
 * Auth headers for AI proxy requests.
 *
 * Returns a Firebase ID token for real (non-anonymous) signed-in users so the
 * worker can apply the trusted tier of its rate limits. Everyone else —
 * including training-mode anonymous sessions — gets treated as anonymous by
 * the worker and simply sends no header. Fail-open on any token error: an
 * expired/failed token must never block the UI, it only downgrades the tier.
 */
export async function getAiAuthHeaders() {
  try {
    const user = auth?.currentUser;
    if (!user || user.isAnonymous) return {};
    const token = await user.getIdToken();
    if (!token) return {};
    return { "X-HE-AUTH": `Bearer ${token}` };
  } catch {
    return {};
  }
}
