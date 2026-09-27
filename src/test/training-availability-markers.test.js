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
  getDocs: async () => ({ docs: [] }),
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

describe("training availability reads", () => {
  it("getBlockedRoomIds reads training_availability in training mode", async () => {
    await getBlockedRoomIds("2026-10-01", "2026-10-03", { trainingMode: true });
    expect(seen.collections).toContain("training_availability");
  });

  it("getBlockedRoomIds reads room_availability outside training", async () => {
    await getBlockedRoomIds("2026-10-01", "2026-10-03", {});
    expect(seen.collections).toContain("room_availability");
    expect(seen.collections).not.toContain("training_availability");
  });

  it("getAvailableRoomIds never scans training_bookings in training mode", async () => {
    await getAvailableRoomIds("2026-10-01", "2026-10-03", { trainingMode: true });
    expect(seen.collections).not.toContain("training_bookings");
    expect(seen.collections).toContain("training_availability");
  });
});
