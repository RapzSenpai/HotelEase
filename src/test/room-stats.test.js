import { describe, expect, it } from "vitest";
import { computeRoomStats } from "@/lib/room-stats";

const room = (overrides) => ({
  id: `r-${Math.random()}`,
  isActive: true,
  status: "Available",
  ...overrides,
});

describe("computeRoomStats", () => {
  it("counts a mid-stay Dirty room as cleaning with a mid-stay split", () => {
    const stats = computeRoomStats([
      room({ status: "Occupied" }),
      room({ status: "Occupied" }),
      room({ status: "Dirty / Needs Cleaning", isMidStayRequest: true }),
    ]);
    expect(stats.occupied).toBe(2);
    expect(stats.cleaning).toBe(1);
    expect(stats.midStay).toBe(1);
  });

  it("counts Pending Approval as cleaning (awaiting inspection)", () => {
    const stats = computeRoomStats([room({ status: "Pending Approval" })]);
    expect(stats.cleaning).toBe(1);
  });

  it("counts the legacy Occupied / Checked In string as occupied", () => {
    const stats = computeRoomStats([room({ status: "Occupied / Checked In" })]);
    expect(stats.occupied).toBe(1);
    expect(stats.cleaning).toBe(0);
  });

  it("excludes archived rooms from buckets but keeps them in total", () => {
    const stats = computeRoomStats([
      room({ status: "Available" }),
      room({ status: "Occupied", isActive: false }),
    ]);
    expect(stats.total).toBe(2);
    expect(stats.archived).toBe(1);
    expect(stats.occupied).toBe(0);
    expect(stats.available).toBe(1);
  });

  it("derives occupancy and availability rates over sellable rooms", () => {
    const stats = computeRoomStats([
      room({ status: "Available" }),
      room({ status: "Occupied" }),
      room({ status: "Reserved" }),
      room({ status: "Out of Order" }),
    ]);
    // Sellable = 3 (out-of-order excluded).
    expect(stats.occupancyRate).toBe(33);
    expect(stats.availabilityRate).toBe(33);
  });

  it("returns zeros for an empty inventory", () => {
    expect(computeRoomStats([])).toEqual({
      total: 0,
      available: 0,
      availabilityRate: 0,
      occupied: 0,
      occupancyRate: 0,
      reserved: 0,
      cleaning: 0,
      midStay: 0,
      outOfOrder: 0,
      archived: 0,
    });
  });
});
