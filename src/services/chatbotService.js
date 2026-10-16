import { getAiAuthHeaders, AiRequestError } from "@/lib/aiAuth";

// The Groq API key never ships to the browser. Chat requests are forwarded to a
// Cloudflare Worker proxy (server-side), which injects the key, owns the
// system prompt (including booking tools) and applies rate limits.
// See /worker. The proxy URL is configured via VITE_GROQ_PROXY_URL.
const GROQ_PROXY_URL = import.meta.env.VITE_GROQ_PROXY_URL;

const UNAVAILABLE =
  "I'm currently unavailable. Please contact our front office for assistance.";

/**
 * @param {string} userMessage
 * @param {Array<{ role: 'user' | 'assistant', content: string }>} conversationHistory - last 6 turns max (caller slices)
 * @param {{ roomId: string, name: string } | null} roomContext - optional read-only hint: the room page the guest is viewing
 * @returns {Promise<{ reply: string, remainingToday?: number, dailyLimit?: number }>}
 */
export async function sendMessage(
  userMessage,
  conversationHistory = [],
  roomContext = null) {
  if (!GROQ_PROXY_URL) {
    return { reply: UNAVAILABLE };
  }

  const historyMessages = conversationHistory.slice(-6).map((turn) => ({
    role: turn.role === "user" ? "user" : "assistant",
    content: turn.content}));

  try {
    const response = await fetch(GROQ_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getAiAuthHeaders())},
      body: JSON.stringify({
        messages: [
          ...historyMessages,
          {
            role: "user",
            content: userMessage}],
        ...(roomContext ? { context: roomContext } : {})})});

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const codeMap = { 401: "AUTH_REQUIRED", 402: "DAILY_CAP", 429: "RATE_LIMIT" };
      console.error(
        `chatbotService: Groq proxy returned ${response.status}`,
        errData?.error || "");
      throw new AiRequestError(
        errData?.error || `AI request failed (${response.status})`,
        errData?.code || codeMap[response.status] || "UPSTREAM",
        response.status,
        typeof errData?.resetAt === "string" ? { resetAt: errData.resetAt } : null);
    }

    const data = await response.json();
    return {
      reply: data?.content?.trim() || UNAVAILABLE,
      ...(typeof data?.remainingToday === "number" && typeof data?.dailyLimit === "number"
        ? { remainingToday: data.remainingToday, dailyLimit: data.dailyLimit }
        : {})};
  } catch (e) {
    if (e instanceof AiRequestError) throw e;
    console.error("chatbotService: Groq proxy error", e);
    throw new AiRequestError(UNAVAILABLE, "UNAVAILABLE");
  }
}
