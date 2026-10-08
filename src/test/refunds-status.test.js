import { describe, expect, it } from "vitest";
import { isRefundRequestBlocked } from "@/services/refundsService";

describe("refund request status guard", () => {
  it("blocks requests when a booking already has an active refund state", () => {
    expect(isRefundRequestBlocked("Pending")).toBe(true);
    expect(isRefundRequestBlocked("Approved")).toBe(true);
    expect(isRefundRequestBlocked("Paid")).toBe(true);
  });

  it("allows new requests for non-blocking statuses", () => {
    expect(isRefundRequestBlocked("Rejected")).toBe(false);
    expect(isRefundRequestBlocked("None")).toBe(false);
    expect(isRefundRequestBlocked(null)).toBe(false);
  });
});
