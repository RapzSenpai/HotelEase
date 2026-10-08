import { describe, expect, it, vi } from "vitest";

// The guest's "Verifying & Booking…" wait must end when the booking and its
// night markers are committed — not when the bell fan-out finishes.
const claimBookingMarked = vi.fn();
const transactionWrites = [];
const compensationCalls = [];

vi.mock("firebase/firestore", () => {
  const room = { name: "Deluxe Suite", type: "Suite Room", ratePerNight: 1000, isActive: true };
  return {
    addDoc: async () => ({ id: "x" }),
    collection: (_db, name) => ({ __col: name }),
    deleteDoc: async (...args) => compensationCalls.push(["deleteDoc", ...args]),
    doc: (_db, collectionRef, id) => {
      const collectionName =
        typeof collectionRef === "string"
          ? collectionRef
          : collectionRef?.__col || collectionRef?.__doc || "collection";
      return {
        id: id || "booking-fixed",
        __doc: `${collectionName}${id ? `/${id}` : ""}`,
      };
    },
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    getDocs: async () => ({ docs: [], size: 0 }),
    limit: () => ({}),
    onSnapshot: () => () => {},
    orderBy: () => ({}),
    query: (ref) => ref,
    runTransaction: async (_db, fn) =>
      fn({
        get: async () => ({ exists: () => true, data: () => room }),
        set: (...write) => transactionWrites.push(write),
        update: () => {},
      }),
    serverTimestamp: () => ({ __ts: true }),
    setDoc: async () => {},
    Timestamp: { fromDate: (d) => d },
    updateDoc: async (...args) => compensationCalls.push(["updateDoc", ...args]),
    where: () => ({}),
  };
});

vi.mock("@/services/availabilityService", () => ({
  MARKER_CONFLICT_MESSAGE: "Those dates were just taken by another guest.",
  claimBookingMarked,
  clearBookingMarked: async () => {},
  getBlockedRoomIds: async () => new Set(),
  nightKeys: () => ["2026-10-01", "2026-10-02"],
}));

vi.mock("@/services/userService", () => ({
  listFoUsers: async () => [{ id: "fo-1" }],
}));

// Never settles: if createBooking still awaited the fan-out, the test hangs.
vi.mock("@/services/notificationService", () => ({
  createNotification: () => new Promise(() => {}),
}));

const { createBooking } = await import("@/services/booking/createBooking");

describe("createBooking submit path", () => {
  it("waits for the marker claim and returns the fixed booking ID", async () => {
    compensationCalls.length = 0;
    let resolveClaim;
    claimBookingMarked.mockImplementation(
      () => new Promise((resolve) => {
        resolveClaim = resolve;
      }),
    );
    let settled = false;
    const resultPromise = createBooking({
      guestId: "guest-1",
      roomId: "room-1",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      paxCount: 1,
      paymentMethod: "GCash",
      trainingMode: "prod",
    }).then((result) => {
      settled = true;
      return result;
    });

    await vi.waitFor(() => expect(claimBookingMarked).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    const outboxWrite = transactionWrites.find(([ref]) =>
      ref.__doc === "booking_notification_jobs/booking-fixed",
    );
    expect(outboxWrite?.[1]).toMatchObject({
      bookingId: "booking-fixed",
      guestId: "guest-1",
      status: "waiting_for_markers",
      markerDates: ["2026-10-01", "2026-10-02"],
    });
    expect(claimBookingMarked).toHaveBeenCalledTimes(1);
    expect(claimBookingMarked.mock.calls[0][0]).toEqual({
      bookingId: "booking-fixed",
      trainingMode: false,
    });
    resolveClaim({ claimed: 1 });
    await expect(resultPromise).resolves.toMatchObject({
      id: "booking-fixed",
      roomName: "Deluxe Suite",
    });
  });

  it("leaves an ambiguous Worker failure recoverable instead of compensating", async () => {
    compensationCalls.length = 0;
    claimBookingMarked.mockRejectedValueOnce(
      new Error("Booking availability could not be confirmed."),
    );

    await expect(createBooking({
      guestId: "guest-1",
      roomId: "room-1",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      paxCount: 1,
      paymentMethod: "GCash",
      trainingMode: "prod",
    })).rejects.toThrow("Booking availability could not be confirmed.");

    expect(transactionWrites.some(([ref]) =>
      ref.__doc === "booking_notification_jobs/booking-fixed",
    )).toBe(true);
    expect(compensationCalls).toEqual([]);
  });

  it("compensates a definitive marker conflict from the Worker", async () => {
    compensationCalls.length = 0;
    const conflict = Object.assign(
      new Error("Those dates were just taken by another guest."),
      { status: 409 },
    );
    claimBookingMarked.mockRejectedValueOnce(conflict);

    await expect(createBooking({
      guestId: "guest-1",
      roomId: "room-1",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      paxCount: 1,
      paymentMethod: "GCash",
      trainingMode: false,
    })).rejects.toThrow("Those dates were just taken by another guest.");

    expect(compensationCalls).toHaveLength(1);
    expect(compensationCalls[0][0]).toBe("updateDoc");
    expect(compensationCalls[0][2]).toMatchObject({
      status: "Cancelled",
      rejectionReason: "Dates taken by an earlier booking.",
    });
  });
});
