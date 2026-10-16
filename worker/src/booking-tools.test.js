import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBookingPricing, getRoomCapacity } from "@/lib/roomCapacity";

const mocks = vi.hoisted(() => ({
  getGoogleAccessToken: vi.fn(),
  getFirestoreDoc: vi.fn(),
  runFirestoreQuery: vi.fn(),
}));

vi.mock("./google-auth.js", () => ({
  getGoogleAccessToken: mocks.getGoogleAccessToken,
}));

// Keep fsValue real (it is pure data mapping); mock only the network helpers.
vi.mock("./firestore.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getFirestoreDoc: mocks.getFirestoreDoc,
  runFirestoreQuery: mocks.runFirestoreQuery,
}));

const { GUEST_TOOLS, executeGuestTool } = await import("./booking-tools.js");

const workerEnv = {
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "hotel-project" }),
};

function roomDoc(id, overrides = {}) {
  return {
    id,
    fields: {
      name: { stringValue: `Room ${id}` },
      type: { stringValue: "Single Room" },
      ratePerNight: { integerValue: "1000" },
      amenities: { arrayValue: { values: [{ stringValue: "Wi-Fi" }] } },
      ...overrides,
    },
  };
}

/** One room_availability marker row as runFirestoreQuery returns it. */
function markerRow(roomId, overrides = {}) {
  return { id: `${roomId}_2026-12-20`, fields: { roomId: { stringValue: roomId }, ...overrides } };
}

const NO_ROOMS = [];
const NO_MARKERS = [];

/** Wire runFirestoreQuery: rooms collection vs room_availability query. */
function mockFirestore({ rooms = NO_ROOMS, markers = NO_MARKERS } = {}) {
  mocks.runFirestoreQuery.mockImplementation(async (_token, _project, collectionId) => {
    if (collectionId === "rooms") return rooms;
    if (collectionId === "room_availability") return markers;
    return [];
  });
}

/** The structuredQuery the worker must send for a stay. */
function expectedAvailabilityQuery(checkIn, checkOut) {
  return {
    from: [{ collectionId: "room_availability" }],
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "date" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { stringValue: checkIn },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: "date" },
              op: "LESS_THAN",
              value: { stringValue: checkOut },
            },
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  // Pin "today" so date rules never expire with the calendar.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T04:00:00Z"));
  vi.clearAllMocks();
  mocks.getGoogleAccessToken.mockResolvedValue("service-token");
  mocks.runFirestoreQuery.mockResolvedValue([]);
  mocks.getFirestoreDoc.mockResolvedValue({ exists: false, fields: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GUEST_TOOLS definitions", () => {
  it("exposes exactly the two read-only booking tools with required params", () => {
    expect(GUEST_TOOLS.map((t) => t.function.name).sort()).toEqual([
      "find_rooms",
      "quote_booking",
    ]);
    const findRooms = GUEST_TOOLS.find((t) => t.function.name === "find_rooms");
    expect(findRooms.function.parameters.required).toEqual(["checkIn", "checkOut"]);
    const quote = GUEST_TOOLS.find((t) => t.function.name === "quote_booking");
    expect(quote.function.parameters.required).toEqual([
      "roomId",
      "checkIn",
      "checkOut",
      "pax",
    ]);
  });
});

describe("executeGuestTool validation", () => {
  it("returns an error result for an unknown tool instead of throwing", async () => {
    const result = await executeGuestTool("delete_everything", {}, workerEnv);
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("rejects malformed or reversed dates before touching Firestore", async () => {
    const bad = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-02-30", checkOut: "2026-03-02" },
      workerEnv,
    );
    expect(bad).toMatchObject({ error: expect.any(String) });

    const reversed = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-25", checkOut: "2026-12-20" },
      workerEnv,
    );
    expect(reversed).toMatchObject({ error: expect.any(String) });
    expect(mocks.runFirestoreQuery).not.toHaveBeenCalled();
  });

  it("rejects stays longer than 30 nights", async () => {
    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-01", checkOut: "2027-01-15" },
      workerEnv,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("30") });
  });

  it("rejects check-in dates in the past (hotel timezone)", async () => {
    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-10-15", checkOut: "2026-10-17" },
      workerEnv,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("past") });
    expect(mocks.runFirestoreQuery).not.toHaveBeenCalled();
  });

  it("accepts a check-in of today", async () => {
    mockFirestore({ rooms: [roomDoc("r1")] });
    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-10-16", checkOut: "2026-10-17" },
      workerEnv,
    );
    expect(result.rooms).toHaveLength(1);
  });

  it("reports a configuration error when the service account is missing", async () => {
    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-20", checkOut: "2026-12-22" },
      {},
    );
    expect(result).toMatchObject({ error: expect.any(String) });
  });
});

