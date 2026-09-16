import { getCol } from "@/lib/db-utils";
import { clearBookingMarked, nightKeys } from "../availabilityService";

/**
 * Shared internals for the bookings service. Everything in ./booking/* imports
 * from here, and this module imports nothing from its siblings — that one-way
 * edge is what keeps the split free of import cycles.
 */

export function bookingsCollection(trainingMode) {
  return getCol("bookings", trainingMode);
}

export function calcNights(checkIn, checkOut) {
  const ms = checkOut.getTime() - checkIn.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Release the PII-free availability markers for a booking's nights.
 *
 * This runs AFTER the booking has been flipped to a terminal status
 * (Cancelled / Checked Out / expired) — which is exactly why the Firestore
 * delete rule for /room_availability/{markerId} must not require the linked
 * booking to still be active (see firestore.rules). One retry absorbs
 * transient network failures; a genuine failure is logged with enough context
 * to fix by hand, and the hourly worker orphan sweep is the backstop.
 */
export async function releaseAvailabilityMarkers(booking, trainingMode = null) {
  if (!booking?.roomId) return;
  const dates = nightKeys(booking.checkInDate, booking.checkOutDate);
  if (dates.length === 0) return;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await clearBookingMarked({ roomId: booking.roomId, bookingId: booking.id, dates, trainingMode });
      return;
    } catch (e) {
      if (attempt === 1) {
        console.error(
          "[bookingsService] availability marker cleanup failed:",
          { bookingId: booking.id, roomId: booking.roomId, dates },
          e,
        );
        throw e;
      }
    }
  }
}
