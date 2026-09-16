// Moved verbatim from src/index.js — minute rate limiter, no logic changes.
import { RATE_WINDOW_MS } from "./config.js";

// Simple in-memory per-scope rate limiter (per worker isolate). The scope is
// a uid for signed-in users, IP+UA-hash for anonymous (see index.js).
// Durable objects / KV would be needed for global consistency.
const buckets = new Map();
export function rateLimited(scope, max) {
  const now = Date.now();
  const key = scope || "unknown";
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
