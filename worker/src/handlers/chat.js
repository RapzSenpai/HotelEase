// Moved verbatim from src/index.js — default chat handler, no logic changes.
import { callGroq } from "../groq.js";
import { json } from "../http.js";

export async function handleChatRequest(request, workerEnv) {
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

  // Never forward raw client messages: same shape checks as admin-chat
  // (role + string content), extra fields stripped. System holds the rooms
  // context so it gets a wider cap than the 4000 history-message limit.
  const sanitized = [];
  for (const m of payload.messages) {
    if (
      !m ||
      typeof m.content !== "string" ||
      (m.role !== "user" && m.role !== "assistant" && m.role !== "system")
    ) {
      return json({ error: "Invalid message format." }, 400);
    }
    const cap = m.role === "system" ? 20000 : 4000;
    sanitized.push({ role: m.role, content: m.content.slice(0, cap) });
  }

  try {
    const content = await callGroq(apiKey, sanitized, { maxTokens: 300, temperature: 0.7 });
    return json({ content });
  } catch (e) {
    if (e.status) return json({ error: "Groq upstream error.", detail: String(e.message || e) }, e.status);
    return json({ error: "Failed to reach Groq.", detail: String(e) }, 502);
  }
}