describe("find_rooms", () => {
  it("queries room_availability once with the exact [checkIn, checkOut) date bounds", async () => {
    mockFirestore({ rooms: [roomDoc("r1")] });

    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-20", checkOut: "2026-12-22" },
      workerEnv,
    );

    expect(result.rooms).toHaveLength(1);
    expect(result.nights).toBe(2);
    // Same date-range semantics as the client's getBlockedRoomIds /
    // nightKeys: >= checkIn, < checkOut (the checkout day is free).
    expect(mocks.runFirestoreQuery).toHaveBeenCalledWith(
      "service-token",
      "hotel-project",
      "room_availability",
      expectedAvailabilityQuery("2026-12-20", "2026-12-22"),
    );
  });

  it("excludes archived rooms and rooms blocked by a marker in the range", async () => {
    mockFirestore({
      rooms: [
        roomDoc("active"),
        roomDoc("archived", { isActive: { booleanValue: false } }),
        roomDoc("taken"),
      ],
      markers: [markerRow("taken")],
    });

    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-20", checkOut: "2026-12-21" },
      workerEnv,
    );

    expect(result.rooms.map((r) => r.roomId)).toEqual(["active"]);
  });

  it("a stale terminal marker still blocks, matching the client pre-check", async () => {
    // getBlockedRoomIds blocks on ANY marker doc in [checkIn, checkOut),
    // whatever its status — the chat must show the same availability the
    // booking page shows until the orphan sweep removes the marker.
    mockFirestore({
      rooms: [roomDoc("r1")],
      markers: [markerRow("r1", { status: { stringValue: "Cancelled" } })],
    });

    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-20", checkOut: "2026-12-22" },
      workerEnv,
    );

    expect(result.rooms).toHaveLength(0);
    expect(result.totalAvailable).toBe(0);
  });

  it("filters by room type case-insensitively and flags pax fit", async () => {
    mockFirestore({
      rooms: [
        roomDoc("single"),
        roomDoc("suite", {
          type: { stringValue: "Suite Room" },
          basePax: { integerValue: "2" },
          maxPax: { integerValue: "4" },
          extraPaxFee: { integerValue: "500" },
        }),
      ],
    });

    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-20", checkOut: "2026-12-21", roomType: "suite", pax: 3 },
      workerEnv,
    );

    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].roomId).toBe("suite");
    expect(result.rooms[0].fitsPax).toBe(true);
    expect(result.rooms[0]).toMatchObject({
      basePax: 2,
      maxPax: 4,
      extraPaxFee: 500,
    });
  });

  it("applies per-type capacity defaults when the room document omits them", async () => {
    mockFirestore({ rooms: [roomDoc("p1", { type: { stringValue: "Presidential Room" } })] });
    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-20", checkOut: "2026-12-21", pax: 5 },
      workerEnv,
    );
    expect(result.rooms[0]).toMatchObject({
      basePax: 4,
      maxPax: 8,
      extraPaxFee: 1000,
      fitsPax: true,
    });
  });

  it("lists pax-fitting rooms first when the result is truncated", async () => {
    const rooms = [];
    for (let i = 0; i < 14; i += 1) {
      rooms.push(roomDoc(`room-${i}`, { maxPax: { integerValue: i === 13 ? "6" : "2" } }));
    }
    mockFirestore({ rooms });

    const result = await executeGuestTool(
      "find_rooms",
      { checkIn: "2026-12-20", checkOut: "2026-12-21", pax: 5 },
      workerEnv,
    );

    expect(result.totalAvailable).toBe(14);
    expect(result.rooms).toHaveLength(12);
    expect(result.rooms[0].roomId).toBe("room-13");
    expect(result.rooms[0].fitsPax).toBe(true);
  });
});

