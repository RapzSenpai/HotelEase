// Pure fixture selectors for the demo FO pages (no services, no hooks).
import { deadlineFor, oneNightFor } from "@/lib/refund-policy";
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

export const REFUND_METHODS = [
  "GCash",
  "Bank Transfer",
  "Over-the-Counter (Cash)",
  "Other",
];

const REFERENCE_REQUIRED = new Set(["GCash", "Bank Transfer"]);

export const refundMethodNeedsReference = (method) => REFERENCE_REQUIRED.has(method);

export const paidRefundsFor = (refunds, bookingId) =>
  refunds
    .filter((r) => r.bookingId === bookingId && r.status === "Paid")
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

// ponytail: demo copy of computeRefund — the demo tree cannot import services.
// Standard rate only until a non-refundable fixture is added.
export function demoRefund({ paid, cancelTime, deadline, oneNightRate } = {}) {
  const p = Number(paid ?? 0);
  if (!Number.isFinite(p) || p <= 0) {
    return { fee: 0, refund: 0, reason: "No recorded payment — nothing to refund." };
  }
  const cancelMs = cancelTime instanceof Date ? cancelTime.getTime() : Number(cancelTime);
  const deadlineMs = deadline == null
    ? null
    : deadline instanceof Date ? deadline.getTime() : Number(deadline);
  const oneNight = Number(oneNightRate ?? 0);
  const nightFee = Number.isFinite(oneNight) && oneNight > 0 ? oneNight : 0;
  const early = deadlineMs == null || !Number.isFinite(cancelMs) || cancelMs <= deadlineMs;
  if (early) {
    return { fee: 0, refund: p, reason: "Cancelled before the free-cancellation deadline — full refund." };
  }
  const fee = Math.min(p, nightFee);
  const refund = Math.max(0, Math.min(p, p - nightFee));
  const reason = refund <= 0
    ? "Cancelled after the free-cancellation deadline — the one-night fee covers the whole payment."
    : "Cancelled after the free-cancellation deadline — one night's rate is withheld.";
  return { fee, refund, reason };
}

function defaultRefundMethod(payments, bookingId) {
  const methods = new Set(
    payments.filter((p) => p.bookingId === bookingId).map((p) => String(p.method ?? "")),
  );
  if (methods.has("GCash")) return "GCash";
  if (methods.has("Bank Transfer")) return "Bank Transfer";
  if (methods.has("Over-the-Counter") || methods.has("Credit/Debit Card")) {
    return "Over-the-Counter (Cash)";
  }
  return "GCash";
}

export function refundSuggestion(booking, payments) {
  const paid = paidFor(payments, booking.id);
  const cancelTime = booking.cancellationRequestedAt?.toDate?.() ?? new Date();
  return {
    paid,
    method: defaultRefundMethod(payments, booking.id),
    ...demoRefund({
      paid,
      cancelTime,
      deadline: deadlineFor(booking),
      oneNightRate: oneNightFor(booking),
    }),
  };
}

export function refundableFor(bookingId, payments, refunds) {
  return Math.max(0, paidFor(payments, bookingId) - paidRefundsFor(refunds, bookingId));
}

export function validateDemoRefundProof({ method, referenceNumber, note } = {}) {
  const reference = String(referenceNumber ?? "").trim();
  const cleanNote = String(note ?? "").trim();
  if (refundMethodNeedsReference(method) && !reference) {
    return { ok: false, error: `${method} refunds need a reference number.` };
  }
  if (!refundMethodNeedsReference(method) && !reference && !cleanNote) {
    return {
      ok: false,
      error: "Add a reference or a note (OR no. / who received the cash) so this refund stays auditable.",
    };
  }
  return { ok: true, referenceNumber: reference, note: cleanNote };
}
