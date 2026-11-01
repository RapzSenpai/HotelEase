import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * addGuestCrmNote / listGuestCrmNotes — FO internal notes on a guest profile.
 * Notes live in the staff-only /users/{uid}/crmNotes subcollection, never in
 * the user doc: a signed-in guest may read their own /users document, which
 * would leak the internal trail. With a standalone doc the entry can use a
 * REAL serverTimestamp() again — no client clock.
 */

const mockAuth = { currentUser: null };
const store = { users: {} };

vi.mock("firebase/firestore", () => ({
  collection: (_db, ...path) => ({ collection: path }),
  doc: (_db, ref, id) => ({ collection: ref?.collection ?? ref, id }),
  query: (_db, base, ...filters) => ({ collection: base.collection, filters }),
  where: (...args) => ({ where: args }),
  orderBy: vi.fn((...args) => ({ orderBy: args })),
  limit: vi.fn((...args) => ({ limit: args })),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(async (ref) => ({
    exists: () => !!store.users[ref.id],
    data: () => store.users[ref.id] || {}})),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getCountFromServer: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
  Timestamp: { now: () => "client-time" },
  arrayUnion: vi.fn((...items) => ({ __arrayUnion: items }))}));

vi.mock("@/firebase/firebase.config", () => ({ db: {}, auth: mockAuth }));

const { addGuestCrmNote, listGuestCrmNotes } = await import("@/services/userService");
const { addDoc, orderBy, limit, getDocs, serverTimestamp, arrayUnion, updateDoc } =
  await import("firebase/firestore");

beforeEach(() => {
  store.users = {
    "guest-1": { uid: "guest-1", role: "guest", fullName: "Juan Dela Cruz" },
    "fo-1": { uid: "fo-1", role: "fo", fullName: "Ana Cruz" }};
  mockAuth.currentUser = { uid: "fo-1", email: "fo@hotelease.test" };
  addDoc.mockReset();
  getDocs.mockReset();
  vi.mocked(orderBy).mockClear();
  vi.mocked(limit).mockClear();
});

const writes = () => addDoc.mock.calls;

describe("addGuestCrmNote", () => {
  it("rejects a blank note without writing", async () => {
    await expect(addGuestCrmNote("guest-1", "   ")).rejects.toThrow(/note is required/i);
    expect(writes()).toHaveLength(0);
  });

  it("rejects an unknown guest and non-guest docs", async () => {
    await expect(addGuestCrmNote("who-dis", "x")).rejects.toThrow(/guest not found/i);
    await expect(addGuestCrmNote("fo-1", "x")).rejects.toThrow(/guest-only|guest/i);
    expect(writes()).toHaveLength(0);
  });

  it("writes the note to the staff-only subcollection with server time", async () => {
    await addGuestCrmNote("guest-1", "Prefers high floor");

    expect(addDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = addDoc.mock.calls[0];
    expect(ref.collection).toEqual(["users", "guest-1", "crmNotes"]);
    expect(Object.keys(payload).sort()).toEqual(["at", "byEmail", "byUid", "note"]);
    // Real serverTimestamp() — never the guest-or-FO device clock.
    expect(payload.at).toBe("server-time");
    expect(serverTimestamp).toHaveBeenCalled();
    expect(payload.byUid).toBe("fo-1");
    expect(payload.byEmail).toBe("fo@hotelease.test");
    // The legacy user-doc array write must not happen anymore.
    expect(updateDoc).not.toHaveBeenCalled();
    expect(arrayUnion).not.toHaveBeenCalled();
  });

  it("trims whitespace and caps the note at 2000 characters", async () => {
    await addGuestCrmNote("guest-1", `  ${"x".repeat(2500)}  `);

    const [, payload] = addDoc.mock.calls[0];
    expect(payload.note.length).toBe(2000);
    expect(payload.note.startsWith("x")).toBe(true);
    expect(payload.note.endsWith("x")).toBe(true);
  });
});

describe("listGuestCrmNotes", () => {
  it("lists subcollection notes newest-first", async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: "n2", data: () => ({ note: "New", byEmail: "fo@hotelease.test", at: "server-time" }) },
        { id: "n1", data: () => ({ note: "Old", byEmail: "fo@hotelease.test", at: "server-time" }) },
      ]});

    const notes = await listGuestCrmNotes("guest-1");

    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ id: "n2", note: "New" });
    expect(notes[1].id).toBe("n1");
    expect(orderBy).toHaveBeenCalledWith("at", "desc");
    expect(limit).toHaveBeenCalledWith(200);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it("refuses an invalid uid", async () => {
    await expect(listGuestCrmNotes(null)).rejects.toThrow(/invalid uid/i);
    await expect(listGuestCrmNotes("")).rejects.toThrow(/invalid uid/i);
    expect(getDocs).not.toHaveBeenCalled();
  });
});
