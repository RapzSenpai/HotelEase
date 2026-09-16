import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/format";

// A Firestore-Timestamp-lookalike (has .toDate()).
const ts = (iso) => ({ toDate: () => new Date(iso) });

describe("formatDate", () => {
  it("formats a Date and a Timestamp as YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-03-05T00:00:00Z"))).toBe("2026-03-05");
    expect(formatDate(ts("2026-12-31T10:30:00Z"))).toBe("2026-12-31");
  });

  it("returns an em dash for missing/invalid input (never 1970)", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("returns a readable string for a valid input and an em dash otherwise", () => {
    expect(formatDateTime(ts("2026-03-05T10:30:00Z"))).not.toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("formats PHP with two decimals", () => {
    expect(formatCurrency(1234.5)).toBe("PHP 1,234.50");
    expect(formatCurrency("2500")).toBe("PHP 2,500.00");
  });

  it("returns an em dash for missing/invalid amounts", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency("abc")).toBe("—");
  });
});
