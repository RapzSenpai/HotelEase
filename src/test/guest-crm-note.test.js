import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * addGuestCrmNote — FO append-only internal notes on a guest profile doc.
 * The write rides /users update rules: FO may touch only [crmNotes, updatedAt]
 * (rules line ~168), so the payload must contain exactly those two keys.
 */

const mockAuth = { currentUser: null };
const store = { users: {} };

vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (_db, ref, id) => ({ collection: ref?.collection ?? ref, id }),
  query: (_db, ...args) => ({ collection: args[0]?.collection ?? "users", args: args.slice(1) }),
  where: (...args) => ({ where: args }),
  orderBy: (...args) => ({ orderBy: args }),
  limit: (...args) => ({ limit: args }),
  getDocs: vi.fn(),
  getDoc: vi.fn(async (ref) => ({
    exists: () => !!store.users[ref.id],
    data: () => store.users[ref.id] || {}})),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getCountFromServer: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: () => "server-time",
  Timestamp: { now: () => "client-time" },
  arrayUnion: vi.fn((...items) => ({ __arrayUnion: items }))}));

vi.mock("@/firebase/firebase.config", () => ({ db: {}, auth: mockAuth }));

const { addGuestCrmNote } = await import("@/services/userService");
const { arrayUnion, updateDoc } = await import("firebase/firestore");

beforeEach(() => {
  store.users = {
    "guest-1": { uid: "guest-1", role: "guest", fullName: "Juan Dela Cruz" },
    "fo-1": { uid: "fo-1", role: "fo", fullName: "Ana Cruz" }};
  mockAuth.currentUser = { uid: "fo-1", email: "fo@hotelease.test" };
  arrayUnion.mockClear();
  updateDoc.mockClear();
});

const updates = () => arrayUnion.mock.calls;

describe("addGuestCrmNote", () => {
  it("rejects a blank note without writing", async () => {
    await expect(addGuestCrmNote("guest-1", "   ")).rejects.toThrow(/note is required/i);
    expect(updates()).toHaveLength(0);
  });

  it("rejects an unknown guest and non-guest docs", async () => {
    await expect(addGuestCrmNote("who-dis", "x")).rejects.toThrow(/guest not found/i);
    await expect(addGuestCrmNote("fo-1", "x")).rejects.toThrow(/guest-only|guest/i);
    expect(updates()).toHaveLength(0);
  });

  it("appends the note with who and when, plus updatedAt", async () => {
    await addGuestCrmNote("guest-1", "Prefers high floor");

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = updateDoc.mock.calls[0];
    expect(ref.id).toBe("guest-1");
    expect(Object.keys(payload).sort()).toEqual(["crmNotes", "updatedAt"]);
    expect(payload.updatedAt).toBe("server-time");
    expect(payload.crmNotes.__arrayUnion).toHaveLength(1);
    expect(payload.crmNotes.__arrayUnion[0]).toMatchObject({
      note: "Prefers high floor",
      byUid: "fo-1",
      byEmail: "fo@hotelease.test",
      // serverTimestamp() throws inside arrayUnion elements — the entry must
      // carry a client timestamp instead.
      at: "client-time"});
  });

  it("trims whitespace and caps the note at 2000 characters", async () => {
    await addGuestCrmNote("guest-1", `  ${"x".repeat(2500)}  `);

    const [, payload] = updateDoc.mock.calls[0];
    const entry = payload.crmNotes.__arrayUnion[0];
    expect(entry.note.length).toBe(2000);
    expect(entry.note.startsWith("x")).toBe(true);
    expect(entry.note.endsWith("x")).toBe(true);
  });
});
