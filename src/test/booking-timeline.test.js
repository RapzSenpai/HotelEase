import { describe, expect, it } from "vitest";
import { bookingTimeline, TIMELINE_STAGES } from "@/lib/booking-timeline";

// Stages must mirror the REAL lifecycle only — no invented statuses.
// Requested → Payment → Approved → Checked In → Completed (+ terminal Cancelled).

const b = (status, extra = {}) => ({ status, ...extra });

describe("bookingTimeline — every existing status maps onto the real lifecycle", () => {
  it("Awaiting Payment: payment step current, nothing else progressed", () => {
    const t = bookingTimeline(b("Awaiting Payment"));
    expect(t.done).toEqual([0]);
    expect(t.current).toBe(1);
    expect(t.cancelled).toBe(false);
    expect(t.note).toMatch(/deadline|payment/i);
  });

  it("Awaiting Payment note includes the payment deadline when stored", () => {
    const t = bookingTimeline(
      b("Awaiting Payment", {
        paymentDeadline: new Date(2026, 0, 15, 20, 0).toISOString()}));
    expect(t.note).toMatch(/before 8?[:.]?00 PM|Jan 15/i);
  });

  it("Pending: payment done, Front Office approval is the current step", () => {
    const t = bookingTimeline(b("Pending"));
    expect(t.done).toEqual([0, 1]);
    expect(t.current).toBe(2);
    expect(t.note).toMatch(/front office/i);
  });

  it("Cancellation Requested: approval done, current step paused for review", () => {
    const t = bookingTimeline(b("Cancellation Requested"));
    expect(t.done).toEqual([0, 1, 2]);
    expect(t.current).toBe(null);
    expect(t.cancelled).toBe(false);
    expect(t.note).toMatch(/cancellation/i);
  });

  it("Approved: ready for check-in", () => {
    const t = bookingTimeline(b("Approved"));
    expect(t.done).toEqual([0, 1, 2]);
    expect(t.current).toBe(3);
    expect(t.note).toMatch(/check in|see you|front desk/i);
  });

  it("Checked In: stay in progress, completion next", () => {
    const t = bookingTimeline(b("Checked In"));
    expect(t.done).toEqual([0, 1, 2, 3]);
    expect(t.current).toBe(4);
  });

  it("Checked Out: whole strip done", () => {
    const t = bookingTimeline(b("Checked Out"));
    expect(t.done).toEqual(TIMELINE_STAGES.map((_, i) => i));
    expect(t.current).toBe(null);
  });

  it("Cancelled: Requested done, others hidden, red terminal node", () => {
    const t = bookingTimeline(b("Cancelled"));
    expect(t.done).toEqual([0]);
    expect(t.current).toBe(null);
    expect(t.cancelled).toBe(true);
    expect(t.note).toBeTruthy();
  });

  it("Cancelled keeps a sheltered strip: Requested done + red terminal node", () => {
    // Whether the guest cancelled during payment or before check-in, nothing
    // after "Requested" is shown as done — the reason line carries the story.
    const t = bookingTimeline(b("Cancelled", {
      status: "Cancelled"}));
    expect(t.done).toEqual([0]);
    expect(t.cancelled).toBe(true);

    // Untyped status falls back to Pending-safe default, never crashes.
    expect(() => bookingTimeline(b(null))).not.toThrow();
    expect(bookingTimeline(b(null)).current).toBe(2);
  });

  it("Cancelled note surfaces the stored reason (no-show / rejected / expiry)", () => {
    expect(bookingTimeline(b("Cancelled", { noShow: true })).note)
      .toMatch(/no-show/i);
    expect(bookingTimeline(b("Cancelled", {
      rejectionReason: "Payment deadline expired"})).note)
      .toMatch(/deadline/i);
    expect(bookingTimeline(b("Cancelled", {
      rejectionReason: "Room unavailable"})).note)
      .toContain("Room unavailable");
    // Plain cancel: still a sane note.
    expect(bookingTimeline(b("Cancelled")).note).toContain("cancelled");
  });
});
