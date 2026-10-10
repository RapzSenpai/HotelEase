// Pure fixture selectors for the guest demo pages (no services, no hooks).
import { balanceOf } from "../fo/foDemoData";

export { balanceOf };

export const activeRooms = (rooms) => rooms.filter((room) => room.isActive !== false);

export const byNewest = (bookings) =>
  [...bookings].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

/** Bookings the guest can still pay for: a balance left and not cancelled. */
export const payableBookings = (data) =>
  byNewest(data.bookings).filter(
    (b) =>
      ["Pending", "Awaiting Payment", "Approved"].includes(b.status) &&
      balanceOf(b, data.payments) > 0,
  );

/** The stay the guest is in right now — the only one that can ask for cleaning. */
export const stayBooking = (data) => data.bookings.find((b) => b.status === "Checked In") ?? null;

export const upcomingBooking = (data) => data.bookings.find((b) => b.status === "Approved") ?? null;

export const reviewableBooking = (data) =>
  data.bookings.find((b) => b.status === "Checked Out" && b.demoRating == null) ?? null;

export const roomOfBooking = (data, booking) =>
  (booking && data.rooms.find((room) => room.id === booking.roomId)) || null;
