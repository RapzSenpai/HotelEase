import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where} from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
// Shared with availabilityService — see lib/time-utils.js for the local-midnight rule.
import { toLocalDate as toDate } from "@/lib/time-utils";
import { isRoomActive, listRooms } from "../roomsService";
import { getBlockedRoomIds } from "../availabilityService";
import { bookingsCollection } from "./core";

/**
 * Reads, subscriptions, and the availability lookups that answer "which rooms
 * are free for these dates". Split out of bookingsService without changes.
 */

export async function listBookingsForUser(uid) {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    where("guestId", "==", uid),
    orderBy("checkInDate", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToUserBookings(uid, callback) {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    where("guestId", "==", uid),
    orderBy("checkInDate", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(bookings);
    },
    (error) => {
      console.error("[bookingsService] subscribeToUserBookings error:", error);
      callback([]);
    });
}

export async function listBookingsForRoom(
  roomId) {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    where("roomId", "==", roomId),
    orderBy("checkInDate", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBooking(bookingId) {
  if (!bookingId || typeof bookingId !== "string") return null;
  const col = bookingsCollection();
  const ref = doc(db, col, bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listBookingsByStatuses(
  statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return [];
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    where("status", "in", statuses),
    orderBy("checkInDate", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Calculates how many whole days a booking is past its checkout date.
 * Hotel standard check-out deadline is 12:00 NN.
 * Returns 0 if not overdue.
 */
export function getOverdueDays(checkOutDateLike) {
  const checkOut = toDate(checkOutDateLike);
  if (!checkOut) return 0;

  // Set checkout threshold to 12:00 NN on the checkout date
  const deadline = new Date(checkOut);
  deadline.setHours(12, 0, 0, 0);

  const now = new Date();
  if (now <= deadline) return 0;

  const diffMs = now.getTime() - deadline.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

// P0 scalability: bounded live window per status tab. Same ordering as the
// unbounded subscription; callers grow pageSize via "Show more" instead of
// reading the whole collection. Realtime semantics unchanged.
//
// P2 date filter: optional { fromDate, toDate } bounds on checkInDate (Date
// objects, inclusive). A ranged view orders by checkInDate asc (arrival
// order); unfiltered keeps createdAt desc. Status + range needs the
// (status + checkInDate asc) composite in firestore.indexes.json.
export const BOOKINGS_PAGE_SIZE = 50;

function bookingsPageQuery(col, { status = null, pageSize = BOOKINGS_PAGE_SIZE, fromDate = null, toDate = null, orderField = null, orderDir = null } = {}) {
  const ranged = fromDate || toDate;
  // Default ordering preserves each caller's contract: ranged views sort by
  // arrival; everything else by creation. Callers may override both together
  // (used by the dashboard change-detector: all statuses by updatedAt).
  const field = orderField || (ranged ? "checkInDate" : "createdAt");
  const dir = orderDir || (ranged ? "asc" : "desc");
  return query(
    collection(db, col),
    ...(status ? [where("status", "==", status)] : []),
    ...(fromDate ? [where("checkInDate", ">=", Timestamp.fromDate(fromDate))] : []),
    ...(toDate ? [where("checkInDate", "<=", Timestamp.fromDate(toDate))] : []),
    orderBy(field, dir),
    limit(pageSize));
}

export function subscribeToBookingsPage(
  { status = null, pageSize = BOOKINGS_PAGE_SIZE, fromDate = null, toDate = null, orderField = null, orderDir = null } = {},
  callback) {
  const col = bookingsCollection();
  const q = bookingsPageQuery(col, { status, pageSize, fromDate, toDate, orderField, orderDir });
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error("[bookingsService] subscribeToBookingsPage error:", error);
      callback([]);
    });
}

// Exact in-range total for the "N in range" caption (count, not docs).
export async function countBookingsPage(
  { status = null, fromDate = null, toDate = null } = {}) {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    ...(status ? [where("status", "==", status)] : []),
    ...(fromDate ? [where("checkInDate", ">=", Timestamp.fromDate(fromDate))] : []),
    ...(toDate ? [where("checkInDate", "<=", Timestamp.fromDate(toDate))] : []));
  return (await getCountFromServer(q)).data().count;
}

// P2 indicator existence checks: navbar badges only need to know WHETHER a
// matching doc exists, so limit(1) keeps the live read to a single doc.
// The due-checkouts bound mirrors countCheckOutsDue (same composite index).
export function subscribeToHasBookings(
  { status = null, checkOutBefore = null } = {},
  callback) {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    ...(status ? [where("status", "==", status)] : []),
    ...(checkOutBefore ? [where("checkOutDate", "<", Timestamp.fromDate(checkOutBefore))] : []),
    limit(1));
  return onSnapshot(
    q,
    (snap) => callback(!snap.empty),
    (error) => {
      console.error("[bookingsService] subscribeToHasBookings error:", error);
      callback(false);
    });
}

// Server-side doc counts for tab badges — cheap (count() bills per 1000
// index entries, not per doc read) so badges stay exact without loading docs.
export async function countBookingsByStatus(status) {
  const col = bookingsCollection();
  const q = status
    ? query(collection(db, col), where("status", "==", status))
    : query(collection(db, col));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

// P1 dashboard metrics — exact server counts, no doc reads. Bounds mirror the
// old client filters exactly:
// - checkInsToday: status in [Checked In, Checked Out] AND updatedAt >= today
// - checkOutsDue: Checked In AND checkOutDate < tomorrow (== truncated date <= today)
// - overdue: Checked In AND checkOutDate < now (== getOverdueDays() > 0)
// New composite indexes required: (status + updatedAt), (status + checkOutDate)
// in firestore.indexes.json (prod + training). Until deployed these throw.
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
}

function startOfTomorrow() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return Timestamp.fromDate(d);
}

export async function countCheckInsToday() {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    where("status", "in", ["Checked In", "Checked Out"]),
    where("updatedAt", ">=", startOfToday()));
  return (await getCountFromServer(q)).data().count;
}

export async function countCheckOutsDue() {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    where("status", "==", "Checked In"),
    where("checkOutDate", "<", startOfTomorrow()));
  return (await getCountFromServer(q)).data().count;
}

export async function countOverdueCheckOuts() {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    where("status", "==", "Checked In"),
    where("checkOutDate", "<", Timestamp.fromDate(new Date())));
  return (await getCountFromServer(q)).data().count;
}

