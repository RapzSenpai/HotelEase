import { describe, expect, it } from "vitest";
import { conflictGuestName, findOverstayConflict } from "@/lib/overstay-conflict";

function booking(id, checkIn, checkOut, status = "Approved") {
  return {
    id,
    roomId: "room-1",
    status,
    checkInDate: new Date(`${checkIn}T00:00:00`),
    checkOutDate: new Date(`${checkOut}T00:00:00`),
  };
}

// Selected guest booked 12th–15th, still checked in on the 16th.
const selected = booking("stay-1", "2026-10-12", "2026-10-15", "Checked In");
const now = new Date("2026-10-16T09:00:00");

describe("findOverstayConflict", () => {
  it("finds the next guest arriving inside the overstay window", () => {
    const next = booking("stay-2", "2026-10-16", "2026-10-20");
    expect(findOverstayConflict([selected, next], selected, now)).toBe(next);
  });

  it("ignores itself, past stays, far-future arrivals and dead statuses", () => {
    const roomBookings = [
      selected,
      booking("past", "2026-10-08", "2026-10-10"),
      booking("future", "2026-10-25", "2026-10-28"),
      { ...booking("cancelled", "2026-10-16", "2026-10-20"), status: "Cancelled" },
    ];
    expect(findOverstayConflict(roomBookings, selected, now)).toBeNull();
  });

  it("picks the earliest arrival when several overlap", () => {
    const first = booking("a", "2026-10-16", "2026-10-18");
    const second = booking("b", "2026-10-16", "2026-10-22");
    second.checkInDate = new Date("2026-10-16T12:00:00");
    expect(findOverstayConflict([selected, second, first], selected, now)).toBe(first);
  });

  it("returns null without a checkout date or booking list", () => {
    expect(findOverstayConflict([], selected, now)).toBeNull();
    expect(findOverstayConflict([selected], { id: "x" }, now)).toBeNull();
  });
});

describe("conflictGuestName", () => {
  it("prefers the cached user profile, then booking fields", () => {
    const b = { ...booking("stay-2", "2026-10-16", "2026-10-20"), guestId: "g1", leadGuestName: "Lead" };
    expect(conflictGuestName(b, { g1: { fullName: "Maria" } })).toBe("Maria");
    expect(conflictGuestName(b, {})).toBe("Lead");
    expect(conflictGuestName(null, {})).toBe("another guest");
  });
});
