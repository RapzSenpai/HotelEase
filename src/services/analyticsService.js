import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import { listRooms } from "@/services/roomsService";
import { getCol } from "@/lib/db-utils";

function analyticsBookingsCollection(trainingMode) {
  return getCol("bookings", trainingMode);
}

function analyticsPaymentsCollection(trainingMode) {
  return getCol("payments", trainingMode);
}

const BOOKING_STATUSES_FOR_OCCUPANCY = ["Approved", "Checked In", "Checked Out"];

export async function getAdminAnalyticsSummary({ fromDate, toDate, trainingMode = null } = {}) {
  const now = new Date();
  const from = parseDateInput(fromDate) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const to = parseDateInput(toDate) ?? new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const fromTs = Timestamp.fromDate(from);
  const toTs = Timestamp.fromDate(to);
  const days = daysBetween(from, to);

  // Active rooms define the maximum available nights.
  const rooms = await listRooms({ trainingMode });
  const activeRooms = rooms.filter((r) => r.isActive !== false);
  const roomCount = activeRooms.length;
  const totalAvailableNights = roomCount * days;

  // Fetch bookings in the range (filter statuses client-side).
  const bookingsQ = query(
    collection(db, analyticsBookingsCollection(trainingMode)),
    where("checkInDate", ">=", fromTs),
    where("checkInDate", "<", toTs)
  );

  const bookingsSnap = await getDocs(bookingsQ);
  const bookings = bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const occupancyNights = bookings
    .filter((b) => BOOKING_STATUSES_FOR_OCCUPANCY.includes(b.status))
    .reduce((sum, b) => sum + Number(b.nights ?? 0), 0);

  const occupancyRate =
    totalAvailableNights > 0 ? occupancyNights / totalAvailableNights : 0;

  // Fetch payments in the range for revenue.
  const paymentsQ = query(
    collection(db, analyticsPaymentsCollection(trainingMode)),
    where("createdAt", ">=", fromTs),
    where("createdAt", "<", toTs)
  );

  const paymentsSnap = await getDocs(paymentsQ);
  const payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  // Trend: booking counts by day for last 7 days ending at `to`.
  const trendFrom = new Date(now);
  trendFrom.setDate(trendFrom.getDate() - 6);
  const trendFromTs = Timestamp.fromDate(startOfDay(trendFrom));
  const trendToTs = Timestamp.fromDate(startOfDay(now));

  const trendQ = query(
    collection(db, analyticsBookingsCollection(trainingMode)),
    where("checkInDate", ">=", trendFromTs),
    where("checkInDate", "<", trendToTs)
  );
  const trendSnap = await getDocs(trendQ);
  const trendBookings = trendSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const byDay = new Map();
  for (const b of trendBookings) {
    const d =
      b.checkInDate?.toDate?.() ?? null;
    if (!d) continue;
    const key = formatYMD(d);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const last7 = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(trendFrom);
    d.setDate(d.getDate() + i);
    const key = formatYMD(d);
    last7.push({ date: key, count: byDay.get(key) ?? 0 });
  }

  // Peak periods: top 3 days by booking count.
  const peaks = [...last7]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    range: { from: formatYMD(from), to: formatYMD(to) },
    roomCount,
    days,
    occupancyNights,
    totalAvailableNights,
    occupancyRate,
    totalRevenue,
    bookingTrendLast7Days: last7,
    peakBookingDays: peaks,
  };
}

export async function listBookingsForAnalyticsDebug({ limitCount = 20, trainingMode = null } = {}) {
  const q = query(
    collection(db, analyticsBookingsCollection(trainingMode)),
    orderBy("checkInDate", "desc"),
    where("status", "!=", null)
  );
  const snap = await getDocs(q);
  return snap.docs.slice(0, limitCount).map((d) => ({ id: d.id, ...d.data() }));
}

function parseDateInput(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike === "string") {
    const d = new Date(`${dateLike}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }
  if (dateLike instanceof Date) return d;
  return null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(from, to) {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function formatYMD(d) {
  return d.toISOString().slice(0, 10);
}


