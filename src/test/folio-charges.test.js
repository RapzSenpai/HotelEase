import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * addFolioCharge + voidFolioCharge — desk charges (minibar, damage, etc.) on a
 * Checked-In booking. Firestore is a thin in-memory stand-in (same idiom as
 * rate-adjustment.test.js). Charges are booking-local entries with a booking-
 * embedded audit trail (FO cannot write /audit_logs — see rate adjustment).
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

const { addFolioCharge, voidFolioCharge } = await import("@/services/booking/lifecycle");
const { createNotification } = await import("@/services/notificationService");

const checkedIn = {
  id: "bk-folio",
  status: "Checked In",
  guestId: "guest-1",
  roomId: "r-1",
  roomName: "Deluxe 101",
  nights: 3,
  baseTotal: 3000,
  totalCost: 3600,
  overstayFee: 600,
  extraPaxTotal: 0};

function seedBooking(patch = {}) {
  const data = { ...checkedIn, ...patch };
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

describe("addFolioCharge", () => {
  it("rejects a missing or blank label", async () => {
    seedBooking();
    await expect(addFolioCharge("bk-folio", { amount: 500 }))
      .rejects.toThrow(/description of the charge is required/i);
    await expect(addFolioCharge("bk-folio", { amount: 500, label: "   " }))
      .rejects.toThrow(/description of the charge is required/i);
  });

  it("rejects a non-positive or non-numeric amount", async () => {
    seedBooking();
    await expect(addFolioCharge("bk-folio", { label: "Minibar", amount: 0 }))
      .rejects.toThrow(/valid positive amount/i);
    await expect(addFolioCharge("bk-folio", { label: "Minibar", amount: -25 }))
      .rejects.toThrow(/valid positive amount/i);
    await expect(addFolioCharge("bk-folio", { label: "Minibar", amount: "abc" }))
      .rejects.toThrow(/valid positive amount/i);
  });

  it("rejects bookings that are not Checked In", async () => {
    await expect(
      addFolioCharge(seedBooking({ status: "Pending" }).id, { label: "Minibar", amount: 500 }))
      .rejects.toThrow(/Checked-In bookings/i);
    await expect(
      addFolioCharge(seedBooking({ status: "Approved" }).id, { label: "Minibar", amount: 500 }))
      .rejects.toThrow(/Checked-In bookings/i);
    expect(bookingUpdate("bk-folio")).toHaveLength(0);
  });

  it("aborts when the booking changed state inside the transaction", async () => {
    seedBooking();
    getDoc.mockImplementationOnce(async (ref) => {
      const snapped = snapshot({ ...store[ref.collection]?.[ref.id] });
      store.bookings[ref.id].status = "Checked Out";
      return snapped;
    });

    await expect(addFolioCharge("bk-folio", { label: "Minibar", amount: 500 }))
      .rejects.toThrow(/changed since you opened/i);
    expect(bookingUpdate("bk-folio")).toHaveLength(0);
  });

  it("adds the charge, raises totalCost/subtotal and records who and why", async () => {
    seedBooking();

    const result = await addFolioCharge("bk-folio", { label: "Minibar", amount: 350 });

    expect(result.ok).toBe(true);
    const write = bookingUpdate("bk-folio");
    expect(write).toHaveLength(1);
    expect(write[0].data.totalCost).toBe(3950);
    expect(write[0].data.subtotal).toBe(3950);
    // overstayFee is pre-existing folio state — a charge write must not touch it
    expect(store.bookings["bk-folio"].overstayFee).toBe(600);
    const entry = write[0].data.otherCharges[0];
    expect(entry).toMatchObject({
      label: "Minibar",
      amount: 350,
      byUid: "fo-1",
      byEmail: "fo@hotelease.test",
      voided: false});
    expect(entry.chargeId).toMatch(/^chg-/);
  });

  it("notifies the guest", async () => {
    seedBooking();
    await addFolioCharge("bk-folio", { label: "Minibar", amount: 350 });
    expect(createNotification).toHaveBeenCalledWith("guest-1", expect.objectContaining({
      title: "Folio Charge Added"}));
  });

  it("accumulates a second charge keeping the first entry", async () => {
    seedBooking({ totalCost: 3000, overstayFee: 0, subtotal: 3000 });

    await addFolioCharge("bk-folio", { label: "Minibar", amount: 350 });
    await addFolioCharge("bk-folio", { label: "Damaged towel", amount: 250 });

    const write = bookingUpdate("bk-folio").at(-1).data;
    expect(write.otherCharges).toHaveLength(2);
    expect(write.otherCharges.map((c) => c.label)).toEqual(["Minibar", "Damaged towel"]);
    expect(write.totalCost).toBe(3600);
  });
});

describe("voidFolioCharge", () => {
  it("rejects unknown charges, already-voided charges and blank reasons", async () => {
    seedBooking({
      otherCharges: [{ chargeId: "chg-1", label: "Minibar", amount: 350, byUid: "fo-1", voided: false }],
      totalCost: 3350, subtotal: 3350});

    await expect(voidFolioCharge("bk-folio", { chargeId: "chg-nope", reason: "x" }))
      .rejects.toThrow(/no charge/i);
    await expect(voidFolioCharge("bk-folio", { chargeId: "chg-1", reason: "  " }))
      .rejects.toThrow(/reason is required/i);
  });

  it("nets the charge out of totalCost/subtotal and flags the entry", async () => {
    seedBooking({
      otherCharges: [{ chargeId: "chg-1", label: "Minibar", amount: 350, byUid: "fo-0", voided: false }],
      totalCost: 3950, subtotal: 3950});

    const result = await voidFolioCharge("bk-folio", { chargeId: "chg-1", reason: "Charged in error" });

    expect(result.ok).toBe(true);
    const write = bookingUpdate("bk-folio");
    expect(write).toHaveLength(1);
    expect(write[0].data.totalCost).toBe(3600);
    expect(write[0].data.subtotal).toBe(3600);
    const entry = write[0].data.otherCharges[0];
    expect(entry).toMatchObject({
      chargeId: "chg-1",
      voided: true,
      voidReason: "Charged in error",
      voidedByEmail: "fo@hotelease.test"});
  });

  it("does not let a charge be voided twice", async () => {
    seedBooking({
      otherCharges: [{ chargeId: "chg-1", label: "Minibar", amount: 350, voided: true, voidReason: "x" }],
      totalCost: 3600});

    await expect(voidFolioCharge("bk-folio", { chargeId: "chg-1", reason: "again" }))
      .rejects.toThrow(/already voided/i);
    expect(bookingUpdate("bk-folio")).toHaveLength(0);
  });

  it("lets a charge added after a void land on the reduced total", async () => {
    seedBooking({ totalCost: 3000 });
    await addFolioCharge("bk-folio", { label: "Minibar", amount: 350 });
    const chargeId = store.bookings["bk-folio"].otherCharges[0].chargeId;
    await voidFolioCharge("bk-folio", { chargeId, reason: "Mistake" });
    expect(store.bookings["bk-folio"].totalCost).toBe(3000);

    await addFolioCharge("bk-folio", { label: "Damage", amount: 800 });
    expect(store.bookings["bk-folio"].totalCost).toBe(3800);
    expect(createNotification).toHaveBeenCalledWith("guest-1", expect.objectContaining({
      title: "Folio Charge Removed"}));
  });
});
