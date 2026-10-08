import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = { currentUser: null };

vi.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (_db, collectionRef, id) => ({ collection: collectionRef, id }),
  runTransaction: vi.fn(),
  serverTimestamp: () => "server-time",
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/firebase/firebase.config", () => ({ auth: mockAuth, db: {} }));

const {
  claimBookingMarked,
  claimBookingMarkedInTx,
  MARKER_CONFLICT_MESSAGE,
} = await import("@/services/availabilityService");
const { getCol } = await import("@/lib/db-utils");

describe("availability marker notification outbox", () => {
  beforeEach(() => {
    mockAuth.currentUser = null;
    vi.stubEnv("VITE_GROQ_PROXY_URL", "https://worker.example");
    vi.stubGlobal("fetch", vi.fn());
  });

  it("maps the outbox to the training sandbox", () => {
    expect(getCol("booking_notification_jobs", true)).toBe("training_booking_notification_jobs");
    expect(getCol("booking_notification_jobs", false)).toBe("booking_notification_jobs");
  });

  it("claims markers through the authenticated Worker endpoint", async () => {
    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue("firebase-token") };
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, claimed: 2 }),
    });

    await expect(claimBookingMarked({
      bookingId: "booking-1",
      trainingMode: false,
    })).resolves.toEqual({ claimed: 2 });

    expect(fetch).toHaveBeenCalledWith(
      "https://worker.example/claim-booking-markers",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-HE-AUTH": "Bearer firebase-token",
        },
        body: JSON.stringify({ bookingId: "booking-1", trainingMode: false }),
      }),
    );
  });

  it("fails explicitly when authentication or Worker configuration is missing", async () => {
    await expect(claimBookingMarked({
      bookingId: "booking-1",
      trainingMode: false,
    })).rejects.toThrow(/sign in/i);

    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue("firebase-token") };
    vi.stubEnv("VITE_GROQ_PROXY_URL", "");
    await expect(claimBookingMarked({
      bookingId: "booking-1",
      trainingMode: false,
    })).rejects.toThrow(/worker.*configured/i);
  });

  it("preserves the marker conflict message returned by the Worker", async () => {
    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue("firebase-token") };
    fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: MARKER_CONFLICT_MESSAGE }),
    });

    await expect(claimBookingMarked({
      bookingId: "booking-1",
      trainingMode: false,
    })).rejects.toThrow(MARKER_CONFLICT_MESSAGE);
  });

  it("does not transition the outbox from the client marker transaction", async () => {
    const transaction = {
      get: vi.fn(async () => ({ exists: () => false })),
      set: vi.fn(),
      update: vi.fn(),
    };

    await claimBookingMarkedInTx(transaction, {
      roomId: "r1",
      bookingId: "b1",
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      status: "Pending",
    });

    expect(transaction.set).toHaveBeenCalledTimes(2);
    expect(transaction.update).not.toHaveBeenCalled();
  });
});
