// Pure fixture selectors for the demo FO pages (no services, no hooks).
import { DIRTY_ROOM_STATUSES } from "../fixtures";

export const paidFor = (payments, bookingId) =>
  payments
    .filter((p) => p.bookingId === bookingId)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

export const balanceOf = (booking, payments) =>
  Math.max(0, Number(booking.totalCost ?? 0) - paidFor(payments, booking.id));

export const dirtyRooms = (rooms) =>
  rooms.filter((room) => DIRTY_ROOM_STATUSES.includes(room.status));

export const byCheckIn = (bookings) =>
  [...bookings].sort((a, b) => a.checkInDate.toMillis() - b.checkInDate.toMillis());
