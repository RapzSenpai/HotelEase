import { describe, expect, it } from "vitest";
import { computeRefund } from "@/services/refundsService";

const DAY = 24 * 60 * 60 * 1000;

describe("computeRefund explanation", () => {
  it("explains an unpaid booking", () => {
    const { fee, refund, reason } = computeRefund({ paid: 0 });
    expect(fee).toBe(0);
    expect(refund).toBe(0);
    expect(reason).toMatch(/no recorded payment/i);
  });

  it("explains a full refund before the deadline", () => {
    const { fee, refund, reason } = computeRefund({
      paid: 1994,
      deadline: new Date(Date.now() + DAY),
      cancelTime: new Date(),
      oneNightRate: 997,
    });
    expect(fee).toBe(0);
    expect(refund).toBe(1994);
    expect(reason).toMatch(/full refund/i);
  });

  it("explains the one-night fee for the reported late case (₱1,994 paid, ₱997 withheld)", () => {
    const { fee, refund, reason } = computeRefund({
      paid: 1994,
      deadline: new Date(Date.now() - DAY),
      cancelTime: new Date(),
      oneNightRate: 997,
    });
    expect(fee).toBe(997);
    expect(refund).toBe(997);
    expect(reason).toMatch(/one night/i);
  });

  it("explains a non-refundable rate with no override", () => {
    const { fee, refund, reason } = computeRefund({
      paid: 1994,
      rateType: "NonRefundable",
      deadline: new Date(Date.now() + DAY),
      cancelTime: new Date(),
      oneNightRate: 997,
    });
    expect(fee).toBe(1994);
    expect(refund).toBe(0);
    expect(reason).toMatch(/non-refundable/i);
  });

  it("marks a non-refundable override as an override", () => {
    const { refund, reason } = computeRefund({
      paid: 1994,
      rateType: "NonRefundable",
      overrideReason: "Guest paid the room in full and cancelled early",
      deadline: new Date(Date.now() + DAY),
      cancelTime: new Date(),
    });
    expect(refund).toBe(1994);
    expect(reason).toMatch(/override/i);
  });

  it("explains when the fee swallows the whole payment", () => {
    const { fee, refund, reason } = computeRefund({
      paid: 500,
      deadline: new Date(Date.now() - DAY),
      cancelTime: new Date(),
      oneNightRate: 997,
    });
    expect(fee).toBe(500);
    expect(refund).toBe(0);
    expect(reason).toMatch(/covers the whole payment/i);
  });
});
