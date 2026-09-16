// Moved verbatim from src/index.js — admin-chat handler, no logic changes.
import { callGroq } from "../groq.js";
import { json } from "../http.js";
import { ADMIN_CHAT_SYSTEM_PROMPT } from "../prompts.js";

/**
 * Multi-turn admin assistant. The client supplies its own conversation
 * history; the snapshot is injected fresh into the system prompt each call.
 */
export async function handleAdminChatRequest(request, workerEnv) {
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
