import { describe, expect, it } from "vitest";
import { hotelReceiptDataFromFolio } from "@/components/pdf/HotelReceiptDocument";

describe("hotel receipt folio fallback data", () => {
  it("uses paymentRef when reference is absent", () => {
    const data = hotelReceiptDataFromFolio({
      total: 200,
      amountPaid: 150,
      paymentRef: "PAY-123",
      guestName: "Alice",
      roomName: "101",
    });

    expect(data.refLine).toContain("PAY-123");
  });

  it("derives balance from total minus amountPaid when balance is missing", () => {
    const data = hotelReceiptDataFromFolio({
      total: 200,
      amountPaid: 150,
      guestName: "Alice",
      roomName: "101",
    });

    expect(data.balanceStr).toBe("PHP 50.00");
  });

  it("itemizes only active other charges", () => {
    const data = hotelReceiptDataFromFolio({
      total: 3950,
      baseTotal: 3000,
      overstayFee: 600,
      otherCharges: [
        { chargeId: "chg-1", label: "Minibar", amount: 350, voided: false },
        { chargeId: "chg-2", label: "Towel", amount: 250, voided: true }],
      roomName: "101",
    });

    expect(data.hasCharges).toBe(true);
    expect(data.charges).toHaveLength(1);
    expect(data.charges[0]).toMatchObject({ label: "Minibar", amountStr: "PHP 350.00" });
  });

  it("keeps voided charges out of the derived baseTotal", () => {
    const data = hotelReceiptDataFromFolio({
      total: 3250, // room 2000 + extra pax 250 + active charge 1000
      extraPaxTotal: 250,
      otherCharges: [
        { chargeId: "chg-1", label: "Damage", amount: 1000, voided: false },
        { chargeId: "chg-2", label: "Mistake", amount: 500, voided: true }],
      extraPaxFee: 125,
      extraPaxCount: 1,
      numberOfNights: 2,
      roomName: "101",
    });

    expect(data.baseTotalStr).toBe("PHP 2,000.00");
  });

  it("hides the charges line when there are no active charges", () => {
    const data = hotelReceiptDataFromFolio({
      total: 3000,
      baseTotal: 3000,
      otherCharges: [{ chargeId: "chg-9", label: "Minibar", amount: 350, voided: true }],
      roomName: "101",
    });

    expect(data.hasCharges).toBe(false);
    expect(data.charges).toHaveLength(0);
  });
});
