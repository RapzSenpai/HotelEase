/**
 * Bookings service — public surface.
 *
 * This file used to be a single 1,260-line module. The implementation now lives
 * in ./booking/*, grouped by responsibility, and re-exported here so that every
 * existing `import { … } from "@/services/bookingsService"` keeps working
 * unchanged. Nothing about the logic changed: the functions moved verbatim, and
 * the module graph is one-way (core ← queries ← lifecycle), so there are no
 * import cycles.
 *
 *   core.js          shared internals: collection handles, night maths, marker release
 *   queries.js       reads, subscriptions, and room-availability lookups
 *   createBooking.js guest-facing booking creation
 *   lifecycle.js     front-office transitions, stay extension, fee, expiry sweep
 *   cancellations.js every path that ends a booking early
 *   paymentProof.js  guest payment-proof upload
 */

export {
  BOOKINGS_PAGE_SIZE,
  countBookingsByStatus,
  countBookingsPage,
  countCheckInsToday,
  countCheckOutsDue,
  countOverdueCheckOuts,
  getAvailableRoomIds,
  getAvailableRooms,
  getBooking,
  getOverdueDays,
  listBookingsByStatuses,
  listBookingsForRoom,
  listBookingsForUser,
  subscribeToBookingsPage,
  subscribeToHasBookings,
  subscribeToPendingBookingRequests,
  subscribeToUserBookings,
} from "./booking/queries";

export { createBooking } from "./booking/createBooking";

export {
  addOverstayFee,
  approveBooking,
  checkAndExpireStaleBookings,
  checkInBooking,
  checkOutBooking,
  extendStayBooking,
} from "./booking/lifecycle";

export {
  approveCancellation,
  cancelBooking,
  rejectBooking,
  rejectCancellation,
  requestCancellation,
} from "./booking/cancellations";

export { uploadPaymentProof } from "./booking/paymentProof";
