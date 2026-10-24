/**
 * Night audit policy — pure helpers, no Firestore.
 *
 * Business day = the hotel's local calendar day (midnight to midnight), same
 * local-midnight rule as lib/time-utils.js. A date-keyed snapshot is one
 * document per business date, so collects never duplicate.
 *
 * The list stays dependency-free (the tiny local date key mirrors
 * availabilityService.dateKey) so vitest can run it without Firebase mocks.
 */

/** Local midnight of the given moment's calendar day. */
export function startOfBusinessDay(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local "YYYY-MM-DD" business date key. One audit document per key. */
export function businessDateKey(now = new Date()) {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

const APPROVED = "Approved";

/**
 * No-show cutoff: an Approved booking becomes flaggable only once its arrival
 * DAY has fully passed (check-in date < today's business date). On the arrival
 * day itself the guest can still walk in late, so the button is withheld.
 */
export function isNoShowEligible(booking, now = new Date()) {
  if (!booking || booking.status !== APPROVED) return false;
  const checkIn = toLocalNightDate(booking.checkInDate);
  if (!checkIn) return false;
  return checkIn < startOfBusinessDay(now);
}

/** Whole days elapsed since the arrival day started (0 on the arrival day). */
export function nightsPastArrival(booking, now = new Date()) {
  const checkIn = toLocalNightDate(booking?.checkInDate);
  if (!checkIn) return 0;
  const diff = startOfBusinessDay(now) - startOfBusinessDay(checkIn);
  return Math.max(0, Math.round(diff / 86400000));
}

/**
 * Split an Approved bookings list into the night-audit arrival buckets.
 * dueToday: arrival day is today (no action yet — guest may still show up).
 * eligible: arrival date already passed (the "Mark No-Show" list).
 * Future arrivals are ignored. Non-Approved statuses are ignored.
 */
export function classifyArrivals(bookings, now = new Date()) {
  const dueToday = [];
  const eligible = [];
  const todayStart = startOfBusinessDay(now);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  for (const booking of bookings || []) {
    if (!booking || booking.status !== APPROVED) continue;
    const checkIn = toLocalNightDate(booking.checkInDate);
    if (!checkIn) continue;
    if (checkIn < todayStart) eligible.push(booking);
    else if (checkIn < todayEnd) dueToday.push(booking);
  }
  return { dueToday, eligible };
}

/**
 * Snapshot figures for the night_audits/{date} document. Clamps every number
 * to a finite >= 0 int so the rules whitelist and charts never see junk.
 */
export function buildAuditSummary(now, figures = {}) {
  const num = (v) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0;
  const totalRooms = num(figures.totalRooms);
  const occupiedRooms = Math.min(num(figures.occupiedRooms), totalRooms);
  const occupancyRate =
    totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
  return {
    auditDate: businessDateKey(now),
    occupiedRooms,
    totalRooms,
    occupancyRate,
    checkInsToday: num(figures.checkInsToday),
    checkOutsDue: num(figures.checkOutsDue),
    overdueCheckOuts: num(figures.overdueCheckOuts),
    arrivalsTodayNotCheckedIn: num(figures.arrivalsTodayNotCheckedIn),
    noShowEligible: num(figures.noShowEligible),
    noShowsMarkedToday: num(figures.noShowsMarkedToday)};
}

function toLocalNightDate(dateLike) {
  if (!dateLike) return null;
  if (dateLike instanceof Date) return isNaN(dateLike.getTime()) ? null : dateLike;
  if (typeof dateLike === "string") {
    const parsed = new Date(`${dateLike}T00:00:00`);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof dateLike.toDate === "function") {
    const date = dateLike.toDate();
    return date instanceof Date && isNaN(date.getTime()) ? null : date;
  }
  return null;
}
