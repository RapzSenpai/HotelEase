import { toJsDate } from "./time-utils";

const HOUR_MS = 60 * 60 * 1000;

/** True when a Pending booking already has money attached to it. */
export function hasRecordedPayment(booking) {
  if (!booking) return false;
  return Boolean(
    booking.paymentProofUrl ||
    booking.paymentGateway ||
    booking.paidAt ||
    Number(booking.payment?.deposit ?? 0) > 0);
}

/** When the booking entered the approval queue (payment event first). */
function pendingSince(booking) {
  return booking?.proofUploadedAt ?? booking?.paidAt ?? booking?.createdAt ?? null;
}

/** Compact "Pending 1d 6h" badge data; null for any non-Pending status. */
export function pendingAgeInfo(booking, now = Date.now()) {
  if (!booking || booking.status !== "Pending") return null;
  const since = toJsDate(pendingSince(booking));
  if (!since) return null;

  const ms = Math.max(0, now - since.getTime());
  const hours = Math.floor(ms / HOUR_MS);
  const days = Math.floor(hours / 24);
  const text = days > 0
    ? `${days}d ${hours % 24}h`
    : hours > 0
      ? `${hours}h`
      : "<1h";

  return { text, hours, overdue: ms >= 24 * HOUR_MS };
}
