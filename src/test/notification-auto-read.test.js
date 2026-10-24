import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * markNotificationsOfTypeRead — auto-read for superseded notifications
 * (e.g. a guest's "payment proof required" hint once the payment completes).
 * Firestore is a thin in-memory stand-in (same idiom as no-show-service).
 */

const store = new Map(); // key: "notifications/<uid>/items/<id>" → fields

vi.mock("firebase/firestore", () => {
  const keyOf = (collectionPath, id) => `${collectionPath}/${id}`;
  const matches = (data, filters) =>
    filters.every(({ field, op, value }) => {
      if (op !== "==") return false;
      if (field === "isRead" || field === "type") return data[field] === value;
      return false;
    });
  return {
    collection: (_db, name, userId, sub) => ({
      collection: `${name}/${userId}/${sub}`}),
    doc: (_db, collectionRef, id) => ({
      collection: collectionRef.collection, id}),
    // v9 API: query(queryRef, ...constraints) — db arg does not exist here.
    query: (collectionRef, ...args) => ({
      collection: collectionRef.collection, filters: args}),
    where: (field, op, value) => ({ field, op, value }),
    orderBy: (...args) => ({ orderBy: args }),
    limit: (...args) => ({ limit: args }),
    getDoc: vi.fn(),
    getDocs: vi.fn(async (q) => {
      const docs = [...store.entries()]
        .filter(([key]) => key.startsWith(`${q.collection}/`))
        .map(([key, data]) => ({
          id: key.split("/")[3],
          ref: { collection: q.collection, id: key.split("/")[3] },
          data: () => data}))
        .filter((d) => matches(d.data(), q.filters));
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs};
    }),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    writeBatch: vi.fn(() => {
      const updates = [];
      return {
        update: vi.fn((ref, data) => {
          updates.push({ key: keyOf(ref.collection, ref.id), data });
        }),
        commit: vi.fn(async () => {
          updates.forEach(({ key, data }) => {
            const doc = store.get(key);
            if (doc) Object.assign(doc, data);
          });
        })};
    }),
    runTransaction: vi.fn(),
    serverTimestamp: () => "server-time"};
});

vi.mock("@/firebase/firebase.config", () => ({ auth: { currentUser: null }, db: {} }));

const { markNotificationsOfTypeRead } = await import(
  "@/services/notificationService"
);

function seed(uid, id, { type, isRead }) {
  store.set(`notifications/${uid}/items/${id}`, {
    id, type, isRead, title: "", message: "", link: "/"});
}

beforeEach(() => store.clear());
afterEach(() => store.clear());

describe("markNotificationsOfTypeRead", () => {
  it("marks only UNREAD docs of the given type and returns the count", async () => {
    seed("guest-1", "n1", { type: "payment_proof_required", isRead: false });
    seed("guest-1", "n2", { type: "payment_proof_required", isRead: true });
    seed("guest-1", "n3", { type: "payment_proof_required", isRead: false });
    seed("guest-1", "n4", { type: "payment_received", isRead: false });

    const count = await markNotificationsOfTypeRead(
      "guest-1", "payment_proof_required");

    expect(count).toBe(2);
    expect(store.get("notifications/guest-1/items/n1").isRead).toBe(true);
    expect(store.get("notifications/guest-1/items/n3").isRead).toBe(true);
    // other-type one stays untouched (read one is covered by count === 2)
    expect(store.get("notifications/guest-1/items/n4").isRead).toBe(false);
  });

  it("returns 0 without touching anything when there is nothing to mark", async () => {
    seed("guest-1", "n1", { type: "payment_received", isRead: false });
    expect(await markNotificationsOfTypeRead("guest-1", "payment_proof_required")).toBe(0);
    expect(await markNotificationsOfTypeRead("", "payment_proof_required")).toBe(0);
    expect(await markNotificationsOfTypeRead("guest-1", "")).toBe(0);
    expect(store.get("notifications/guest-1/items/n1").isRead).toBe(false);
  });

  it("does not cross users", async () => {
    seed("guest-1", "n1", { type: "payment_proof_required", isRead: false });
    seed("guest-2", "n2", { type: "payment_proof_required", isRead: false });

    await markNotificationsOfTypeRead("guest-1", "payment_proof_required");

    expect(store.get("notifications/guest-1/items/n1").isRead).toBe(true);
    expect(store.get("notifications/guest-2/items/n2").isRead).toBe(false);
  });
});
