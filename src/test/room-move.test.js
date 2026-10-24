import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * moveBookingRoom — FO room move / upgrade on a Checked-In booking. One
 * transaction: re-check the booking, delete the OLD room's night markers
 * (in-tx — clearBookingMarked spins its own transaction), claim the NEW
 * room's nights, flip room statuses (old -> Dirty, new -> Occupied) and log
 * the move. totalCost is deliberately untouched — pricing changes go through
 * adjustBookingRate / addFolioCharge.
 */

const mockAuth = { currentUser: null };

vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (_db, ref, id) => ({ collection: ref?.collection ?? ref, id }),
  query: (_db, ...args) => ({ collection: args[0]?.collection ?? "bookings", args: args.slice(1) }),
  where: (...args) => ({ where: args }),
  orderBy: (...args) => ({ orderBy: args }),
  limit: (...args) => ({ limit: args }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: () => "server-time",
  increment: (n) => ({ __increment: n }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  Timestamp: { fromDate: (d) => d, now: () => ({ seconds: 0 }) },
  deleteField: () => ({ __delete: true })}));

vi.mock("firebase/auth", () => ({ getAuth: () => mockAuth }));
vi.mock("@/firebase/firebase.config", () => ({ db: {} }));

vi.mock("@/services/roomsService", () => ({
  isRoomActive: vi.fn(async () => true)}));

