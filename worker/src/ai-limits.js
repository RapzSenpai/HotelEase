// Moved verbatim from src/index.js — daily AI counters, no logic changes.
// NOTE: the try/catch brace indent below is carried as-is from the original
// (valid JS, just misleadingly indented). Left untouched on purpose.
// Daily counters: KV-backed when the AI_LIMITS binding exists, with an
// in-isolate memory fallback so infra hiccups never hard-block users.
const memDailyCounters = new Map();

// Missing-KV is otherwise silent (caps quietly become per-isolate): warn once
// per isolate so a misconfigured deploy shows up in the logs.
let kvWarned = false;
function warnNoKvBinding() {
  if (!kvWarned) {
    kvWarned = true;
    console.warn("[ai-limits] AI_LIMITS KV binding missing — daily caps enforced per-isolate only.");
  }
}

function aiDailyKey(scopeId) {
  return `${new Date().toISOString().slice(0, 10)}:${scopeId}`;
}

export async function getAiDailyCount(workerEnv, scopeId) {
  const key = aiDailyKey(scopeId);
  try {
    if (workerEnv.AI_LIMITS) {
      const v = await workerEnv.AI_LIMITS.get(key);
      return v == null ? 0 : Number(v) || 0;
    }
    warnNoKvBinding();
    } catch {
      // KV binding missing or read failed — fall through to the in-memory counter.
    }
    return memDailyCounters.get(key) || 0;
}

export async function incrementAiDailyCount(workerEnv, scopeId) {
  const key = aiDailyKey(scopeId);
  const next = (await getAiDailyCount(workerEnv, scopeId)) + 1;
  try {
    if (workerEnv.AI_LIMITS) {
      // TTL of 48h lets date-keyed entries clean themselves up.
      await workerEnv.AI_LIMITS.put(key, String(next), { expirationTtl: 172800 });
    } else {
      warnNoKvBinding();
    }
  } catch {
    // KV write failed — the in-memory counter below still tracks this isolate.
  }
  memDailyCounters.set(key, next);
  if (memDailyCounters.size > 5000) {
    for (const [k] of memDailyCounters) {
      if (k.split(":")[0] !== new Date().toISOString().slice(0, 10)) memDailyCounters.delete(k);
    }
  }
}

