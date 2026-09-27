import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
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

export async function listBookingsForUser(uid, { trainingMode = null } = {}) {
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("guestId", "==", uid),
    orderBy("checkInDate", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToUserBookings(uid, callback, { trainingMode = null } = {}) {
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("guestId", "==", uid),
    orderBy("checkInDate", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(bookings);
    },
    (error) => {
      console.error("[bookingsService] subscribeToUserBookings error:", error);
      callback([]);
    },
  );
}

export async function listBookingsForRoom(
  roomId,
  { trainingMode = null } = {},
) {
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("roomId", "==", roomId),
    orderBy("checkInDate", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBooking(bookingId, { trainingMode = null } = {}) {
  if (!bookingId || typeof bookingId !== "string") return null;
  const col = bookingsCollection(trainingMode);
  const ref = doc(db, col, bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listBookingsByStatuses(
  statuses,
  { trainingMode = null } = {},
) {
  if (!Array.isArray(statuses) || statuses.length === 0) return [];
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("status", "in", statuses),
    orderBy("checkInDate", "desc"),
  );
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

export function subscribeToAllBookings(callback, { trainingMode = null } = {}) {
  const col = bookingsCollection(trainingMode);
  const q = query(collection(db, col), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(bookings);
    },
    (error) => {
      console.error("[bookingsService] subscribeToAllBookings error:", error);
      callback([]);
    }
  );
}

export function subscribeToPendingBookingRequests(
  callback,
  { trainingMode = null } = {},
) {
  const col = bookingsCollection(trainingMode);
  const q = query(
    collection(db, col),
    where("status", "==", "Pending"),
    orderBy("createdAt", "desc"),
  );
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
 * @param {{ trainingMode?: boolean }} options
 * @returns {Promise<Set<string>>} Set of conflicting room IDs
 */
export async function getAvailableRoomIds(checkInStr, checkOutStr, { trainingMode = null } = {}) {
  const checkIn = toDate(checkInStr);
  const checkOut = toDate(checkOutStr);
  if (!checkIn || !checkOut || checkOut <= checkIn) return new Set();

  // PII-free markers in both modes. Guests cannot read other guests'
  // bookings, so markers are the only safe source — the old training branch
  // queried training_bookings directly and rules denied every trainee guest.
  return getBlockedRoomIds(checkInStr, checkOutStr, { trainingMode });
}

/**
 * Returns full room objects that are available (not conflicted) for the given
 * date range. Only includes active rooms. This is the single source of truth
 * used by Browse Rooms filtering AND the wizard's defensive pre-submit check.
 *
 * @param {string} checkInStr  YYYY-MM-DD
 * @param {string} checkOutStr YYYY-MM-DD
 * @param {{ trainingMode?: boolean }} options
 * @returns {Promise<Array>} Array of room objects available for those dates
 */
export async function getAvailableRooms(checkInStr, checkOutStr, { trainingMode = null } = {}) {
  const checkIn = toDate(checkInStr);
  const checkOut = toDate(checkOutStr);
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];

  const [conflictingIds, allRooms] = await Promise.all([
    getAvailableRoomIds(checkInStr, checkOutStr, { trainingMode }),
    listRooms({ trainingMode }),
  ]);

  return allRooms.filter(
    (room) => isRoomActive(room) && !conflictingIds.has(room.id)
  );
}
