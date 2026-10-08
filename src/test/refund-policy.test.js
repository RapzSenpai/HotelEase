import { describe, expect, it } from "vitest";
import { deadlineFor, guestRefundNotice, oneNightFor } from "@/lib/refund-policy";

describe("refund policy helpers", () => {
  it("uses the stored deadline when present", () => {
    const stored = new Date("2026-10-01T00:00:00Z");
    expect(deadlineFor({ cancellationDeadline: stored })).toBe(stored);
  });

  it("falls back to check-in minus 24 hours", () => {
    const checkIn = new Date("2026-10-05T14:00:00Z");
    const deadline = deadlineFor({ checkInDate: { toDate: () => checkIn } });
    expect(deadline.getTime()).toBe(checkIn.getTime() - 24 * 60 * 60 * 1000);
  });

  it("derives one night from baseTotal before totalCost", () => {
    expect(oneNightFor({ nights: 2, baseTotal: 1994, totalCost: 2500 })).toBe(997);
    expect(oneNightFor({ nights: 2, totalCost: 2500 })).toBe(1250);
    expect(oneNightFor({ nights: 0, baseTotal: 1994 })).toBe(0);
    expect(oneNightFor(null)).toBe(0);
  });

  it("shows the refund step only when money is actually due", () => {
    const due = guestRefundNotice({ mode: "cancelled", paid: 1994, fee: 997, refund: 997, reason: "late" });
    expect(due).toEqual({ mode: "cancelled", paid: 1994, fee: 997, refund: 997, reason: "late" });

    // Unpaid, or the one-night fee swallowed the whole payment, or a
    // non-refundable rate with no override → nothing to explain.
    expect(guestRefundNotice({ paid: 0, fee: 0, refund: 0 })).toBeNull();
    expect(guestRefundNotice({ paid: 1994, fee: 1994, refund: 0, reason: "no" })).toBeNull();
    expect(guestRefundNotice({ paid: 1994, refund: -5 })).toBeNull();
  });

  it("keeps the request wording for an approved booking awaiting review", () => {
    expect(guestRefundNotice({ mode: "requested", paid: 1994, fee: 0, refund: 1994 }).mode).toBe("requested");
    // Anything unexpected fails closed to the final-cancellation wording.
    expect(guestRefundNotice({ mode: "whatever", paid: 100, refund: 100 }).mode).toBe("cancelled");
  });
});
