import { describe, expect, it } from "vitest";
import {
  buildAuditSummary,
  businessDateKey,
  classifyArrivals,
  isNoShowEligible,
  nightsPastArrival,
  startOfBusinessDay} from "@/lib/night-audit";

// Fixed "now": Oct 21 2026, 20:30 local — so date boundaries behave the same
// in any CI timezone.
const NOW = new Date(2026, 9, 21, 20, 30, 0);
const day = (y, m, d, h = 14) => new Date(y, m - 1, d, h, 0, 0);

function booking({ checkInDate, status = "Approved", id = "bk1" } = {}) {
  return { id, checkInDate, status };
}

describe("businessDateKey", () => {
  it("formats the local calendar date as YYYY-MM-DD", () => {
    expect(businessDateKey(new Date(2026, 9, 5))).toBe("2026-10-05");
    expect(businessDateKey(new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
  });
});

describe("startOfBusinessDay", () => {
  it("returns local midnight of the given day", () => {
    const start = startOfBusinessDay(NOW);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(21);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });
});

describe("isNoShowEligible — the no-show cutoff", () => {
  it("marks an Approved booking days after its arrival date", () => {
    expect(
      isNoShowEligible(booking({ checkInDate: day(2026, 10, 19) }), NOW),
    ).toBe(true);
  });

  it("does NOT let staff mark a no-show on the arrival day itself", () => {
    // Guest can still walk in late on day one — no flag until tomorrow.
    expect(
      isNoShowEligible(booking({ checkInDate: day(2026, 10, 21, 2) }), NOW),
    ).toBe(false);
  });

  it("does NOT flag future arrivals", () => {
    expect(
      isNoShowEligible(booking({ checkInDate: day(2026, 10, 25) }), NOW),
    ).toBe(false);
  });

  it("only applies to Approved bookings", () => {
    for (const status of ["Pending", "Checked In", "Cancelled", "Awaiting Payment"]) {
      expect(
        isNoShowEligible(booking({ checkInDate: day(2026, 10, 19), status }), NOW),
      ).toBe(false);
    }
  });

  it("rejects a booking without a readable arrival date", () => {
    expect(isNoShowEligible(booking({ checkInDate: null }), NOW)).toBe(false);
  });
});

describe("nightsPastArrival", () => {
  it("counts whole days since the arrival date started", () => {
    expect(nightsPastArrival(booking({ checkInDate: day(2026, 10, 21) }), NOW)).toBe(0);
    expect(nightsPastArrival(booking({ checkInDate: day(2026, 10, 20) }), NOW)).toBe(1);
    expect(nightsPastArrival(booking({ checkInDate: day(2026, 10, 19) }), NOW)).toBe(2);
  });

  it("returns 0 for unreadable dates", () => {
    expect(nightsPastArrival(booking({ checkInDate: null }), NOW)).toBe(0);
  });
});

describe("classifyArrivals", () => {
  const approvedList = [
    booking({ id: "bk-late2", checkInDate: day(2026, 10, 19) }),
    booking({ id: "bk-today", checkInDate: day(2026, 10, 21) }),
    booking({ id: "bk-late1", checkInDate: day(2026, 10, 20) }),
    booking({ id: "bk-future", checkInDate: day(2026, 10, 25) }),
  ];

  it("splits arrivals into not-checked-in-today vs no-show eligible", () => {
    const { dueToday, eligible } = classifyArrivals(approvedList, NOW);
    expect(dueToday.map((b) => b.id)).toEqual(["bk-today"]);
    expect(eligible.map((b) => b.id)).toEqual(["bk-late2", "bk-late1"]);
  });

  it("ignores bookings that are not still Approved", () => {
    const { dueToday, eligible } = classifyArrivals(
      [booking({ id: "bk-x", checkInDate: day(2026, 10, 19), status: "Cancellation Requested" })],
      NOW);
    expect(dueToday).toHaveLength(0);
    expect(eligible).toHaveLength(0);
  });
});

describe("buildAuditSummary — what the night-audit snapshot stores", () => {
  it("computes occupancy and stores each figure with the business date key", () => {
    const summary = buildAuditSummary(
      new Date(2026, 9, 21, 23, 0),
      {
        occupiedRooms: 5,
        totalRooms: 10,
        checkInsToday: 3,
        checkOutsDue: 4,
        overdueCheckOuts: 1,
        arrivalsTodayNotCheckedIn: 2,
        noShowEligible: 1,
        noShowsMarkedToday: 1});
    expect(summary).toEqual({
      auditDate: "2026-10-21",
      occupiedRooms: 5,
      totalRooms: 10,
      occupancyRate: 50,
      checkInsToday: 3,
      checkOutsDue: 4,
      overdueCheckOuts: 1,
      arrivalsTodayNotCheckedIn: 2,
      noShowEligible: 1,
      noShowsMarkedToday: 1});
  });

  it("is safe when the hotel has no active rooms", () => {
    const summary = buildAuditSummary(NOW, {
      occupiedRooms: 0,
      totalRooms: 0});
    expect(summary.occupancyRate).toBe(0);
  });

  it("never stores negative or non-numeric figures", () => {
    const summary = buildAuditSummary(NOW, {
      occupiedRooms: -5,
      totalRooms: 3,
      checkInsToday: NaN});
    expect(summary.occupiedRooms).toBe(0);
    expect(summary.checkInsToday).toBe(0);
    expect(summary.occupancyRate).toBe(0);
  });
});
