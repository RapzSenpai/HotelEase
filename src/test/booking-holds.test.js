import { describe, expect, it } from "vitest";
import { hasRecordedPayment, pendingAgeInfo } from "@/lib/booking-holds";

const ts = (iso) => ({ toDate: () => new Date(iso) });

describe("booking hold helpers", () => {
  it("treats a Pending booking with no proof, gateway, paidAt, or deposit as unpaid", () => {
    expect(hasRecordedPayment({ payment: { deposit: 0 } })).toBe(false);
    expect(hasRecordedPayment({ payment: {} })).toBe(false);
    expect(hasRecordedPayment(null)).toBe(false);
  });

  it("recognises every payment signal the booking lifecycle writes", () => {
    expect(hasRecordedPayment({ paymentProofUrl: "https://img" })).toBe(true);
    expect(hasRecordedPayment({ paymentGateway: "simulated" })).toBe(true);
    expect(hasRecordedPayment({ paidAt: ts("2026-10-30T10:00:00Z") })).toBe(true);
    expect(hasRecordedPayment({ payment: { deposit: 1500 } })).toBe(true);
  });

  it("measures Pending age from payment time before booking creation", () => {
    const booking = {
      status: "Pending",
      createdAt: ts("2026-10-30T00:00:00Z"),
      proofUploadedAt: ts("2026-10-30T06:00:00Z"),
    };
    expect(pendingAgeInfo(booking, new Date("2026-10-30T12:00:00Z").getTime())).toEqual({
      text: "6h",
      hours: 6,
      overdue: false,
    });
  });

  it("marks a Pending booking overdue after 24 hours and formats days", () => {
    const booking = {
      status: "Pending",
      createdAt: ts("2026-10-28T00:00:00Z"),
    };
    expect(pendingAgeInfo(booking, new Date("2026-10-29T06:00:00Z").getTime())).toEqual({
      text: "1d 6h",
      hours: 30,
      overdue: true,
    });
  });

  it("returns null outside Pending or without a usable timestamp", () => {
    expect(pendingAgeInfo({ status: "Approved", createdAt: ts("2026-10-30T00:00:00Z") })).toBeNull();
    expect(pendingAgeInfo({ status: "Pending" })).toBeNull();
  });
});
