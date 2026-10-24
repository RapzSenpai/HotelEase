import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * markNoShow + runNightAudit behavior. Firestore is a thin in-memory stand-in
 * (same idiom as availability-outbox.test.js), while computeRefund — the real
 * money policy — stays unmocked so the no-show refund math is truly exercised.
 */

const mockAuth = { currentUser: null };

vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ collection: name }),
  // doc(db, "col", id) → keyed ref; doc(collection(db, name)) → auto id.
  doc: (db, ref, id) => {
    if (ref === undefined && typeof db === "object" && db?.collection) {
      return {
        collection: db.collection,
        id: `auto-${db.collection}-${Math.random().toString(36).slice(2, 8)}`};
    }
    return { collection: ref, id };
  },
  query: (_db, ...args) => ({ collection: args[0]?.collection ?? "bookings", args: args.slice(1) }),
  where: vi.fn((...args) => ({ where: args })),
  orderBy: (...args) => ({ orderBy: args }),
  limit: (...args) => ({ limit: args }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: () => "server-time",
  Timestamp: { fromDate: (d) => d, fromMillis: (ms) => ms },
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn()}));

vi.mock("@/firebase/firebase.config", () => ({ auth: mockAuth, db: {} }));

vi.mock("@/services/bookingsService", () => ({
  listBookingsByStatuses: vi.fn(async () => []),
  countCheckInsToday: vi.fn(async () => 0),
  countCheckOutsDue: vi.fn(async () => 0),
  countOverdueCheckOuts: vi.fn(async () => 0)}));

vi.mock("@/services/roomsService", () => ({
  listRooms: vi.fn(async () => [])}));

vi.mock("@/services/paymentsService", () => ({
  listPaymentsForBooking: vi.fn(async () => [])}));

vi.mock("@/services/booking/core", () => ({
  releaseAvailabilityMarkers: vi.fn(async () => ({}))}));

vi.mock("@/services/notificationService", () => ({
  createNotification: vi.fn(async () => ({}))}));

/**
 * In-memory store: same objects the fake tx reads/writes, keyed by collection.
 * tx.update() MUTATES the stored docs so later transactions observe previous
 * commits (real sequential-tx semantics).
 */
const store = { bookings: {}, rooms: {}, refunds: [], night_audits: {}, payments: [] };
const updates = []; // every tx.update write, [{ collection, id, data }]

function snapshot(data) {
  if (!data) return { exists: () => false, data: () => ({}) };
  return { exists: () => true, data: () => data };
}

function makeTx() {
  return {
    get: vi.fn(async (ref) =>
      snapshot(ref.collection === "night_audits"
        ? store.night_audits[ref.id]
        : store[ref.collection]?.[ref.id])),
    update: vi.fn((ref, data) => {
      updates.push({ collection: ref.collection, id: ref.id, data });
      const target = ref.collection === "night_audits"
        ? store.night_audits[ref.id]
        : store[ref.collection]?.[ref.id];
      if (target) Object.assign(target, data);
    }),
    set: vi.fn((ref, data) => {
      updates.push({ collection: ref.collection, id: ref.id, data, set: true });
      if (ref.collection === "night_audits") {
        store.night_audits[ref.id] = { ...store.night_audits[ref.id], ...data };
      }
    })};
}

const { runTransaction, getDocs, getDoc, where } = await import("firebase/firestore");

// Real sequential transactions: each call runs against store state.
runTransaction.mockImplementation((_db, fn) => fn(makeTx()));
getDocs.mockImplementation(async () => ({ docs: [] }));
getDoc.mockImplementation(async (ref) =>
  snapshot(ref.collection === "night_audits"
    ? store.night_audits[ref.id]
    : store[ref.collection]?.[ref.id]));

const { markNoShow, runNightAudit, buildNoShowRefundPlan }
  = await import("@/services/nightAuditService");
const { releaseAvailabilityMarkers } = await import("@/services/booking/core");
const { createNotification } = await import("@/services/notificationService");
const { listPaymentsForBooking } = await import("@/services/paymentsService");
const {
  countCheckInsToday, countCheckOutsDue, countOverdueCheckOuts,
  listBookingsByStatuses} = await import("@/services/bookingsService");
const { listRooms } = await import("@/services/roomsService");
const { setDoc } = await import("firebase/firestore");

// Oct 21 2026 evening (local). Arrival days in fixtures use strings.
const NOW = new Date(2026, 9, 21, 20, 30, 0);
const twoDaysLate = {
  id: "bk-1",
  status: "Approved",
  checkInDate: "2026-10-19",
  checkOutDate: "2026-10-22",
  roomId: "r-1",
  guestId: "guest-1",
  roomName: "Deluxe 101",
  rateType: "Standard",
  nights: 3,
  baseTotal: 3000,
  totalCost: 3000};

function seedBooking(patch = {}) {
  const data = { ...twoDaysLate, ...patch };
  store.bookings[data.id] = data;
  return data;
}

