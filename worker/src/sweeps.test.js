import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteFirestoreDoc: vi.fn(),
  getFirestoreDoc: vi.fn(),
  getGoogleAccessToken: vi.fn(),
  listSubcollectionDocs: vi.fn(),
  patchFirestoreDoc: vi.fn(),
  runFirestoreQuery: vi.fn(),
}));

vi.mock("./google-auth.js", () => ({
  getGoogleAccessToken: mocks.getGoogleAccessToken,
}));

vi.mock("./firestore.js", () => ({
  deleteFirestoreDoc: mocks.deleteFirestoreDoc,
  fsValue: (fields, key) => {
    const value = fields?.[key];
    if (value?.integerValue !== undefined) return Number(value.integerValue);
    return value?.booleanValue ?? value?.stringValue ?? value?.timestampValue;
  },
  getFirestoreDoc: mocks.getFirestoreDoc,
  listSubcollectionDocs: mocks.listSubcollectionDocs,
  patchFirestoreDoc: mocks.patchFirestoreDoc,
  runFirestoreQuery: mocks.runFirestoreQuery,
}));

import { expireStaleHolds, purgeNotificationInboxes, sweepOrphanMarkers } from "./sweeps.js";

describe("expireStaleHolds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleAccessToken.mockResolvedValue("token");
    mocks.deleteFirestoreDoc.mockResolvedValue(undefined);
    mocks.patchFirestoreDoc.mockResolvedValue(undefined);
  });

  it("expires the unpaid holds but leaves paid Pending bookings alone", async () => {
    const fields = (status, extra = {}) => ({
      status: { stringValue: status },
      paymentDeadline: { timestampValue: "2026-10-01T00:00:00.000Z" },
      roomId: { stringValue: "room-1" },
      guestId: { stringValue: "guest-1" },
      ...extra,
    });
    mocks.runFirestoreQuery.mockImplementation(async (_token, _project, collection, query) => {
      if (collection === "bookings") {
        const status = query.where?.compositeFilter?.filters?.[0]?.fieldFilter?.value?.stringValue;
        if (status === "Awaiting Payment") {
          return [{ id: "awaiting-1", updateTime: "t1", fields: fields("Awaiting Payment") }];
        }
        if (status === "Pending") {
          return [
            { id: "unpaid-pending", updateTime: "t2", fields: fields("Pending") },
            {
              id: "proof-pending",
              updateTime: "t3",
              fields: fields("Pending", { paymentProofUrl: { stringValue: "https://img" } }),
            },
            {
              id: "deposit-pending",
              updateTime: "t4",
              fields: fields("Pending", {
                payment: { mapValue: { fields: { deposit: { integerValue: 1500 } } } },
              }),
            },
          ];
        }
      }
      if (collection === "room_availability") {
        return [{ id: "room-1_2026-10-01" }];
      }
      return [];
    });

    const result = await expireStaleHolds({
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "test-project" }),
    });

    expect(result.expiredBookings).toBe(2);
    const expiredIds = mocks.patchFirestoreDoc.mock.calls.map((call) => call[3]);
    expect(expiredIds).toEqual(["awaiting-1", "unpaid-pending"]);
    expect(expiredIds).not.toContain("proof-pending");
    expect(expiredIds).not.toContain("deposit-pending");
  });
});

describe("sweepOrphanMarkers status reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleAccessToken.mockResolvedValue("token");
    mocks.deleteFirestoreDoc.mockResolvedValue(undefined);
    mocks.patchFirestoreDoc.mockResolvedValue(undefined);
  });

  it("repairs a stale marker from the live booking and skips matching ones", async () => {
    mocks.runFirestoreQuery.mockResolvedValue([
      {
        id: "room-1_2026-10-24",
        updateTime: "t1",
        fields: {
          bookingId: { stringValue: "bk-1" },
          status: { stringValue: "Awaiting Payment" },
        },
      },
      {
        id: "room-1_2026-10-25",
        updateTime: "t2",
        fields: {
          bookingId: { stringValue: "bk-1" },
          status: { stringValue: "Pending" },
        },
      },
    ]);
    mocks.getFirestoreDoc.mockResolvedValue({
      exists: true,
      fields: { status: { stringValue: "Pending" } },
    });

    const result = await sweepOrphanMarkers({
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "test-project" }),
    });

    expect(result).toMatchObject({
      markers: 2,
      orphansDeleted: 0,
      markersRepaired: 1,
      errors: 0,
    });
    expect(mocks.patchFirestoreDoc).toHaveBeenCalledTimes(1);
    expect(mocks.patchFirestoreDoc).toHaveBeenCalledWith(
      "token",
      "test-project",
      "room_availability",
      "room-1_2026-10-24",
      {
        status: { stringValue: "Pending" },
        updatedAt: { timestampValue: expect.any(String) },
      },
      ["status", "updatedAt"],
      "t1",
    );
  });
});

