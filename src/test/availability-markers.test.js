import { describe, it, expect, vi, beforeEach } from "vitest";

const seen = { collections: [] };

vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => {
    seen.collections.push(name);
    return { __col: name };
  },
  doc: (_db, ...parts) => ({ __doc: parts.join("/") }),
  query: (ref) => ({ __q: ref?.__col }),
  where: () => ({ __where: true }),
  orderBy: () => ({ __orderBy: true }),
  getDocs: async () => ({ docs: [], size: 0 }),
  onSnapshot: () => () => {},
  runTransaction: async () => ({}),
  serverTimestamp: () => ({ __ts: true }),
  setDoc: async () => {},
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  Timestamp: { fromDate: (d) => d },
}));

const { getBlockedRoomIds } = await import("@/services/availabilityService");
const { getAvailableRoomIds } = await import("@/services/booking/queries");

beforeEach(() => {
  seen.collections.length = 0;
});

describe("availability reads", () => {
  it("getBlockedRoomIds reads room_availability", async () => {
    await getBlockedRoomIds("2026-10-01", "2026-10-03");
    expect(seen.collections).toContain("room_availability");
  });

  it("getAvailableRoomIds reads room_availability and never training collections", async () => {
    await getAvailableRoomIds("2026-10-01", "2026-10-03");
    expect(seen.collections).toContain("room_availability");
    expect(seen.collections.some((c) => c.startsWith("training_"))).toBe(false);
  });
});
