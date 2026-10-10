import { describe, expect, it } from "vitest";
import { getOverdueDays } from "@/services/booking/queries";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysAhead(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

describe("getOverdueDays", () => {
  it("counts whole calendar days past checkout, stable within a day", () => {
    expect(getOverdueDays(daysAgo(1))).toBe(1);
    expect(getOverdueDays(daysAgo(3))).toBe(3);
  });

  it("returns 0 through the noon deadline and for future dates", () => {
    expect(getOverdueDays(daysAhead(1))).toBe(0);
    expect(getOverdueDays(null)).toBe(0);
    expect(getOverdueDays("not-a-date")).toBe(0);
  });

  it("accepts Firestore-like timestamps", () => {
    const d = daysAgo(2);
    expect(getOverdueDays({ toDate: () => d })).toBe(2);
  });
});
