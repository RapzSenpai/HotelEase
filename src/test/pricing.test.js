import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateBookingPricing,
  getRoomCapacity,
  ROOM_TYPE_CAPACITY_DEFAULTS,
} from "@/lib/roomCapacity";

/**
 * firestore.rules `bookingPriceIsValid()` re-derives exactly these numbers from
 * the room document to reject forged totals. If this formula changes, the rule
 * must change with it — this test is the tripwire.
 */
describe("calculateBookingPricing", () => {
  it("charges rate × nights with no extra-pax fee at base occupancy", () => {
    const p = calculateBookingPricing({
      ratePerNight: 2500,
      basePax: 2,
      maxPax: 4,
      extraPaxFee: 500,
      nights: 3,
      paxCount: 2,
    });
    expect(p.extraPaxCount).toBe(0);
    expect(p.baseTotal).toBe(7500);
    expect(p.extraPaxTotal).toBe(0);
    expect(p.totalCost).toBe(7500);
  });

  it("adds the extra-pax fee per extra guest per night", () => {
    const p = calculateBookingPricing({
      ratePerNight: 1000,
      basePax: 2,
      maxPax: 4,
      extraPaxFee: 300,
      nights: 2,
      paxCount: 4,
    });
    expect(p.extraPaxCount).toBe(2);
    expect(p.baseTotal).toBe(2000);
    expect(p.extraPaxTotal).toBe(2 * 300 * 2);
    expect(p.totalCost).toBe(3200);
  });

  it("never returns a total made of anything but base + extra", () => {
    const p = calculateBookingPricing({
      ratePerNight: 1499.5,
      basePax: 1,
      maxPax: 2,
      extraPaxFee: 300,
      nights: 4,
      paxCount: 3,
    });
    expect(p.totalCost).toBe(p.baseTotal + p.extraPaxTotal);
  });
});

describe("getRoomCapacity defaults (mirrored in firestore.rules)", () => {
  it("falls back to the per-type defaults when the room omits them", () => {
    expect(getRoomCapacity({ type: "Single Room" })).toMatchObject(
      ROOM_TYPE_CAPACITY_DEFAULTS["Single Room"],
    );
    expect(getRoomCapacity({ type: "Presidential Room" })).toMatchObject(
      ROOM_TYPE_CAPACITY_DEFAULTS["Presidential Room"],
    );
  });

  it("uses the generic fallback for an unknown room type", () => {
    expect(getRoomCapacity({ type: "Deluxe" })).toMatchObject({
      basePax: 2,
      maxPax: 4,
      extraPaxFee: 500,
    });
  });
});

/**
 * Mirrors firestore.rules `bookingNightsMatchDates()`. Without this check a
 * guest could declare `nights: 1` for a five-night stay and pay one night.
 * The rule allows +/-1h so a DST-crossing stay is never wrongly denied.
 */
function nightsMatchDates({ checkInMillis, checkOutMillis, nights }) {
  const spanMillis = checkOutMillis - checkInMillis;
  return (
    spanMillis >= nights * 86400000 - 3600000 &&
    spanMillis <= nights * 86400000 + 3600000
  );
}

describe("booking nights/date span (mirrored in firestore.rules)", () => {
  it("accepts a real client booking: local midnights, nights days apart", () => {
    // Exactly what createBooking writes: Timestamp.fromDate(localMidnight).
    // Built with the local-midnight Date constructor so this holds in any TZ.
    const checkIn = new Date(2026, 8, 20);
    const checkOut = new Date(2026, 8, 25);
    expect(
      nightsMatchDates({
        checkInMillis: checkIn.getTime(),
        checkOutMillis: checkOut.getTime(),
        nights: 5,
      }),
    ).toBe(true);
  });

  it("tolerates a DST-crossing stay (23h or 25h day)", () => {
    const base = new Date(2026, 2, 1).getTime();
    const span = 3 * 86400000;
    for (const drift of [-3600000, 3600000]) {
      expect(
        nightsMatchDates({
          checkInMillis: base,
          checkOutMillis: base + span + drift,
          nights: 3,
        }),
      ).toBe(true);
    }
  });

  it("rejects under-declared nights (the underpayment attack)", () => {
    const checkIn = new Date(2026, 8, 20).getTime();
    const checkOut = new Date(2026, 8, 25).getTime();
    expect(
      nightsMatchDates({ checkInMillis: checkIn, checkOutMillis: checkOut, nights: 1 }),
    ).toBe(false);
  });

  it("rejects over-declared nights and dates drifting past the tolerance", () => {
    const checkIn = new Date(2026, 8, 20).getTime();
    const checkOut = new Date(2026, 8, 25).getTime();
    expect(
      nightsMatchDates({ checkInMillis: checkIn, checkOutMillis: checkOut, nights: 30 }),
    ).toBe(false);
    expect(
      nightsMatchDates({
        checkInMillis: checkIn,
        checkOutMillis: checkOut + 3600001,
        nights: 5,
      }),
    ).toBe(false);
  });
});

/**
 * Tripwire for the exact mistake this rule already shipped once: the span was
 * computed as `(checkOutDate - checkInDate).seconds()`. The rules language has
 * no timestamp subtraction operator, and Timestamp.seconds() is the seconds
 * COMPONENT (0-59) — so it is both invalid and always tiny.
 */
describe("firestore.rules timestamp arithmetic", () => {
  // cwd is the vitest root (the repo root) — import.meta.url is not a file URL
  // under the test transform, so resolve from cwd instead.
  const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

  // Strip comments first: the rule documents BOTH traps by name, so a naive
  // grep would match its own warning text.
  const code = rules.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("never subtracts timestamps or uses .seconds() for a span", () => {
    expect(code).not.toMatch(/\.seconds\(\)/);
    expect(code).not.toMatch(/checkOutDate\s*-\s*[a-zA-Z.]*checkInDate/);
  });

  it("derives the stay span from toMillis()", () => {
    expect(code).toMatch(/checkOutDate\.toMillis\(\)\s*-\s*data\.checkInDate\.toMillis\(\)/);
  });
});
