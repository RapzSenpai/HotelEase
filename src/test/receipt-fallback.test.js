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
});
