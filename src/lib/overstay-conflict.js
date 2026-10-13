import { toLocalDate } from "./time-utils";

// Mirrors availabilityService ACTIVE_STATUSES (kept local so this stays a
// dependency-free pure helper): these statuses hold the room for their nights.
const HOLDING_STATUSES = new Set([
  "Awaiting Payment",
  "Pending",
  "Approved",
  "Checked In",
]);

/**
 * Earliest active booking for the same room that overlaps the overstay window
 * [selected.checkOutDate, tomorrow) — i.e. the next guest the overstaying
 * guest is about to collide with. Returns null when there is no conflict.
 */
export function findOverstayConflict(roomBookings, selectedBooking, now = new Date()) {
  const selOut = toLocalDate(selectedBooking?.checkOutDate);
  if (!selOut || !selectedBooking?.id || !Array.isArray(roomBookings)) return null;

  const tomorrow = new Date(now);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const candidates = [];
  for (const b of roomBookings) {
    if (!b || b.id === selectedBooking.id || !HOLDING_STATUSES.has(b.status)) continue;
    const bIn = toLocalDate(b.checkInDate);
    const bOut = toLocalDate(b.checkOutDate);
    if (!bIn || !bOut) continue;
    if (bIn < tomorrow && bOut > selOut) candidates.push({ booking: b, checkIn: bIn });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.checkIn - b.checkIn);
  return candidates[0].booking;
}

/** Display name for the conflicting booking without an extra user fetch. */
export function conflictGuestName(conflictBooking, guestsMap = {}) {
  if (!conflictBooking) return "another guest";
  return (
    guestsMap[conflictBooking.guestId]?.fullName ||
    conflictBooking.leadGuestName ||
    conflictBooking.guestName ||
    "another guest"
  );
}
