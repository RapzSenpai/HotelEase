import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auto-read wiring at the two client payment-completion paths:
 * proof upload and the simulated gateway. After a payment completes, the
 * guest's unread "payment proof required" hint must flip to read.
 * notificationService is partially mocked — only this test's assertions
 * touch it; firestore is an in-memory stand-in (no-show-service idiom).
 */

const mockAuth = { currentUser: null };

vi.mock("@/firebase/firebase.config", () => ({ auth: mockAuth, db: {} }));

vi.mock("@/services/notificationService", () => ({
  createNotification: vi.fn(async () => ({})),
  markNotificationsOfTypeRead: vi.fn(async () => 1)}));
vi.mock("@/services/cloudinaryService", () => ({
  uploadImageToCloudinary: vi.fn(async () => ({ url: "https://res.test/proof.jpg" }))}));
vi.mock("@/services/userService", () => ({
  listFoUsers: vi.fn(async () => [{ id: "fo-1" }])}));
vi.mock("@/services/booking/core", () => ({
  bookingsCollection: () => "bookings"}));

const bookings = {};

function snapFor(id) {
  const data = bookings[id];
  return {
    exists: () => Boolean(data),
    data: () => ({ ...data })};
}

vi.mock("firebase/firestore", () => ({
  doc: (_db, col, id) => ({ collection: col, id }),
  getDoc: vi.fn(async (ref) => snapFor(ref.id)),
  runTransaction: vi.fn(async (_db, cb) => cb({
    get: async (ref) => snapFor(ref.id),
    update: (ref, data) => {
      bookings[ref.id] = { ...bookings[ref.id], ...data };
    }})),
  serverTimestamp: () => "server-time",
  Timestamp: { fromDate: (d) => d, fromMillis: (ms) => ms }}));

vi.mock("@/lib/db-utils", () => ({ getCol: (name) => name }));

// Stable "crypto" for reference-code generation on older runners.
if (!globalThis.crypto?.getRandomValues) {
  const { webcrypto } = await import("node:crypto");
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

const { markNotificationsOfTypeRead, createNotification } = await import(
  "@/services/notificationService");
const { uploadPaymentProof } = await import("@/services/booking/paymentProof");
const { completeSimulatedPayment } = await import(
  "@/services/paymentGatewayService");

const EMAIL = { uid: "user-1" };

function seedBooking(method = "GCash") {
  bookings["bk-1"] = {
    id: "bk-1",
    guestId: "user-1",
    status: "Awaiting Payment",
    paymentMethod: method,
    totalCost: 3000,
    nights: 2};
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(bookings).forEach((k) => delete bookings[k]);
  mockAuth.currentUser = EMAIL;
  seedBooking();
});

afterEach(() => {
  mockAuth.currentUser = null;
});

describe("uploadPaymentProof auto-read", () => {
  it("marks the guest's payment_proof_required notifications read", async () => {
    const res = await uploadPaymentProof("bk-1", new File(["x"], "p.jpg"), "Full", "GCash");
    expect(res.ok).toBe(true);
    expect(markNotificationsOfTypeRead).toHaveBeenCalledWith(
      "user-1", "payment_proof_required");
    // FO still learns about the upload.
    expect(createNotification).toHaveBeenCalledWith("fo-1", expect.anything());
  });

  it("FO fan-out survives an auto-read failure", async () => {
    markNotificationsOfTypeRead.mockRejectedValueOnce(new Error("offline"));
    await uploadPaymentProof("bk-1", new File(["x"], "p.jpg"), "Full", "GCash");
    expect(createNotification).toHaveBeenCalledWith("fo-1", expect.anything());
  });
});

describe("completeSimulatedPayment auto-read", () => {
  it("marks the guest's payment_proof_required notifications read", async () => {
    const res = await completeSimulatedPayment({ bookingId: "bk-1" });
    expect(res.ok).toBe(true);
    expect(markNotificationsOfTypeRead).toHaveBeenCalledWith(
      "user-1", "payment_proof_required");
    expect(createNotification).toHaveBeenCalledWith("fo-1", expect.anything());
  });

  it("FO fan-out survives an auto-read failure", async () => {
    markNotificationsOfTypeRead.mockRejectedValueOnce(new Error("offline"));
    await completeSimulatedPayment({ bookingId: "bk-1" });
    expect(createNotification).toHaveBeenCalledWith("fo-1", expect.anything());
  });
});