vi.mock("@/services/availabilityService", () => {
  // Real night maths (trivial, no imports) so marker ids in tests match prod.
  // Date-only strings must parse as LOCAL calendar days — new Date("2026-10-22")
  // is UTC midnight and lands on the previous day in TZ west of UTC.
  const pad2 = (n) => String(n).padStart(2, "0");
  const asDate = (v) => {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const [y, m, d] = v.slice(0, 10).split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dateKey = (v) => {
    const d = asDate(v);
    return d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : "";
  };
  const nightKeys = (checkIn, checkOut) => {
    const out = [];
    const cur = asDate(checkIn);
    const until = asDate(checkOut);
    if (!cur || !until) return out;
    while (cur < until) {
      out.push(dateKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  };
  return {
    dateKey,
    nightKeys,
    MARKER_CONFLICT_MESSAGE: "Booking nights already claimed for another booking.",
    claimBookingMarkedInTx: vi.fn(async (transaction, { roomId, bookingId, status }) => {
      transaction.claimed = { roomId, bookingId, status };
      return { claimed: 2 };
    }),
    readBookingMarkedInTx: vi.fn(async () => ({ complete: true, live: [] })),
    setBookingMarked: vi.fn(async () => ({})),
    clearBookingMarked: vi.fn(async () => ({})),
    markersCollection: () => "room_availability"};
});

vi.mock("@/services/notificationService", () => ({
  createNotification: vi.fn(async () => ({}))}));

vi.mock("@/services/emailService", () => ({
  sendBookingConfirmation: vi.fn(async () => ({}))}));

vi.mock("@/services/paymentsService", () => ({
  recordPayment: vi.fn(async () => ({}))}));

vi.mock("@/services/booking/queries", () => ({
  getAvailableRoomIds: vi.fn(async () => new Set())}));

const store = { bookings: {}, rooms: {}, markers: {} };
const updates = []; // every tx.update write, [{ collection, id, data }]
const deletes = []; // every tx.delete, [{ collection, id }]

function snapshot(data) {
  if (!data) return { exists: () => false, data: () => ({}) };
  return { exists: () => true, data: () => data };
}

function makeTx() {
  return {
    get: vi.fn(async (ref) =>
      snapshot(ref.collection === "room_availability"
        ? store.markers[ref.id]
        : store[ref.collection]?.[ref.id])),
    update: vi.fn((ref, data) => {
      updates.push({ collection: ref.collection, id: ref.id, data });
      const target = store[ref.collection]?.[ref.id];
      if (target) Object.assign(target, data);
    }),
    delete: vi.fn((ref) => {
      deletes.push({ collection: ref.collection, id: ref.id });
      delete store[ref.collection === "room_availability" ? "markers" : ref.collection]?.[ref.id];
    })};
}

const { runTransaction, getDoc } = await import("firebase/firestore");

runTransaction.mockImplementation((_db, fn) => fn(makeTx()));
getDoc.mockImplementation(async (ref) => snapshot(store[ref.collection]?.[ref.id]));

const { moveBookingRoom } = await import("@/services/booking/lifecycle");
const { claimBookingMarkedInTx } = await import("@/services/availabilityService");
const { createNotification } = await import("@/services/notificationService");

const checkedIn = {
  id: "bk-move",
  status: "Checked In",
  guestId: "guest-1",
  roomId: "r-1",
  checkInDate: "2026-10-22",
  checkOutDate: "2026-10-24",
  nights: 2,
  baseTotal: 2000,
  totalCost: 2000};

const ROOMS = {
  "r-1": { id: "r-1", name: "Deluxe 101", type: "Deluxe", status: "Occupied", ratePerNight: 1000 },
  "r-2": { id: "r-2", name: "Suite 201", type: "Suite", status: "Available", ratePerNight: 1500 }};

function seedBooking(patch = {}) {
  const data = { ...checkedIn, ...patch };
  store.bookings[data.id] = data;
  return data;
}

beforeEach(() => {
  store.bookings = {};
  // Clone room fixtures — test 4 mutates r-2's status and a shallow copy
  // would leak it into every later test.
  store.rooms = Object.fromEntries(Object.entries(ROOMS).map(([id, r]) => [id, { ...r }]));
  store.markers = {
    "r-1_2026-10-22": { roomId: "r-1", date: "2026-10-22", bookingId: "bk-move", status: "Checked In" },
    "r-1_2026-10-23": { roomId: "r-1", date: "2026-10-23", bookingId: "bk-move", status: "Checked In" }};
  updates.length = 0;
  deletes.length = 0;
  mockAuth.currentUser = { uid: "fo-1", email: "fo@hotelease.test" };
  claimBookingMarkedInTx.mockClear();
  createNotification.mockClear();
});

const bookingUpdate = (id) =>
  updates.filter((u) => u.collection === "bookings" && u.id === id);
const roomUpdate = (id) =>
  updates.filter((u) => u.collection === "rooms" && u.id === id);

describe("moveBookingRoom", () => {
  it("rejects a missing or blank reason, and moving into the same room", async () => {
    seedBooking();
    await expect(moveBookingRoom("bk-move", { newRoomId: "r-2", reason: "   " }))
      .rejects.toThrow(/reason is required/i);
    await expect(moveBookingRoom("bk-move", { newRoomId: "r-1", reason: "x" }))
      .rejects.toThrow(/already/i);
    expect(bookingUpdate("bk-move")).toHaveLength(0);
  });

  it("rejects bookings that are not Checked In", async () => {
    await expect(
      moveBookingRoom(seedBooking({ status: "Approved" }).id, { newRoomId: "r-2", reason: "x" }))
      .rejects.toThrow(/Checked-In/i);
    expect(bookingUpdate("bk-move")).toHaveLength(0);
  });

  it("rejects an unknown target room", async () => {
    seedBooking();
    await expect(moveBookingRoom("bk-move", { newRoomId: "r-nope", reason: "x" }))
      .rejects.toThrow(/room not found|target room/i);
  });

  it("rejects a target room that is not Available", async () => {
    for (const status of ["Occupied", "Reserved", "Out of Order", "Dirty / Needs Cleaning", "Pending Approval"]) {
      seedBooking({ roomId: "r-1" });
      store.rooms["r-2"].status = status;
      await expect(moveBookingRoom("bk-move", { newRoomId: "r-2", reason: `as ${status}` }))
        .rejects.toThrow(/not available|available room/i);
    }
    expect(bookingUpdate("bk-move")).toHaveLength(0);
  });

  it("aborts when the booking changed state inside the transaction", async () => {
    seedBooking();
    getDoc.mockImplementationOnce(async (ref) => {
      const snapped = snapshot({ ...store[ref.collection]?.[ref.id] });
      store.bookings[ref.id].status = "Checked Out";
      return snapped;
    });

    await expect(moveBookingRoom("bk-move", { newRoomId: "r-2", reason: "x" }))
      .rejects.toThrow(/changed since you opened/i);
    expect(bookingUpdate("bk-move")).toHaveLength(0);
  });

  it("moves the guest: booking roomId, room statuses, old markers freed", async () => {
    seedBooking();

    const result = await moveBookingRoom("bk-move", { newRoomId: "r-2", reason: "AC broken" });

    expect(result.ok).toBe(true);
    const write = bookingUpdate("bk-move");
    expect(write).toHaveLength(1);
    expect(write[0].data.roomId).toBe("r-2");
    // The move never reprices — totalCost stays exactly what it was.
    expect(write[0].data.totalCost).toBeUndefined();
    expect(store.bookings["bk-move"].totalCost).toBe(2000);
    const move = write[0].data.roomMoves[0];
    expect(move).toMatchObject({
      fromRoomId: "r-1",
      toRoomId: "r-2",
      rateDelta: 500,
      reason: "AC broken",
      byUid: "fo-1",
      byEmail: "fo@hotelease.test"});

    expect(roomUpdate("r-1")[0].data.status).toBe("Dirty / Needs Cleaning");
    expect(roomUpdate("r-1")[0].data.statusChangedAt).toBe("server-time");
    expect(roomUpdate("r-2")[0].data.status).toBe("Occupied");
    expect(roomUpdate("r-2")[0].data.statusChangedAt).toBe("server-time");

    expect(deletes.map((d) => d.id).sort()).toEqual([
      "r-1_2026-10-22", "r-1_2026-10-23"]);
    expect(claimBookingMarkedInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        roomId: "r-2",
        bookingId: "bk-move",
        status: "Checked In"}));
  });

  it("records a negative rate delta for a downgrade", async () => {
    seedBooking();
    await moveBookingRoom("bk-move", { newRoomId: "r-2", reason: "x" });
    store.rooms["r-1"].ratePerNight = 800;
    store.rooms["r-1"].status = "Available"; // housekeeping turned the old room over
    store.rooms["r-2"].ratePerNight = 900;

    await moveBookingRoom("bk-move", { newRoomId: "r-1", reason: "Guest asked to switch back" });

    expect(bookingUpdate("bk-move").at(-1).data.roomId).toBe("r-1");
    expect(store.bookings["bk-move"].roomMoves).toHaveLength(2);
    expect(store.bookings["bk-move"].roomMoves[1].rateDelta).toBe(-100);
  });

  it("notifies the guest with the new room", async () => {
    seedBooking();
    await moveBookingRoom("bk-move", { newRoomId: "r-2", reason: "AC broken" });
    expect(createNotification).toHaveBeenCalledWith("guest-1", expect.objectContaining({
      title: "Room Changed",
      message: expect.stringContaining("Suite 201")}));
  });

  it("maps a marker conflict to a clear move message", async () => {
    seedBooking();
    claimBookingMarkedInTx.mockRejectedValueOnce(
      new Error("Booking nights already claimed for another booking."));

    await expect(moveBookingRoom("bk-move", { newRoomId: "r-2", reason: "x" }))
      .rejects.toThrow(/reserved by another booking|already claimed/i);
    expect(bookingUpdate("bk-move")).toHaveLength(0);
  });
});
