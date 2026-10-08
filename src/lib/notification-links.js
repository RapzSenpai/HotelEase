/**
 * Does the page the user is looking at now count as "visited" for this
 * notification link? Used to auto-ack an unread notification once its target
 * is open, without any per-event-type logic.
 *
 * Path must match. When the link carries a bookingId, the visited URL must
 * carry the same one — landing on /my-bookings generally must not ack every
 * refund notification for every booking.
 */
export function notificationMatchesVisit(link, { pathname = "", bookingId = null } = {}) {
  if (!link || !pathname) return false;
  const [path, query = ""] = String(link).split("?");
  if (path !== pathname) return false;
  const linkBookingId = new URLSearchParams(query).get("bookingId");
  if (linkBookingId) return linkBookingId === bookingId;
  return true;
}

export function unreadNotificationIdsForVisit(notifications, visit) {
  return notifications
    .filter((notification) => !notification.isRead)
    .filter((notification) => notificationMatchesVisit(notification.link, visit))
    .map((notification) => notification.id);
}
