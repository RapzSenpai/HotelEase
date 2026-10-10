// Pure fixture selectors for the demo admin pages (no services, no hooks).
import { paidFor } from "../fo/foDemoData";

export const collected = (payments) =>
  payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

export const outstanding = (bookings, payments) =>
  bookings.reduce((sum, b) => sum + Math.max(0, Number(b.totalCost ?? 0) - paidFor(payments, b.id)), 0);

/** Rooms that are not sellable right now: in-house, held, or out of service. */
export const occupancy = (rooms) => {
  const inUse = rooms.filter((r) => r.status !== "Available").length;
  return { inUse, total: rooms.length, pct: rooms.length ? Math.round((inUse / rooms.length) * 100) : 0 };
};

export const openAlerts = (alerts) => alerts.filter((a) => a.status !== "resolved");

export const pendingTestimonials = (testimonials) =>
  testimonials.filter((t) => t.status === "pending");

/** Revenue and booking count per room type — the admin analytics breakdown. */
export function revenueByRoomType(data) {
  const types = new Map();
  for (const booking of data.bookings) {
    const room = data.rooms.find((r) => r.id === booking.roomId);
    const type = room?.type ?? "Unassigned";
    const row = types.get(type) ?? { id: type, type, bookings: 0, revenue: 0 };
    row.bookings += 1;
    row.revenue += paidFor(data.payments, booking.id);
    types.set(type, row);
  }
  return [...types.values()].sort((a, b) => b.revenue - a.revenue);
}
