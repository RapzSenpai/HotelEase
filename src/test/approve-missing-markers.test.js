import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransactionWrites = [];
const mockReadBookingMarkedInTx = vi.fn();
const mockClaimBookingMarkedInTx = vi.fn();
const mockSetBookingMarked = vi.fn();
const mockRecordPayment = vi.fn();
const mockCreateNotification = vi.fn();
const mockSendBookingConfirmation = vi.fn();

let mockBookingSnapData = {};
let mockRoomSnapData = {};

vi.mock("firebase/firestore", () => ({
  collection: (_db, col) => ({ col }),
  doc: (_db, col, id) => ({ col, id, __path: `${col}/${id}` }),
  getDoc: async (_ref) => ({
    exists: () => true,
    data: () => mockBookingSnapData,
  }),
  getDocs: async () => ({ docs: [], size: 0 }),
  query: () => ({}),
  where: () => ({}),
  runTransaction: async (_db, fn) => {
    return fn({
      get: async (ref) => {
        if (ref.__path?.includes("bookings") || ref.col === "bookings") {
          return { exists: () => true, data: () => mockBookingSnapData };
        }
        return { exists: () => true, data: () => mockRoomSnapData };
      },
      update: (...args) => mockTransactionWrites.push(["update", ...args]),
      set: (...args) => mockTransactionWrites.push(["set", ...args]),
    });
  },
  serverTimestamp: () => "server-timestamp",
  Timestamp: {
    fromDate: (d) => d,
  },
  deleteField: () => ({ __delete: true }),
  increment: (val) => val,
}));

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { uid: "fo-user-1" } }),
}));

vi.mock("@/firebase/firebase.config", () => ({
  auth: { currentUser: { uid: "fo-user-1" } },
  db: {},
}));

vi.mock("@/services/availabilityService", () => ({
  readBookingMarkedInTx: (...args) => mockReadBookingMarkedInTx(...args),
  claimBookingMarkedInTx: (...args) => mockClaimBookingMarkedInTx(...args),
  setBookingMarked: (...args) => mockSetBookingMarked(...args),
  nightKeys: () => ["2026-11-10", "2026-11-11"],
  dateKey: (d) => d,
  markersCollection: () => "room_availability",
  MARKER_CONFLICT_MESSAGE: "Those dates were just taken by another guest. Please choose different dates.",
}));

vi.mock("@/services/roomsService", () => ({
  isRoomActive: () => true,
}));

vi.mock("@/services/notificationService", () => ({
  createNotification: (...args) => mockCreateNotification(...args),
}));

vi.mock("@/services/emailService", () => ({
  sendBookingConfirmation: (...args) => mockSendBookingConfirmation(...args),
}));

vi.mock("@/services/paymentsService", () => ({
  recordPayment: (...args) => mockRecordPayment(...args),
}));

const { approveBooking } = await import("@/services/booking/lifecycle");

describe("approveBooking missing markers recovery and conflict safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionWrites.length = 0;
    mockBookingSnapData = {
      id: "bk-100",
      guestId: "guest-1",
      roomId: "room-1",
      status: "Pending",
      paymentMethod: "Online Payment",
      paymentGateway: "xendit",
      gatewayRef: "inv-123",
      xenditPaidAmount: 3000,
      totalCost: 3000,
      checkInDate: "2026-11-10",
      checkOutDate: "2026-11-12",
    };
    mockRoomSnapData = {
      id: "room-1",
      name: "Deluxe King",
      status: "Available",
      isActive: true,
    };
  });

  it("recovers missing markers and approves successfully when no date conflict exists", async () => {
    mockReadBookingMarkedInTx.mockResolvedValueOnce({ complete: false, live: [] });
    mockClaimBookingMarkedInTx.mockResolvedValueOnce({ claimed: 2 });

    const result = await approveBooking("bk-100");

    expect(result.ok).toBe(true);
    expect(mockClaimBookingMarkedInTx).toHaveBeenCalledTimes(1);
    expect(mockClaimBookingMarkedInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        roomId: "room-1",
        bookingId: "bk-100",
        status: "Pending",
      })
    );
    expect(mockSetBookingMarked).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        bookingId: "bk-100",
        status: "Approved",
      })
    );
  });

  it("blocks approval and throws conflict error when missing markers conflict with another booking", async () => {
    mockReadBookingMarkedInTx.mockResolvedValueOnce({ complete: false, live: [] });
    mockClaimBookingMarkedInTx.mockRejectedValueOnce(
      new Error("Those dates were just taken by another guest. Please choose different dates.")
    );

    await expect(approveBooking("bk-100")).rejects.toThrow(
      "Cannot approve — another booking for this room already covers these dates."
    );
  });

  it("blocks approval when existing live markers belong to another booking", async () => {
    mockReadBookingMarkedInTx.mockResolvedValueOnce({
      complete: true,
      live: [{ date: "2026-11-10", bookingId: "other-booking", status: "Approved" }],
    });

    await expect(approveBooking("bk-100")).rejects.toThrow(
      "Cannot approve — another booking for this room already covers these dates."
    );
    expect(mockClaimBookingMarkedInTx).not.toHaveBeenCalled();
  });
});

