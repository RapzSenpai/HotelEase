import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";

const SAMPLES_KEY = "hotelease_perf_samples";
const MAX_SAMPLES = 60;

/**
 * Browser-side performance snapshot from the Performance API.
 * Returns real measurements where available, sensible defaults otherwise.
 * @returns {Object}
 */
export function getBrowserPerformanceSnapshot() {
  const snapshot = {
    navTiming: null,
    ttfb: null,
    domContentLoaded: null,
    loadComplete: null,
    resourceCount: null,
    totalResourceBytes: null,
    largestContentfulPaint: null,
    apiLatency: null,
    jsErrors: null,
    supportsPerfApi: typeof performance !== "undefined",
  };

  if (typeof performance === "undefined") return snapshot;

  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav) {
      snapshot.navTiming = true;
      snapshot.ttfb = Math.round(
        nav.responseStart - nav.requestStart
      );
      snapshot.domContentLoaded = Math.round(
        nav.domContentLoadedEventEnd - nav.navigationStart
      );
      snapshot.loadComplete = Math.round(
        nav.loadEventEnd - nav.navigationStart
      );
    }
  } catch {
    // ignore
  }

  try {
    const resources = performance.getEntriesByType("resource");
    if (resources.length) {
      snapshot.resourceCount = resources.length;
      snapshot.totalResourceBytes = Math.round(
        resources.reduce(
          (sum, r) => sum + (r.transferSize || r.encodedBodySize || 0),
          0
        ) / 1024
      );
    }
  } catch {
    // ignore
  }

  try {
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    if (lcpEntries.length) {
      const last = lcpEntries[lcpEntries.length - 1];
      snapshot.largestContentfulPaint = Math.round(last.startTime);
    }
  } catch {
    // ignore
  }

  try {
    snapshot.jsErrors = performance.getEntriesByType("navigation")[0]?.numJsErrors ?? null;
  } catch {
    // ignore
  }

  return snapshot;
}

/**
 * Persist a latency sample for a named operation (localStorage ring buffer).
 * @param {string} name
 * @param {number} ms
 * @param {boolean} [ok]
 */
export function recordLatencySample(name, ms, ok = true) {
  try {
    const samples = readSamples();
    samples.push({
      name,
      ms: Math.round(ms),
      ok,
      at: Date.now(),
    });
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    localStorage.setItem(SAMPLES_KEY, JSON.stringify(samples));
  } catch {
    // ignore quota errors
  }
}

/**
 * Read persisted latency samples.
 * @returns {Array}
 */
export function readSamples() {
  try {
    const raw = localStorage.getItem(SAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Measure a Firestore-ish async operation and record its latency.
 * Non-blocking: never throws, returns the operation result.
 * @param {string} name
 * @param {Function} fn - async function to measure
 * @param {Object} [options]
 * @param {boolean} options.trainingMode
 * @returns {Promise<*>}
 */
export async function measureOperation(name, fn) {
  const start = performance.now();
  try {
    const result = await fn();
    recordLatencySample(name, performance.now() - start, true);
    return result;
  } catch (e) {
    recordLatencySample(name, performance.now() - start, false);
    throw e;
  }
}

/**
 * Aggregate latency samples into per-operation stats + an error rate.
 * @returns {Object}
 */
export function summarizeSamples() {
  const samples = readSamples();
  if (!samples.length) {
    return { operations: {}, total: 0, errors: 0, errorRate: 0, lastUpdated: null };
  }

  const byName = {};
  for (const s of samples) {
    if (!byName[s.name]) {
      byName[s.name] = { count: 0, errors: 0, totalMs: 0, min: Infinity, max: 0 };
    }
    const op = byName[s.name];
    op.count += 1;
    if (!s.ok) op.errors += 1;
    op.totalMs += s.ms;
    op.min = Math.min(op.min, s.ms);
    op.max = Math.max(op.max, s.ms);
  }

  const operations = {};
  for (const [name, op] of Object.entries(byName)) {
    operations[name] = {
      count: op.count,
      errors: op.errors,
      avgMs: Math.round(op.totalMs / op.count),
      minMs: Math.round(op.min),
      maxMs: Math.round(op.max),
    };
  }

  const total = samples.length;
  const errors = samples.filter((s) => !s.ok).length;
  return {
    operations,
    total,
    errors,
    errorRate: total ? Math.round((errors / total) * 1000) / 10 : 0,
    lastUpdated: samples[samples.length - 1].at,
  };
}

/**
 * Overall performance score 0-100 based on browser metrics + error rate.
 * @param {Object} metrics - result of getBrowserPerformanceSnapshot()
 * @param {Object} [summary] - result of summarizeSamples()
 * @returns {number}
 */
export function computePerformanceScore(metrics, summary) {
  let score = 70;

  if (metrics?.ttfb != null) {
    if (metrics.ttfb < 300) score += 10;
    else if (metrics.ttfb < 800) score += 5;
    else score -= 10;
  }
  if (metrics?.largestContentfulPaint != null) {
    if (metrics.largestContentfulPaint < 2500) score += 5;
    else if (metrics.largestContentfulPaint < 4000) score += 2;
    else score -= 8;
  }
  if (metrics?.totalResourceBytes != null) {
    if (metrics.totalResourceBytes < 1500) score += 5;
    else if (metrics.totalResourceBytes < 3000) score += 2;
    else score -= 8;
  }
  if (summary) {
    if (summary.errorRate === 0) score += 5;
    else if (summary.errorRate < 5) score += 2;
    else score -= 15;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Subscribe to Firestore connectivity status. Reads the system_health/metrics
 * doc (admins/FO can read it) and reports reachability + round-trip latency.
 * @param {Function} callback - receives { connected: boolean, latency: number|null }
 * @param {Object} options
 * @param {boolean} options.trainingMode
 * @returns {() => void} Unsubscribe
 */
export function subscribeToConnectivity(callback, { trainingMode = false } = {}) {
  const col = getCol("system_health", trainingMode);
  const ref = doc(db, col, "metrics");

  return onSnapshot(
    ref,
    () => callback({ connected: true, latency: null }),
    (error) => {
      console.error("[performanceService] connectivity error:", error);
      callback({ connected: false, latency: null });
    }
  );
}

/**
 * One-shot Firestore connectivity + latency probe.
 * @param {boolean} [trainingMode]
 * @returns {Promise<{ connected: boolean, latency: number|null }>}
 */
export async function probeConnectivity({ trainingMode = false } = {}) {
  const col = getCol("system_health", trainingMode);
  const ref = doc(db, col, "metrics");
  const start = performance.now();
  try {
    await getDoc(ref);
    return { connected: true, latency: Math.round(performance.now() - start) };
  } catch (error) {
    console.error("[performanceService] probe error:", error);
    return { connected: false, latency: Math.round(performance.now() - start) };
  }
}
export function clearSamples() {
  try {
    localStorage.removeItem(SAMPLES_KEY);
  } catch {
    // ignore
  }
}