describe("purgeNotificationInboxes resume cursor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleAccessToken.mockResolvedValue("token");
    mocks.runFirestoreQuery.mockImplementation(async (_token, _project, _collection, query) => {
      const cursor = query.startAt?.values?.[0]?.referenceValue?.split("/").pop();
      return ["a", "b"]
        .filter((uid) => !cursor || uid > cursor)
        .slice(0, query.limit)
        .map((id) => ({ id }));
    });
    mocks.listSubcollectionDocs.mockImplementation(async (_token, _project, parentPath, _subcollection, options) => {
      const uid = parentPath.split("/").pop();
      const page = Number(options.pageToken || 0);
      if (uid === "a" && options.orderBy && page < 50) {
        return {
          docs: [{
            id: `item-${page}`,
            fields: {
              createdAt: { timestampValue: new Date().toISOString() },
              isRead: { booleanValue: false },
            },
          }],
          nextPageToken: String(page + 1),
        };
      }
      return { docs: [], nextPageToken: "" };
    });
  });

  it("resumes partial owners without advancing their cursor or starving either collection", async () => {
    const values = new Map();
    const kv = {
      get: vi.fn(async (key) => values.get(key) ?? null),
      put: vi.fn(async (key, value) => values.set(key, value)),
      delete: vi.fn(async (key) => values.delete(key)),
    };
    const workerEnv = {
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "test-project" }),
      AI_LIMITS: kv,
    };

    const first = await purgeNotificationInboxes(workerEnv);

    expect(first.completed).toBe(false);
    expect(first.pagesScanned).toBe(50);
    expect(values.has("inbox-retention-cursor:users")).toBe(false);
    expect(JSON.parse(values.get("inbox-retention-page-cursor:users"))).toMatchObject({
      uid: "a",
      stage: "ordered",
      pageToken: "50",
    });

    const second = await purgeNotificationInboxes(workerEnv);

    expect(second.completed).toBe(true);
    expect(values.has("inbox-retention-page-cursor:users")).toBe(false);
    const ownerCursorWrites = kv.put.mock.calls
      .filter(([key]) => key.startsWith("inbox-retention-cursor:"))
      .map(([, value]) => value);
    expect(ownerCursorWrites).toEqual(["a", "b"]);
  });

  it("drops stale page tokens after repeated list failures and advances the owner cursor", async () => {
    const values = new Map([
      ["inbox-retention-page-cursor:users", JSON.stringify({ uid: "a", stage: "ordered", pageToken: "stale", orderedSeen: 0, pageFailures: 2 })],
    ]);
    const kv = {
      get: vi.fn(async (key) => values.get(key) ?? null),
      put: vi.fn(async (key, value) => values.set(key, value)),
      delete: vi.fn(async (key) => values.delete(key)),
    };
    mocks.runFirestoreQuery.mockImplementation(async () =>
      Array.from({ length: 201 }, (_, index) => ({ id: index === 0 ? "a" : `owner-${index}` })),
    );
    mocks.listSubcollectionDocs.mockImplementation(async (_token, _project, parentPath) => {
      const uid = parentPath.split("/").pop();
      if (uid === "a") throw new Error("temporary fail");
      return { docs: [], nextPageToken: "" };
    });

    const result = await purgeNotificationInboxes({
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "test-project" }),
      AI_LIMITS: kv,
    });

    expect(result.completed).toBe(false);
    expect(values.has("inbox-retention-page-cursor:users")).toBe(false);
    expect(values.get("inbox-retention-cursor:users")).toBeTruthy();
  });

  it("keeps the collection incomplete while an owner is waiting for a retry", async () => {
    const values = new Map([
      ["inbox-retention-page-cursor:users", JSON.stringify({ uid: "a", stage: "ordered", pageToken: "", orderedSeen: 0, pageFailures: 1 })],
    ]);
    const kv = {
      get: vi.fn(async (key) => values.get(key) ?? null),
      put: vi.fn(async (key, value) => values.set(key, value)),
      delete: vi.fn(async (key) => values.delete(key)),
    };
    mocks.runFirestoreQuery.mockResolvedValue([{ id: "a" }]);
    mocks.listSubcollectionDocs.mockRejectedValue(new Error("temporary fail"));

    const result = await purgeNotificationInboxes({
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "test-project" }),
      AI_LIMITS: kv,
    });

    expect(result.completed).toBe(false);
    expect(values.has("inbox-retention-page-cursor:users")).toBe(true);
  });
});