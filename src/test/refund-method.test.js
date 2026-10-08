import { describe, expect, it } from "vitest";
import {
  REFUND_METHODS,
  assertRefundMethod,
  canMarkRefundPaid,
  defaultRefundMethod,
  refundMethodCopy,
  refundMethodNeedsReference,
  validateRefundReference,
} from "@/services/refundsService";

describe("refund method", () => {
  it("defaults the refund channel from how the guest actually paid", () => {
    expect(defaultRefundMethod(["GCash"])).toBe("GCash");
    expect(defaultRefundMethod(["Bank Transfer"])).toBe("Bank Transfer");
    expect(defaultRefundMethod(["Over-the-Counter"])).toBe("Over-the-Counter (Cash)");
    expect(defaultRefundMethod(["Credit/Debit Card", "GCash"])).toBe("GCash");
    expect(defaultRefundMethod([])).toBe("GCash");
  });

  it("accepts only the supported methods", () => {
    for (const method of REFUND_METHODS) expect(assertRefundMethod(method)).toBe(method);
    expect(() => assertRefundMethod("PayPal")).toThrow(/refund method/i);
    expect(() => assertRefundMethod(null)).toThrow(/refund method/i);
  });
});

describe("refund reference is required only where a transfer leaves one", () => {
  it("requires a reference for GCash and bank transfers", () => {
    expect(refundMethodNeedsReference("GCash")).toBe(true);
    expect(refundMethodNeedsReference("Bank Transfer")).toBe(true);
    expect(refundMethodNeedsReference("Over-the-Counter (Cash)")).toBe(false);
    expect(refundMethodNeedsReference("Other")).toBe(false);

    expect(validateRefundReference({ method: "GCash", referenceNumber: "" }).ok).toBe(false);
    expect(validateRefundReference({ method: "Bank Transfer", note: "handed over" }).ok).toBe(false);
    expect(validateRefundReference({ method: "GCash", referenceNumber: " 0012 3456 " })).toMatchObject({
      ok: true,
      referenceNumber: "0012 3456",
    });
  });

  it("lets OTC/cash refunds log a note instead of a fake reference", () => {
    expect(
      validateRefundReference({ method: "Over-the-Counter (Cash)", note: "OR #1234, received by A. Cruz" }),
    ).toMatchObject({ ok: true, referenceNumber: null, note: "OR #1234, received by A. Cruz" });
    expect(validateRefundReference({ method: "Over-the-Counter (Cash)", referenceNumber: "OR-1234" }).ok).toBe(true);
    // Still auditable: no reference AND no note is refused.
    expect(validateRefundReference({ method: "Over-the-Counter (Cash)" }).ok).toBe(false);
    expect(validateRefundReference({ method: "Other" }).ok).toBe(false);
  });

  it("rejects an unsupported method", () => {
    expect(validateRefundReference({ method: "PayPal", referenceNumber: "x" }).ok).toBe(false);
  });

  it("gates Mark Paid by method requirements and acting state", () => {
    expect(canMarkRefundPaid({ method: "GCash" })).toBe(false);
    expect(canMarkRefundPaid({ method: "Bank Transfer", referenceNumber: "ref-1" })).toBe(true);
    expect(canMarkRefundPaid({ method: "Over-the-Counter (Cash)", note: "OR 123" })).toBe(true);
    expect(canMarkRefundPaid({ method: "Other" })).toBe(false);
    expect(canMarkRefundPaid({
      isActing: true,
      method: "Over-the-Counter (Cash)",
      note: "OR 123",
    })).toBe(false);
  });
});

describe("refund method copy", () => {
  it("describes the actual channel for the guest", () => {
    expect(refundMethodCopy("GCash")).toMatch(/GCash/);
    expect(refundMethodCopy("Bank Transfer")).toMatch(/bank transfer/i);
    expect(refundMethodCopy("Over-the-Counter (Cash)")).toMatch(/front desk/i);
    expect(refundMethodCopy("Other")).toBeTruthy();
    expect(refundMethodCopy(null)).toBeTruthy();
  });
});
