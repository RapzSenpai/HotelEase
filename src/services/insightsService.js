/**
 * AI Insights + Admin Assistant data layer.
 *
 * Builds a compact, PII-free analytics snapshot from Firestore (client-side,
 * behind the admin route guard) and posts it to the Cloudflare Worker's AI
 * endpoints (/insights, /admin-chat). The worker stays stateless — it never
 * touches Firestore; it only receives the aggregated JSON produced here.
 *
 * Privacy rule: aggregate numbers only. No guest names, emails, phones, or
 * free-text feedback ever leave the browser.
 */

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { getCol } from "@/lib/db-utils";
import { listRooms } from "@/services/roomsService";
import { getAiAuthHeaders, AiRequestError } from "@/lib/aiAuth";

const GROQ_PROXY_URL = import.meta.env.VITE_GROQ_PROXY_URL;

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30; // current vs previous comparison window
const CACHE_TTL_MS = 5 * 60 * 1000;
const OCCUPANCY_STATUSES = ["Approved", "Checked In", "Checked Out"];

let contextCache = null; // { key, fetchedAt, data }

function col(name, trainingMode) {
  return collection(db, getCol(name, trainingMode));
}

async function fetchAll(name, trainingMode) {
  // Unbounded reads are intentional: dataset sizes here are small (single
  // hotel), and several metrics need cross-period scans anyway. Sorting is
  // done client-side to avoid composite index requirements.
  const snap = await getDocs(col(name, trainingMode));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function toDate(value) {
  const d = value?.toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Aggregate one window of bookings (created within the window).
 */
function summarizeBookings(bookings, roomsById, fromMs, toMs) {
  const statusCounts = {};
  const cancellationReasons = {};
  const roomAgg = new Map();
  let cancelled = 0;
  let occupancyNights = 0;
  let leadDaysSum = 0;
  let leadDaysCount = 0;

  for (const b of bookings) {
    const created = toDate(b.createdAt)?.getTime() ?? null;
    if (created == null || created < fromMs || created >= toMs) continue;

    const status = String(b.status ?? "Unknown");
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    if (status === "Cancelled") {
      cancelled += 1;
      const raw = String(b.rejectionReason || b.cancellationReason || "").trim();
      const reason = raw ? `${raw.slice(0, 80)}` : "Unspecified";
      cancellationReasons[reason] = (cancellationReasons[reason] ?? 0) + 1;
      continue;
    }

    const checkIn = toDate(b.checkInDate);
    const nights = Math.max(0, Number(b.nights ?? 0));

    if (
      OCCUPANCY_STATUSES.includes(status) &&
      checkIn &&
      checkIn.getTime() >= fromMs &&
      checkIn.getTime() < toMs
    ) {
      occupancyNights += nights;
    }

    if (checkIn && created != null) {
      leadDaysSum += Math.max(0, Math.round((checkIn.getTime() - created) / DAY_MS));
      leadDaysCount += 1;
    }

    const key = b.roomId || "unassigned";
    const room = roomsById.get(key);
    const entry = roomAgg.get(key) ?? {
      roomId: key,
      name: room?.name || room?.roomNumber || "Unknown room",
      type: room?.type || "—",
      bookings: 0,
      nights: 0,
      estRevenue: 0,
    };
    entry.bookings += 1;
    entry.nights += nights;
    entry.estRevenue += Number(b.totalCost ?? 0);
    roomAgg.set(key, entry);
  }

  const createdTotal = Object.values(statusCounts).reduce((s, n) => s + n, 0);

  return {
    bookingsCreated: createdTotal,
    statusCounts,
    cancellations: {
      count: cancelled,
      shareOfCreated: createdTotal > 0 ? round1((cancelled / createdTotal) * 100) : 0,
      topReasons: Object.fromEntries(
        Object.entries(cancellationReasons)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
      ),
    },
    occupancyNights,
    avgLeadDays: leadDaysCount > 0 ? round1(leadDaysSum / leadDaysCount) : null,
    topRooms: [...roomAgg.values()]
      .sort((a, b) => b.estRevenue - a.estRevenue)
      .slice(0, 5)
      .map((r) => ({ ...r, estRevenue: Math.round(r.estRevenue) })),
  };
}

/**
 * Build the full admin context snapshot consumed by both /insights and
 * /admin-chat. Cached in-memory for CACHE_TTL_MS.
 */
export async function buildAdminContext({ trainingMode = null, force = false } = {}) {
  const key = trainingMode === "training" || trainingMode === true ? "training" : "prod";

  if (!force && contextCache && contextCache.key === key && Date.now() - contextCache.fetchedAt < CACHE_TTL_MS) {
    return contextCache.data;
  }

  const now = new Date();
  const curToMs = now.getTime();
  const curFromMs = startOfDay(new Date(curToMs - WINDOW_DAYS * DAY_MS)).getTime();
  const prevFromMs = curFromMs - WINDOW_DAYS * DAY_MS;

  const [bookings, payments, reviews, hkLogs, messages, testimonials, rooms] = await Promise.all([
    fetchAll("bookings", trainingMode),
    fetchAll("payments", trainingMode),
    fetchAll("reviews", trainingMode),
    fetchAll("housekeeping_logs", trainingMode),
    fetchAll("messages", null),
    fetchAll("testimonials", null),
    listRooms({ trainingMode }),
  ]);

  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const activeRooms = rooms.filter((r) => r.isActive !== false);

  // Daily activity series (last 60 days): booking creations + recorded revenue.
  const seriesDays = WINDOW_DAYS * 2;
  const daily = [];
  const dayIndex = new Map();
  for (let i = seriesDays - 1; i >= 0; i -= 1) {
    const date = ymd(startOfDay(new Date(curToMs - i * DAY_MS)));
    dayIndex.set(date, daily.length);
    daily.push({ date, bookings: 0, revenue: 0 });
  }

  for (const b of bookings) {
    const t = toDate(b.createdAt);
    if (!t) continue;
    const idx = dayIndex.get(ymd(t));
    if (idx != null) daily[idx].bookings += 1;
  }
  for (const p of payments) {
    const t = toDate(p.createdAt);
    if (!t) continue;
    const idx = dayIndex.get(ymd(t));
    if (idx != null) daily[idx].revenue += Number(p.amount ?? 0);
  }

  // Revenue + payment methods (current window).
  let revenueCurrent = 0;
  let revenuePrevious = 0;
  const methodsCurrent = new Map();
  for (const p of payments) {
    const t = toDate(p.createdAt)?.getTime() ?? null;
    if (t == null) continue;
    const amount = Number(p.amount ?? 0);
    if (t >= curFromMs && t < curToMs) {
      revenueCurrent += amount;
      const method = String(p.method ?? "Other");
      const m = methodsCurrent.get(method) ?? { method, count: 0, total: 0 };
      m.count += 1;
      m.total += amount;
      methodsCurrent.set(method, m);
    } else if (t >= prevFromMs && t < curFromMs) {
      revenuePrevious += amount;
    }
  }

  const current = summarizeBookings(bookings, roomsById, curFromMs, curToMs);
  const previousLite = summarizeBookings(bookings, roomsById, prevFromMs, curFromMs);

  // Reviews (all-time distribution; volumes are small).
  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  for (const rv of reviews) {
    const stars = Math.min(5, Math.max(1, Math.round(Number(rv.rating ?? 0))));
    if (stars < 1) continue;
    ratingDist[stars] += 1;
    ratingSum += stars;
  }
  const ratedCount = Object.values(ratingDist).reduce((s, n) => s + n, 0);

  // Ops counters (current window where timestamps exist).
  let hkLogs30 = 0;
  let midStay30 = 0;
  let hkRatings30 = 0;
  let hkRatingSum30 = 0;
  for (const log of hkLogs) {
    const t = toDate(log.createdAt)?.getTime() ?? null;
    if (t != null && t >= curFromMs && t < curToMs) {
      hkLogs30 += 1;
      if (log.isMidStayRequest === true) midStay30 += 1;
      const stars = Math.round(Number(log.rating ?? 0));
      if (stars >= 1 && stars <= 5) {
        hkRatings30 += 1;
        hkRatingSum30 += stars;
      }
    }
  }
  const messageCounts = {};
  for (const msg of messages) {
    const s = String(msg.status ?? "unread");
    messageCounts[s] = (messageCounts[s] ?? 0) + 1;
  }
  const testimonialCounts = {};
  for (const tsm of testimonials) {
    const s = String(tsm.status ?? "Pending");
    testimonialCounts[s] = (testimonialCounts[s] ?? 0) + 1;
  }

  const occupancyRate =
    activeRooms.length > 0
      ? round1((current.occupancyNights / (activeRooms.length * WINDOW_DAYS)) * 100)
      : 0;

  // ── Right Now: live operational state (no date-window filtering) ──
  // The historical sections answer "how did we do?"; this answers "what needs
  // attention today?". Counts come from data already fetched above.
  const IN_24H_MS = curToMs + DAY_MS;
  let pendingApprovals = 0;
  let awaitingPayment = 0;
  let expiringHolds24h = 0;
  let cancellationRequests = 0;
  let arrivalsToday = 0;
  let departuresToday = 0;
  const todayStart = startOfDay(now).getTime();
  const todayEnd = todayStart + DAY_MS;

  for (const b of bookings) {
    const status = String(b.status ?? "");
    if (status === "Pending") pendingApprovals += 1;
    if (status === "Awaiting Payment") {
      awaitingPayment += 1;
      const deadline = toDate(b.paymentDeadline)?.getTime() ?? null;
      if (deadline != null && deadline <= IN_24H_MS) expiringHolds24h += 1;
    }
    if (status === "Cancellation Requested") cancellationRequests += 1;

    const checkIn = toDate(b.checkInDate);
    if (
      checkIn &&
      (status === "Approved" || status === "Checked In") &&
      checkIn.getTime() >= todayStart &&
      checkIn.getTime() < todayEnd
    ) {
      arrivalsToday += 1;
    }

    const checkOut = toDate(b.checkOutDate);
    if (
      status === "Checked In" &&
      checkOut &&
      checkOut.getTime() >= todayStart &&
      checkOut.getTime() < todayEnd
    ) {
      departuresToday += 1;
    }
  }

  const roomsByStatus = {};
  for (const r of activeRooms) {
    const s = String(r.status ?? "Unknown");
    roomsByStatus[s] = (roomsByStatus[s] ?? 0) + 1;
  }
  const roomsNeedingCleaning = roomsByStatus["Dirty / Needs Cleaning"] ?? 0;

  const data = {
    generatedAt: new Date().toISOString(),
    scope: key,
    period: {
      windowDays: WINDOW_DAYS,
      current: { from: ymd(new Date(curFromMs)), to: ymd(new Date(curToMs)) },
      previous: { from: ymd(new Date(prevFromMs)), to: ymd(new Date(curFromMs)) },
    },
    hotel: {
      activeRooms: activeRooms.length,
      totalRooms: rooms.length,
      roomTypes: Object.entries(
        rooms.reduce((acc, r) => {
          const t = String(r.type ?? "Unknown");
          acc[t] = (acc[t] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([type, count]) => ({ type, count })),
    },
    currentPeriod: {
      ...current,
      revenue: Math.round(revenueCurrent),
      revenueChangePct:
        revenuePrevious > 0
          ? round1(((revenueCurrent - revenuePrevious) / revenuePrevious) * 100)
          : null,
      occupancyRatePct: occupancyRate,
      paymentsByMethod: [...methodsCurrent.values()]
        .sort((a, b) => b.total - a.total)
        .map((m) => ({ method: m.method, count: m.count, total: Math.round(m.total) })),
    },
    previousPeriod: {
      bookingsCreated: previousLite.bookingsCreated,
      revenue: Math.round(revenuePrevious),
    },
    dailyActivity: daily.map((d) => ({ ...d, revenue: Math.round(d.revenue) })),
    reviews: {
      count: ratedCount,
      avgRating: ratedCount > 0 ? round1(ratingSum / ratedCount) : null,
      distribution: ratingDist,
    },
    operations: {
      housekeepingLogsLast30: hkLogs30,
      midStayRequestsLast30: midStay30,
      cleanlinessRatingsLast30: {
        count: hkRatings30,
        avgRating: hkRatings30 > 0 ? round1(hkRatingSum30 / hkRatings30) : null,
      },
      messagesByStatus: messageCounts,
      testimonialsByStatus: testimonialCounts,
    },
    rightNow: {
      pendingApprovals,
      awaitingPayment,
      expiringHolds24h,
      cancellationRequests,
      arrivalsToday,
      departuresToday,
      roomsNeedingCleaning,
      roomsByStatus,
      unreadMessages: messageCounts.unread ?? 0,
      pendingTestimonials: testimonialCounts.Pending ?? 0,
    },
  };

  contextCache = { key, fetchedAt: Date.now(), data };
  return data;
}

export function invalidateAdminContextCache() {
  contextCache = null;
}

function throwUpstreamError(data, status, fallback) {
  const base = data?.error ? String(data.error) : `${fallback} (${status}).`;
  let message = base;
  const detail = String(data?.detail ?? "");
  if (/rate limit|429|quota/i.test(detail)) {
    message = `${base} Free-tier AI rate limit hit — wait a minute and try again.`;
  } else if (detail) {
    message = `${base} (${detail.slice(0, 140)})`;
  }
  throw new AiRequestError(message, data?.code || "UPSTREAM", status);
}

/**
 * Ask the worker's analyst endpoint for a markdown insights report.
 */
export async function generateAiInsights(context) {
  if (!GROQ_PROXY_URL) throw new Error("AI proxy URL is not configured.");

  const res = await fetch(`${GROQ_PROXY_URL.replace(/\/+$/, "")}/insights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAiAuthHeaders()),
    },
    body: JSON.stringify({ context }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throwUpstreamError(data, res.status, "AI insights request failed");
  return String(data.content ?? "").trim();
}

/**
 * Ops Briefing: ranked JSON to-do items derived from the snapshot's
 * rightNow section. Returns a validated, severity-ordered array
 * of { title, severity, evidence, recommendation, link }.
 */
export async function generateOpsBriefing(context) {
  if (!GROQ_PROXY_URL) throw new Error("AI proxy URL is not configured.");

  const res = await fetch(`${GROQ_PROXY_URL.replace(/\/+$/, "")}/briefing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAiAuthHeaders()),
    },
    body: JSON.stringify({ context }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throwUpstreamError(data, res.status, "Ops briefing request failed");

  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((item) => ({
    title: String(item.title ?? ""),
    severity: ["high", "medium", "low"].includes(item.severity) ? item.severity : "medium",
    evidence: String(item.evidence ?? ""),
    recommendation: String(item.recommendation ?? ""),
    link: typeof item.link === "string" && item.link.startsWith("/") ? item.link : "/admin",
  }));
}

/**
 * Send an admin-assistant conversation turn (+ snapshot) to the worker.
 * @param {Array<{ role: 'user' | 'assistant', content: string }>} messages
 */
export async function sendAdminChat(messages, context) {
  if (!GROQ_PROXY_URL) throw new Error("AI proxy URL is not configured.");
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Missing conversation messages.");
  }

  const res = await fetch(`${GROQ_PROXY_URL.replace(/\/+$/, "")}/admin-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAiAuthHeaders()),
    },
    body: JSON.stringify({ messages, context }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throwUpstreamError(data, res.status, "Admin assistant request failed");
  return String(data.content ?? "").trim();
}