describe("quote_booking", () => {
  /** Mirror a firestore room doc as plain JS for the client helpers. */
  function plainRoom(type, extra = {}) {
    return { type, ...extra };
  }

  it("matches getRoomCapacity + calculateBookingPricing across scenarios (parity tripwire)", async () => {
    const scenarios = [
      { type: "Single Room", rate: 1500, pax: 2, fields: {}, js: plainRoom("Single Room") },
      {
        type: "Single Room",
        rate: 1500,
        pax: 1,
        fields: { extraPaxFee: { integerValue: "350" } },
        js: plainRoom("Single Room", { extraPaxFee: 350 }),
      },
      { type: "Suite Room", rate: 2500, pax: 4, fields: {}, js: plainRoom("Suite Room") },
      {
        type: "Presidential Room",
        rate: 5200.5,
        pax: 8,
        fields: {},
        js: plainRoom("Presidential Room"),
      },
      { type: "Deluxe", rate: 999, pax: 3, fields: {}, js: plainRoom("Deluxe") },
      {
        type: "Suite Room",
        rate: 2000,
        pax: 4,
        fields: { basePax: { integerValue: "3" } },
        js: plainRoom("Suite Room", { basePax: 3 }),
      },
    ];

    for (const s of scenarios) {
      mocks.getFirestoreDoc.mockImplementation(async (_token, _project, collection, docId) => {
        if (collection === "rooms" && docId === "r1") {
          return {
            exists: true,
            fields: {
              name: { stringValue: "Room r1" },
              type: { stringValue: s.type },
              ratePerNight: { doubleValue: s.rate },
              ...s.fields,
            },
          };
        }
        return { exists: false, fields: {} };
      });
      mockFirestore({ markers: [] });

      const quote = await executeGuestTool(
        "quote_booking",
        { roomId: "r1", checkIn: "2026-12-20", checkOut: "2026-12-22", pax: s.pax },
        workerEnv,
      );

      const capacity = getRoomCapacity(s.js);
      expect({
        basePax: quote.basePax,
        maxPax: quote.maxPax,
        extraPaxFee: quote.extraPaxFee,
      }).toEqual(capacity);

      const expected = calculateBookingPricing({
        ratePerNight: s.rate,
        basePax: capacity.basePax,
        maxPax: capacity.maxPax,
        extraPaxFee: capacity.extraPaxFee,
        nights: 2,
        paxCount: s.pax,
      });

      expect(quote.baseTotal).toBe(expected.baseTotal);
      expect(quote.extraPaxCount).toBe(expected.extraPaxCount);
      expect(quote.extraPaxTotal).toBe(expected.extraPaxTotal);
      expect(quote.totalCost).toBe(expected.totalCost);
    }
  });

  it("refuses guest counts above the room maximum", async () => {
    mocks.getFirestoreDoc.mockImplementation(async (_token, _project, collection, docId) =>
      collection === "rooms" && docId === "r1" ? { ...roomDoc("r1"), exists: true } : { exists: false, fields: {} });

    const result = await executeGuestTool(
      "quote_booking",
      { roomId: "r1", checkIn: "2026-12-20", checkOut: "2026-12-21", pax: 9 },
      workerEnv,
    );

    expect(result).toMatchObject({ error: expect.any(String), maxPax: 2 });
  });

  it("refuses a room that the availability query reports as blocked", async () => {
    mocks.getFirestoreDoc.mockImplementation(async (_token, _project, collection) =>
      collection === "rooms" ? { ...roomDoc("r1"), exists: true } : { exists: false, fields: {} });
    mockFirestore({ markers: [markerRow("r1", { status: { stringValue: "Pending" } })] });

    const result = await executeGuestTool(
      "quote_booking",
      { roomId: "r1", checkIn: "2026-12-20", checkOut: "2026-12-22", pax: 1 },
      workerEnv,
    );

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(result.totalCost).toBeUndefined();
  });

  it("refuses missing or archived rooms", async () => {
    mocks.getFirestoreDoc.mockResolvedValue({ exists: false, fields: {} });
    const missing = await executeGuestTool(
      "quote_booking",
      { roomId: "gone", checkIn: "2026-12-20", checkOut: "2026-12-21", pax: 1 },
      workerEnv,
    );
    expect(missing).toMatchObject({ error: expect.any(String) });

    mocks.getFirestoreDoc.mockResolvedValue({
      exists: true,
      fields: { isActive: { booleanValue: false } },
    });
    const archived = await executeGuestTool(
      "quote_booking",
      { roomId: "r1", checkIn: "2026-12-20", checkOut: "2026-12-21", pax: 1 },
      workerEnv,
    );
    expect(archived).toMatchObject({ error: expect.any(String) });
  });
});
