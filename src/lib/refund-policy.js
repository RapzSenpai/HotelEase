/**
 * Refund policy inputs shared by the FO cancellation queue and the guest
 * cancel dialog, so both sides explain the same numbers from the same rule.
 */

/** Free-cancellation deadline: the stored one, else check-in minus 24 hours. */
export function deadlineFor(booking) {
  if (booking?.cancellationDeadline) return booking.cancellationDeadline;
  const checkIn = booking?.checkInDate?.toDate
    ? booking.checkInDate.toDate()
    : new Date(booking?.checkInDate);
  if (Number.isNaN(checkIn?.getTime?.() ?? NaN)) return null;
  return new Date(checkIn.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * Terms "one-night charge": baseTotal / nights, falling back to
 * totalCost / nights only when the base is missing (extra-pax fees and
 * overstay fees must not inflate the withheld night).
 */
export function oneNightFor(booking) {
  const nights = Number(booking?.nights ?? 0);
  if (nights > 0) {
    const base = Number(booking?.baseTotal ?? NaN);
    if (Number.isFinite(base) && base > 0) return base / nights;
    const total = Number(booking?.totalCost ?? 0);
    if (Number.isFinite(total) && total > 0) return total / nights;
  }
  return 0;
}

/**
 * The guest-facing refund step after a cancel — or null when no money is due
 * (unpaid booking, or a fee that swallowed the whole payment), so the dialog
 * closes instead of popping a "no refund" card nobody asked for.
 *
 * `mode` picks the wording:
 * - "cancelled": the booking is cancelled now, the amount is final.
 * - "requested": an approved booking only *requested* cancellation — the Front
 *   Office still decides, so the amount is what the policy would pay.
 */
export function guestRefundNotice({ mode = "cancelled", paid = 0, fee = 0, refund = 0, reason = null } = {}) {
  const paidNum = Number(paid ?? 0);
  const refundNum = Number(refund ?? 0);
  if (!Number.isFinite(paidNum) || paidNum <= 0) return null;
  if (!Number.isFinite(refundNum) || refundNum <= 0) return null;
  return {
    mode: mode === "requested" ? "requested" : "cancelled",
    paid: paidNum,
    fee: Number(fee ?? 0),
    refund: refundNum,
    reason: reason || null,
  };
}
