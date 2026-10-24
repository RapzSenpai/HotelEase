import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * adjustBookingRate — FO nightly-rate adjustment for negotiated / walk-in
 * prices. Firestore is a thin in-memory stand-in (same idiom as
 * no-show-service.test.js). Pre-check-in only (Pending / Approved): there
 * baseTotal is exactly rate × nights, so a rate swap is a delta on
 * baseTotal + totalCost, never a full reprice of the stay.
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

vi.mock("@/services/availabilityService", () => ({
  claimBookingMarkedInTx: vi.fn(),
  dateKey: (d) => String(d),
  MARKER_CONFLICT_MESSAGE: "marker conflict",
  readBookingMarkedInTx: vi.fn(),
  setBookingMarked: vi.fn()}));

vi.mock("@/services/notificationService", () => ({
  createNotification: vi.fn(async () => ({}))}));

vi.mock("@/services/emailService", () => ({
  sendBookingConfirmation: vi.fn(async () => ({}))}));

vi.mock("@/services/paymentsService", () => ({
  recordPayment: vi.fn(async () => ({}))}));

vi.mock("@/services/booking/queries", () => ({
  getAvailableRoomIds: vi.fn(async () => new Set())}));

const store = { bookings: {} };
const updates = []; // every tx.update write, [{ collection, id, data }]

function snapshot(data) {
  if (!data) return { exists: () => false, data: () => ({}) };
  return { exists: () => true, data: () => data };
}

function makeTx() {
  return {
    get: vi.fn(async (ref) => snapshot(store[ref.collection]?.[ref.id])),
    update: vi.fn((ref, data) => {
      updates.push({ collection: ref.collection, id: ref.id, data });
      const target = store[ref.collection]?.[ref.id];
      if (target) Object.assign(target, data);
    })};
}

const { runTransaction, getDoc } = await import("firebase/firestore");

runTransaction.mockImplementation((_db, fn) => fn(makeTx()));
getDoc.mockImplementation(async (ref) => snapshot(store[ref.collection]?.[ref.id]));

const { adjustBookingRate } = await import("@/services/booking/lifecycle");
const { createNotification } = await import("@/services/notificationService");

const pending = {
  id: "bk-rate",
  status: "Pending",
  guestId: "guest-1",
  roomId: "r-1",
  roomName: "Deluxe 101",
  nights: 3,
  baseTotal: 3000,
  totalCost: 3000,
  extraPaxTotal: 0};

function seedBooking(patch = {}) {
  const data = { ...pending, ...patch };
  store.bookings[data.id] = data;
  return data;
}

beforeEach(() => {
  store.bookings = {};
  updates.length = 0;
  mockAuth.currentUser = { uid: "fo-1", email: "fo@hotelease.test" };
  createNotification.mockClear();
});

const bookingUpdate = (id) =>
  updates.filter((u) => u.collection === "bookings" && u.id === id);

