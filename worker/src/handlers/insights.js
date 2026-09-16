// Moved verbatim from src/index.js — insights handler, no logic changes.
import { callGroq } from "../groq.js";
import { json } from "../http.js";
import { INSIGHTS_SYSTEM_PROMPT } from "../prompts.js";

/**
 * One-shot analyst report over the admin-built snapshot.
 */
export async function handleInsightsRequest(request, workerEnv) {
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
