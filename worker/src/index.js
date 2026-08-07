/**
 * HotelEase Chat proxy — keeps the Groq API key server-side.
 *
 * The frontend sends { messages } here; this worker injects the Authorization
 * header with GROQ_API_KEY (a Worker secret) and forwards to the Groq API.
 * The key is never exposed to the browser.
 *
 * Deploy:
 *   npx wrangler login
 *   npx wrangler deploy
 *   npx wrangler secret put GROQ_API_KEY
 *
 * Then point the app at it: VITE_GROQ_PROXY_URL=https://<worker>.workers.dev
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_ID = "llama-3.1-8b-instant";

const RATE_WINDOW_MS = 60 * 1000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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

export default {
  async fetch(request, workerEnv) {
    const maxPerWindow = Number(workerEnv.RATE_LIMIT_MAX || 10);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    const apiKey = workerEnv.GROQ_API_KEY;
    if (!apiKey) {
      return json({ error: "Groq proxy is not configured (missing GROQ_API_KEY secret)." }, 500);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip, maxPerWindow)) {
      return json({ error: "Rate limit exceeded. Please try again shortly." }, 429);
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
      const groqRes = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: payload.messages,
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        return json({ error: "Groq upstream error.", detail: errText }, groqRes.status);
      }

      const data = await groqRes.json();
      const content = data?.choices?.[0]?.message?.content?.trim();

      return json({ content: content || "" });
    } catch (e) {
      return json({ error: "Failed to reach Groq.", detail: String(e) }, 502);
    }
  },
};
