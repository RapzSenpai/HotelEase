/**
 * Guest booking timeline mapping. Derived ONLY from the booking's existing
 * status field (+ wonderfully stored reason fields) — no new statuses, no
 * workflow changes. Stage list mirrors the real lifecycle:
 *
 *   Requested → Payment → Approved → Checked In → Completed
 *
 * A Cancelled booking instead renders Requested ✕ Cancelled, with the story
 * told by the stored rejectionReason / noShow fields.
 */

export const TIMELINE_STAGES = [
  "Requested",
  "Payment",
  "Approved",
  "Checked In",
  "Completed"];

// status → { done: stages completed, current: active stage (or null) }
const STATUS_TO_TIMELINE = {
  "Awaiting Payment": { done: [0], current: 1 },
  Pending: { done: [0, 1], current: 2 },
  "Cancellation Requested": { done: [0, 1, 2], current: null },
  Approved: { done: [0, 1, 2], current: 3 },
  "Checked In": { done: [0, 1, 2, 3], current: 4 },
  "Checked Out": { done: [0, 1, 2, 3, 4], current: null }};

const CANCELLED_TIMELINE = { done: [0], current: null, cancelled: true };

function deadlineNote(booking) {
  const raw = booking?.paymentDeadline?.toDate?.() ?? booking?.paymentDeadline;
  const d = raw instanceof Date ? raw : raw ? new Date(raw) : null;
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const text = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"});
  return ` Complete your payment before ${text}, or the hold expires.`;
}

function cancelledNote(booking) {
  if (booking?.noShow) {
    return "Marked as a no-show — the guest did not arrive. The one-night fee applies per the policy.";
  }
  const reason = typeof booking?.rejectionReason === "string"
    ? booking.rejectionReason.trim()
    : "";
  if (/deadline expired/i.test(reason)) {
    return "Cancelled — the payment deadline expired.";
  }
  if (reason) return `Cancelled — ${reason}`;
  return "This booking was cancelled."
    + (booking?.refundAmount > 0 ? " See the refund status below." : "");
}

export function bookingTimeline(booking) {
  const status = booking?.status || "Pending";
  const t = STATUS_TO_TIMELINE[status];
  if (!t) return { ...CANCELLED_TIMELINE, note: cancelledNote(booking) };

  const base = { ...t, cancelled: false };

  if (status === "Awaiting Payment") {
    return {
      ...base,
      note: "Booking received — waiting for your payment." + deadlineNote(booking)};
  }
  if (status === "Pending") {
    return { ...base, note: "Payment confirmed — waiting for Front Office approval." };
  }
  if (status === "Cancellation Requested") {
    return {
      ...base,
      note: "Cancellation requested — Front Office is reviewing your request. Steps pause until they approve or decline it."};
  }
  if (status === "Approved") {
    return {
      ...base,
      note: "Booking confirmed! Present this booking at the front desk for check-in."};
  }
  if (status === "Checked In") {
    return { ...base, note: "Enjoy your stay — check-out completes this booking." };
  }
  return {
    ...base,
    note: "Stay completed — thanks for staying with us."};
}