beforeEach(() => {
  // markNoShow compares arrival dates to the real clock — freeze it at the
  // fixture's "tonight" so "arrival date has passed" logic stays date-stable.
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  store.bookings = {};
  store.rooms = {};
  store.refunds = [];
  store.night_audits = {};
  store.payments = [];
  updates.length = 0;
  mockAuth.currentUser = null;
  releaseAvailabilityMarkers.mockClear();
  createNotification.mockClear();
  setDoc.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const bookingUpdate = (id) =>
  updates.filter((u) => u.collection === "bookings" && u.id === id && !u.set);
const roomUpdate = (id) =>
  updates.filter((u) => u.collection === "rooms" && u.id === id && !u.set);
const refundSet = () => updates.filter((u) => u.collection === "refunds");

describe("markNoShow", () => {
  it("cancels a late Approved booking, frees the room and its night markers", async () => {
    seedBooking();
    store.rooms["r-1"] = { id: "r-1", status: "Reserved" };

    const result = await markNoShow("bk-1", {
      markedBy: "Ana Cruz",
      markedByUserId: "fo-1"});

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    const write = bookingUpdate("bk-1");
    expect(write).toHaveLength(1);
    expect(write[0].data.status).toBe("Cancelled");
    expect(write[0].data.noShow).toBe(true);
    expect(write[0].data.noShowMarkedBy).toBe("Ana Cruz");
    expect(write[0].data.rejectionReason).toMatch(/no-show/i);
    expect(roomUpdate("r-1")[0].data.status).toBe("Available");
    expect(releaseAvailabilityMarkers).toHaveBeenCalledWith(
      expect.objectContaining({ id: "bk-1", roomId: "r-1" }));
  });

  it("notifies the guest it was a no-show", async () => {
    seedBooking();
    await markNoShow("bk-1", { markedBy: "Ana Cruz" });
    expect(createNotification).toHaveBeenCalledWith("guest-1", expect.objectContaining({
      type: "booking_cancelled",
      title: expect.stringMatching(/no-show/i)}));
  });

  it("queues the one-night-fee refund when the guest paid", async () => {
    seedBooking();
    store.rooms["r-1"] = { id: "r-1", status: "Reserved" };
    listPaymentsForBooking.mockResolvedValue([{ amount: 3000, method: "GCash" }]);

    const result = await markNoShow("bk-1", { markedBy: "Ana Cruz" });

    // One night of baseTotal (₱1,000 of ₱3,000 over 3 nights) is withheld.
    expect(result.refundRequested).toBe(2000);
    const write = refundSet();
    expect(write).toHaveLength(1);
    expect(write[0].data).toMatchObject({
      bookingId: "bk-1",
      amount: 2000,
      fee: 1000,
      method: "GCash",
      status: "Pending"});
    expect(bookingUpdate("bk-1").some((u) => u.data.refundStatus === "Pending")).toBe(true);
  });

  it("skips the refund for an unpaid no-show but still cancels", async () => {
    seedBooking();
    listPaymentsForBooking.mockResolvedValueOnce([]);

    const result = await markNoShow("bk-1", { markedBy: "Ana Cruz" });

    expect(result.changed).toBe(true);
    expect(result.refundRequested).toBe(0);
    expect(refundSet()).toHaveLength(0);
  });

  it("skips the refund when the fee swallows the payment", async () => {
    seedBooking({ nights: 1, baseTotal: 800, totalCost: 800 });
    listPaymentsForBooking.mockResolvedValueOnce([{ amount: 500, method: "GCash" }]);

    const result = await markNoShow("bk-1", { markedBy: "Ana Cruz" });

    expect(result.changed).toBe(true);
    expect(result.refundRequested).toBe(0);
    expect(refundSet()).toHaveLength(0);
  });

  it("does not create a second refund when one is already pending", async () => {
    seedBooking({ refundStatus: "Pending" });
    listPaymentsForBooking.mockResolvedValue([{ amount: 3000, method: "GCash" }]);

    const result = await markNoShow("bk-1", { markedBy: "Ana Cruz" });

    expect(result.changed).toBe(true);
    expect(result.refundRequested).toBe(0);
    expect(result.refundSkipped).toMatch(/already exists/i);
    expect(refundSet()).toHaveLength(0);
  });

  it("is idempotent: marking an already-cancelled no-show changes nothing", async () => {
    seedBooking({ status: "Cancelled", noShow: true, rejectionReason: "No-show" });
    store.rooms["r-1"] = { id: "r-1", status: "Available" };

    const result = await markNoShow("bk-1", { markedBy: "Ana Cruz" });

    expect(result).toEqual({ ok: true, changed: false, noShow: true, refundRequested: 0 });
    expect(bookingUpdate("bk-1")).toHaveLength(0);
    expect(roomUpdate("r-1")).toHaveLength(0);
    expect(releaseAvailabilityMarkers).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("supports the cancellation-retry path for a plain cancelled booking", async () => {
    seedBooking({ status: "Cancelled" });
    const result = await markNoShow("bk-1", { markedBy: "A" });
    expect(result.changed).toBe(false);
    expect(result.noShow).toBe(false);
    expect(bookingUpdate("bk-1")).toHaveLength(0);
  });

  it("refuses to mark a booking before the arrival date has passed", async () => {
    seedBooking({ checkInDate: "2026-10-21" }); // today

    await expect(
      markNoShow("bk-1", { markedBy: "Ana" }),
    ).rejects.toThrow(/cut-off|has passed|not yet/i);
  });

  it("refuses non-Approved bookings", async () => {
    seedBooking({ status: "Pending" });
    await expect(markNoShow("bk-1", { markedBy: "Ana" })).rejects.toThrow(/Approved/);
  });

  it("refuses unknown bookings", async () => {
    await expect(markNoShow("missing", { markedBy: "Ana" })).rejects.toThrow(/not found/i);
  });
});

describe("buildNoShowRefundPlan — the money math", () => {
  it("withholds exactly one night of baseTotal", () => {
    const plan = buildNoShowRefundPlan(twoDaysLate, 3000);
    expect(plan).toMatchObject({ amount: 2000, fee: 1000 });
    expect(plan.reason).toMatch(/no-show/i);
  });

  it("returns zero for a guest who never paid", () => {
    const plan = buildNoShowRefundPlan(twoDaysLate, 0);
    expect(plan.amount).toBe(0);
  });

  it("returns zero for a non-refundable rate", () => {
    const plan = buildNoShowRefundPlan({ ...twoDaysLate, rateType: "NonRefundable" }, 3000);
    expect(plan.amount).toBe(0);
  });
});

describe("runNightAudit — one snapshot per business date", () => {
  const late = twoDaysLate;
  const todayArrival = {
    ...twoDaysLate,
    id: "bk-today",
    checkInDate: "2026-10-21"};

  beforeEach(() => {
    listBookingsByStatuses.mockResolvedValueOnce([late, todayArrival]);
    countCheckInsToday.mockResolvedValueOnce(3);
    countCheckOutsDue.mockResolvedValueOnce(4);
    countOverdueCheckOuts.mockResolvedValueOnce(1);
    listRooms.mockResolvedValueOnce([
      { id: "r-1", status: "Occupied", isActive: true },
      { id: "r-2", status: "Available", isActive: true },
      { id: "r-3", status: "Reserved", isActive: true },
      { id: "r-4", status: "Available", isActive: false }, // archived — excluded
    ]);
    getDocs.mockImplementation(async () => ({
      docs: [{ id: "x", data: () => ({ noShow: true, noShowMarkedAt: NOW }) }] }));
  });

  it("writes a single date-keyed snapshot with explainable figures", async () => {
    const result = await runNightAudit(
      { runByName: "Ana Cruz", runByUserId: "fo-1" },
      NOW);

    // One document per business date — the snapshot IS the record, no dupes.
    const writes = setDoc.mock.calls;
    expect(writes).toHaveLength(1);
    const [ref, payload] = writes[0];
    expect(ref.id).toBe("2026-10-21");
    expect(payload).toMatchObject({
      auditDate: "2026-10-21",
      runCount: 1,
      runByName: "Ana Cruz",
      runByUserId: "fo-1",
      occupiedRooms: 1,
      totalRooms: 3,
      occupancyRate: 33,
      checkInsToday: 3,
      checkOutsDue: 4,
      overdueCheckOuts: 1,
      arrivalsTodayNotCheckedIn: 1,
      noShowEligible: 1,
      noShowsMarkedToday: 1});
    expect(result.runCount).toBe(1);
  });

  it("re-runs refresh the same document instead of duplicating it", async () => {
    store.night_audits["2026-10-21"] = { auditDate: "2026-10-21", runCount: 7 };

    const result = await runNightAudit(
      { runByName: "Ana Cruz", runByUserId: "fo-1" },
      NOW);

    expect(setDoc.mock.calls).toHaveLength(1);
    expect(setDoc.mock.calls[0][1].runCount).toBe(8);
    expect(result.runCount).toBe(8);
  });

  it("counts only no-shows marked today", async () => {
    // getDocs stands in for the range query result: docs inside today's
    // business day. The marker field + bounds are asserted separately below.
    getDocs.mockImplementation(async () => ({
      docs: [
        { id: "a", data: () => ({ noShow: true, noShowMarkedAt: NOW }) },
        { id: "c", data: () => ({ noShow: false, noShowMarkedAt: NOW }) },
      ]}));
    where.mockClear();

    const result = await runNightAudit({ runByName: "A", runByUserId: "u" }, NOW);
    expect(result.figures.noShowsMarkedToday).toBe(1);
    expect(where.mock.calls).toEqual([
      expect.arrayContaining(["noShowMarkedAt", ">=", expect.anything()]),
      expect.arrayContaining(["noShowMarkedAt", "<", expect.anything()])]);
  });
});
