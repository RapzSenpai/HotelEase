import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoogleAccessToken: vi.fn(),
  listSubcollectionDocs: vi.fn(),
  runFirestoreQuery: vi.fn(),
}));

vi.mock("./google-auth.js", () => ({
  getGoogleAccessToken: mocks.getGoogleAccessToken,
}));

vi.mock("./firestore.js", () => ({
  deleteAuthAccount: vi.fn(),
  deleteFirestoreDoc: vi.fn(),
  fsValue: (fields, key) => {
    const value = fields?.[key];
    return value?.booleanValue ?? value?.stringValue ?? value?.timestampValue;
  },
  getFirestoreDoc: vi.fn(),
  listSubcollectionDocs: mocks.listSubcollectionDocs,
  listSubcollectionIds: vi.fn(),
  patchFirestoreDoc: vi.fn(),
  runFirestoreQuery: mocks.runFirestoreQuery,
}));

import { purgeNotificationInboxes } from "./sweeps.js";

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
    expect(first.pagesScanned).toBe(100);
    expect(values.has("inbox-retention-cursor:users")).toBe(false);
    expect(values.has("inbox-retention-cursor:training_guests")).toBe(false);
    expect(JSON.parse(values.get("inbox-retention-page-cursor:users"))).toMatchObject({
      uid: "a",
      stage: "ordered",
      pageToken: "50",
    });
    expect(JSON.parse(values.get("inbox-retention-page-cursor:training_guests"))).toMatchObject({
      uid: "a",
      stage: "ordered",
      pageToken: "50",
    });

    const second = await purgeNotificationInboxes(workerEnv);

    expect(second.completed).toBe(true);
    expect(values.has("inbox-retention-page-cursor:users")).toBe(false);
    expect(values.has("inbox-retention-page-cursor:training_guests")).toBe(false);
    const ownerCursorWrites = kv.put.mock.calls
      .filter(([key]) => key.startsWith("inbox-retention-cursor:"))
      .map(([, value]) => value);
    expect(ownerCursorWrites).toEqual(["a", "b", "a", "b"]);
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