// Moved verbatim from src/index.js — briefing handler, no logic changes.
import { callGroq } from "../groq.js";
import { json } from "../http.js";
import { BRIEFING_SYSTEM_PROMPT } from "../prompts.js";

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

export async function handleBriefingRequest(request, workerEnv) {
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
