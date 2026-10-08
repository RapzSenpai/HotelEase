import { describe, expect, it } from "vitest";
import { roomLabel, roomLabelFrom } from "@/lib/room-label";

describe("roomLabel", () => {
  it("never renders a room id", () => {
    // The reported glitch: a page rendered before its rooms query resolved
    // showed the raw Firestore id, then swapped it for the name.
    expect(roomLabel({ id: "aB3xY9Zq1Wm", isActive: false })).toBe("…");
    expect(roomLabel(undefined)).toBe("…");
    expect(roomLabel(null)).toBe("…");
  });

  it("prefers the name, then the type, then the room number", () => {
    const room = { name: "Deluxe Suite", type: "Suite Room", roomNumber: "101" };
    expect(roomLabel(room)).toBe("Deluxe Suite");
    expect(roomLabel({ type: "Suite Room", roomNumber: "101" })).toBe("Suite Room");
    expect(roomLabel({ roomNumber: "101" })).toBe("Room 101");
  });

  it("takes the caller's placeholder for a genuinely missing room", () => {
    expect(roomLabel(null, "—")).toBe("—");
    expect(roomLabel({ id: "x" }, "—")).toBe("—");
  });

  it("resolves a booking's room through an id map without leaking the id", () => {
    const rooms = { r1: { name: "Deluxe Suite" } };
    expect(roomLabelFrom(rooms, "r1")).toBe("Deluxe Suite");
    // Rooms not loaded yet (empty map) vs. a room that is truly gone.
    expect(roomLabelFrom({}, "r2", "…")).toBe("…");
    expect(roomLabelFrom(rooms, "r2")).toBe("—");
    expect(roomLabelFrom(undefined, "r2")).toBe("—");
  });
});
