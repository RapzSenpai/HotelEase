import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebase/firebase.config";
import {
  ACTIVE_STATUSES,
  clearBookingMarked,
  nightKeys,
  setBookingMarked,
} from "./availabilityService";

/**
 * Bookings whose nights MUST be blocked by a marker. "Cancellation Requested"
 * still holds the room until staff approve, so it belongs here — the hourly
 * worker orphan sweep deliberately leaves it alone too.
 */
const HOLDING_STATUSES = [...ACTIVE_STATUSES, "Cancellation Requested"];

/** Terminal bookings must never leave a marker behind. */
const TERMINAL_STATUSES = new Set(["Cancelled", "Checked Out"]);

const markerKey = (roomId, date) => `${roomId}_${date}`;

/**
 * Compare `bookings` (source of truth) against the PII-free `room_availability`
 * markers and report drift in both directions.
 *
 * Pure and side-effect free so it can be unit tested — see
 * src/test/availability-reconciliation.test.js.
 *
 * @returns {{ orphanMarkers: Array, missingMarkers: Array }}
 */
export function diffAvailability(bookings = [], markers = []) {
  const bookingsById = new Map(bookings.map((b) => [b.id, b]));
  const existingKeys = new Set(markers.map((m) => markerKey(m.roomId, m.date)));

  // Markers that nothing legitimately holds: an unknown/deleted booking, a
  // marker with no bookingId, or a booking that is now terminal.
  const orphanMarkers = markers.filter((marker) => {
    const booking = marker.bookingId ? bookingsById.get(marker.bookingId) : null;
    return !booking || TERMINAL_STATUSES.has(booking.status);
  });

  // Nights that an active hold is missing a marker for.
  const missingMarkers = [];
  for (const booking of bookings) {
    if (!booking.roomId || !HOLDING_STATUSES.includes(booking.status)) continue;
    for (const date of nightKeys(booking.checkInDate, booking.checkOutDate)) {
      if (existingKeys.has(markerKey(booking.roomId, date))) continue;
      missingMarkers.push({
        roomId: booking.roomId,
        date,
        bookingId: booking.id,
        status: booking.status,
        checkIn: booking.checkInDate,
        checkOut: booking.checkOutDate,
      });
    }
  }

  return { orphanMarkers, missingMarkers };
}

/**
 * Read both collections (admin-only; guests cannot list bookings) and diff.
 * ponytail: reads whole collections — fine at this scale, revisit if a hotel
 * ever accumulates tens of thousands of bookings.
 */
export async function loadAvailabilityDiff() {
  const [bookingsSnap, markersSnap] = await Promise.all([
    getDocs(collection(db, "bookings")),
    getDocs(collection(db, "room_availability")),
  ]);

  return diffAvailability(
    bookingsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    markersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  );
}

/** Delete orphan markers, then re-block every night the active holds are missing. */
export async function repairAvailability({ orphanMarkers = [], missingMarkers = [] } = {}) {
  await Promise.all(
    orphanMarkers.map((m) => clearBookingMarked({ roomId: m.roomId, dates: [m.date] })),
  );

  // One call per booking re-writes its whole stay (idempotent).
  const byBooking = new Map();
  for (const miss of missingMarkers) {
    if (!byBooking.has(miss.bookingId)) {
      byBooking.set(miss.bookingId, {
        roomId: miss.roomId,
        checkIn: miss.checkIn,
        checkOut: miss.checkOut,
        status: miss.status,
      });
    }
  }
  await Promise.all(
    [...byBooking.entries()].map(([bookingId, b]) =>
      setBookingMarked({
        roomId: b.roomId,
        bookingId,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        status: b.status,
      }),
    ),
  );

  return { removed: orphanMarkers.length, restored: missingMarkers.length };
}