export function subscribeToPendingBookingRequests(
  callback) {
  const col = bookingsCollection();
  const q = query(
    collection(db, col),
    where("status", "==", "Pending"),
    orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const pending = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(pending);
    },
    (error) => {
      console.error("[bookingsService] subscribeToPendingBookingRequests error:", error);
      callback([]);
    }
  );
}

/**
 * Returns a Set of room IDs that have conflicting bookings for the selected date range.
 * A conflict is defined as a booking in status "Awaiting Payment", "Pending", "Approved",
 * or "Checked In" that overlaps with [checkInStr, checkOutStr].
 *
 * @param {string} checkInStr YYYY-MM-DD
 * @param {string} checkOutStr YYYY-MM-DD
 * @returns {Promise<Set<string>>} Set of conflicting room IDs
 */
export async function getAvailableRoomIds(checkInStr, checkOutStr) {
  const checkIn = toDate(checkInStr);
  const checkOut = toDate(checkOutStr);
  if (!checkIn || !checkOut || checkOut <= checkIn) return new Set();

  // PII-free markers in both modes. Guests cannot read other guests'
  // bookings, so markers are the only safe source — the old training branch
  // queried training_bookings directly and rules denied every trainee guest.
  return getBlockedRoomIds(checkInStr, checkOutStr);
}

/**
 * Returns full room objects that are available (not conflicted) for the given
 * date range. Only includes active rooms. This is the single source of truth
 * used by Browse Rooms filtering AND the wizard's defensive pre-submit check.
 *
 * @param {string} checkInStr  YYYY-MM-DD
 * @param {string} checkOutStr YYYY-MM-DD
 * @returns {Promise<Array>} Array of room objects available for those dates
 */
export async function getAvailableRooms(checkInStr, checkOutStr) {
  const checkIn = toDate(checkInStr);
  const checkOut = toDate(checkOutStr);
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];

  const [conflictingIds, allRooms] = await Promise.all([
    getAvailableRoomIds(checkInStr, checkOutStr),
    listRooms(),
  ]);

  return allRooms.filter(
    (room) => isRoomActive(room) && !conflictingIds.has(room.id)
  );
}