describe("adjustBookingRate", () => {
  it("rejects a non-positive or non-numeric rate", async () => {
    seedBooking();
    await expect(adjustBookingRate("bk-rate", { newRatePerNight: 0, reason: "x" }))
      .rejects.toThrow(/valid positive nightly rate/i);
    await expect(adjustBookingRate("bk-rate", { newRatePerNight: -5, reason: "x" }))
      .rejects.toThrow(/valid positive nightly rate/i);
    await expect(adjustBookingRate("bk-rate", { newRatePerNight: "abc", reason: "x" }))
      .rejects.toThrow(/valid positive nightly rate/i);
  });

  it("rejects a missing or blank reason", async () => {
    seedBooking();
    await expect(adjustBookingRate("bk-rate", { newRatePerNight: 1200 }))
      .rejects.toThrow(/reason is required/i);
    await expect(adjustBookingRate("bk-rate", { newRatePerNight: 1200, reason: "   " }))
      .rejects.toThrow(/reason is required/i);
  });

  it("refuses when no user is signed in", async () => {
    seedBooking();
    mockAuth.currentUser = null;
    await expect(adjustBookingRate("bk-rate", { newRatePerNight: 1200, reason: "walk-in" }))
      .rejects.toThrow(/sign in/i);
  });

  it("rejects bookings that are not Pending or Approved", async () => {
    await expect(
      adjustBookingRate(seedBooking({ status: "Awaiting Payment" }).id, { newRatePerNight: 1200, reason: "x" }))
      .rejects.toThrow(/Pending or Approved/i);
    await expect(
      adjustBookingRate(seedBooking({ status: "Checked In" }).id, { newRatePerNight: 1200, reason: "x" }))
      .rejects.toThrow(/Pending or Approved/i);
    await expect(
      adjustBookingRate(seedBooking({ status: "Cancelled" }).id, { newRatePerNight: 1200, reason: "x" }))
      .rejects.toThrow(/Pending or Approved/i);
    expect(bookingUpdate("bk-rate")).toHaveLength(0);
  });

  it("raises the total when the rate goes up and records who and why", async () => {
    seedBooking();

    const result = await adjustBookingRate("bk-rate", {
      newRatePerNight: 1200,
      reason: "Walk-in negotiated price"});

    expect(result.ok).toBe(true);
    expect(result.newRatePerNight).toBe(1200);
    const write = bookingUpdate("bk-rate");
    expect(write).toHaveLength(1);
    expect(write[0].data.baseTotal).toBe(3600);
    expect(write[0].data.totalCost).toBe(3600);
    expect(write[0].data.rateAdjustments).toHaveLength(1);
    expect(write[0].data.rateAdjustments[0]).toMatchObject({
      previousRatePerNight: 1000,
      newRatePerNight: 1200,
      baseDelta: 600,
      reason: "Walk-in negotiated price",
      byUid: "fo-1",
      byEmail: "fo@hotelease.test"});
  });

  it("lowers the total when the rate goes down and keeps subtotal in step", async () => {
    seedBooking({ subtotal: 3000 });

    const result = await adjustBookingRate("bk-rate", {
      newRatePerNight: 800,
      reason: "Corporate rate"});

    expect(result.newRatePerNight).toBe(800);
    const write = bookingUpdate("bk-rate");
    expect(write[0].data.baseTotal).toBe(2400);
    expect(write[0].data.totalCost).toBe(2400);
    expect(write[0].data.subtotal).toBe(2400);
    expect(write[0].data.rateAdjustments[0].baseDelta).toBe(-600);
  });

  it("aborts when the booking changed state inside the transaction", async () => {
    seedBooking();
    // The pre-flight read returns Pending, then the guest cancels (or another
    // FO session flips status) before the transaction commits.
    getDoc.mockImplementationOnce(async (ref) => {
      // Freeze the pre-flight view: copy BEFORE the mutation so the closure
      // stays Pending, while tx.get (reads the live store) sees the flip.
      const snapped = snapshot({ ...store[ref.collection]?.[ref.id] });
      store.bookings[ref.id].status = "Cancelled";
      return snapped;
    });

    await expect(adjustBookingRate("bk-rate", { newRatePerNight: 1200, reason: "x" }))
      .rejects.toThrow(/changed since you opened/i);
    expect(bookingUpdate("bk-rate")).toHaveLength(0);
  });

  it("notifies the guest with the new nightly rate and total", async () => {
    seedBooking({ totalCost: 3450, overstayFee: 450 });

    await adjustBookingRate("bk-rate", { newRatePerNight: 1100, reason: "Depreciated room" });

    expect(createNotification).toHaveBeenCalledWith("guest-1", expect.objectContaining({
      type: "booking_rate_adjusted",
      title: "Booking Rate Updated"}));
  });

  it("derives the missing baseTotal from totalCost minus extras", async () => {
    // Legacy booking written before baseTotal existed: 3 nights, part of the
    // total is an extra-pax charge. The naive `baseTotal ?? 0` would spend
    // the whole new base into totalCost a second time.
    seedBooking({
      baseTotal: undefined,
      totalCost: 3450,
      extraPaxTotal: 450,
      overstayFee: 0});

    await adjustBookingRate("bk-rate", { newRatePerNight: 800, reason: "x" });

    const write = bookingUpdate("bk-rate");
    // Fallback base = 3450 − 450 = 3000; new base = 800 × 3 = 2400; delta −600.
    expect(write[0].data.baseTotal).toBe(2400);
    expect(write[0].data.totalCost).toBe(2850);
    expect(write[0].data.rateAdjustments[0].baseDelta).toBe(-600);
  });

  it("appends a second adjustment keeping full history", async () => {
    seedBooking();

    await adjustBookingRate("bk-rate", { newRatePerNight: 1200, reason: "first" });
    await adjustBookingRate("bk-rate", { newRatePerNight: 900, reason: "second" });

    const adjustments = bookingUpdate("bk-rate").at(-1).data.rateAdjustments;
    expect(adjustments).toHaveLength(2);
    expect(adjustments[0]).toMatchObject({ previousRatePerNight: 1000, newRatePerNight: 1200 });
    expect(adjustments[1]).toMatchObject({ previousRatePerNight: 1200, newRatePerNight: 900, reason: "second" });
  });
});
