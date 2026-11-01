import { toLocalDate } from "./time-utils";

/**
 * Display metadata for booking statuses. `rank` breaks ties when a booking's
 * night markers were updated unevenly (a partial refresh leaves old and new
 * statuses on the same booking) — the most advanced status is the live one.
 */
export const CALENDAR_STATUS_META = {
  "Awaiting Payment": { label: "Awaiting Payment", color: "#F59E0B", rank: 1 },
  Pending: { label: "Pending Approval", color: "#F97316", rank: 2 },
  Approved: { label: "Reserved", color: "#8B5CF6", rank: 3 },
  "Checked In": { label: "Occupied", color: "#EF4444", rank: 4 },
  "Checked Out": { label: "Checked Out", color: "#6B7280", rank: 5 },
  Cancelled: { label: "Cancelled", color: "#94A3B8", rank: 0 },
};

const FALLBACK_COLOR = "#F5C518";

export function calendarStatusLabel(status) {
  return CALENDAR_STATUS_META[status]?.label || status || "Booked";
}

/** YYYY-MM-DD in the guest's local timezone. */
export function localDateKey(dateLike) {
  const date = toLocalDate(dateLike);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Rebuild full-range booking bars from PII-free night markers.
 *
 * Event `end` stays exclusive, matching FullCalendar and the hotel-night
 * model: check-in 24th → check-out 30th paints nights 24–29. The checkout day
 * itself is returned separately so the cell can show a "Check-out" cue without
 * marking that day occupied.
 */
export function buildCalendarEvents(cards) {
  const byBooking = new Map();

  for (const card of cards || []) {
    if (!card?.bookingId) continue;
    const date = toLocalDate(card.date);
    if (!date) continue;
    const end = new Date(date);
    end.setDate(end.getDate() + 1);

    const group = byBooking.get(card.bookingId);
    if (!group) {
      byBooking.set(card.bookingId, {
        id: card.bookingId,
        status: card.status,
        start: date,
        end,
      });
      continue;
    }

    if (date < group.start) group.start = date;
    if (end > group.end) group.end = end;

    const currentRank = CALENDAR_STATUS_META[group.status]?.rank ?? 0;
    const nextRank = CALENDAR_STATUS_META[card.status]?.rank ?? 0;
    if (nextRank > currentRank) group.status = card.status;
  }

  const checkoutDates = new Set();
  const events = [...byBooking.values()].map((group) => {
    const meta = CALENDAR_STATUS_META[group.status];
    const checkoutKey = localDateKey(group.end);
    if (checkoutKey) checkoutDates.add(checkoutKey);

    return {
      id: group.id,
      title: calendarStatusLabel(group.status),
      start: group.start,
      end: group.end,
      backgroundColor: meta?.color || FALLBACK_COLOR,
      borderColor: meta?.color || FALLBACK_COLOR,
      allDay: true,
      extendedProps: {
        status: group.status,
        checkIn: group.start,
        checkOut: group.end,
      },
    };
  });

  return { events, checkoutDates };
}
