import { describe, expect, it, vi } from "vitest";

// The guest's "Verifying & Booking…" wait must end when the booking and its
// night markers are committed — not when the bell fan-out finishes.
const claimBookingMarked = vi.fn();
const claimBookingMarkedInTx = vi.fn();
const clearBookingMarked = vi.fn();
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
        __doc: `${collectionName}${id ? `/${id}` : ""}`};
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
        update: () => {}}),
    serverTimestamp: () => ({ __ts: true }),
    setDoc: async () => {},
    Timestamp: { fromDate: (d) => d },
    updateDoc: async (...args) => compensationCalls.push(["updateDoc", ...args]),
    where: () => ({})};
});

vi.mock("@/services/availabilityService", () => ({
  MARKER_CONFLICT_MESSAGE: "Those dates were just taken by another guest.",
  claimBookingMarked,
  claimBookingMarkedInTx,
  clearBookingMarked,
  getBlockedRoomIds: async () => new Set(),
  nightKeys: () => ["2026-10-01", "2026-10-02"]}));

vi.mock("@/services/userService", () => ({
  listFoUsers: async () => [{ id: "fo-1" }]}));

// Never settles: if createBooking still awaited the fan-out, the test hangs.
vi.mock("@/services/notificationService", () => ({
  createNotification: () => new Promise(() => {})}));

const { createBooking } = await import("@/services/booking/createBooking");

describe("createBooking submit path", () => {
  it("waits for the marker claim and returns the fixed booking ID", async () => {
    compensationCalls.length = 0;
    let resolveClaim;
    claimBookingMarked.mockImplementation(
      () => new Promise((resolve) => {
        resolveClaim = resolve;
      }));
    let settled = false;
    const resultPromise = createBooking({
      guestId: "guest-1",
      roomId: "room-1",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      paxCount: 1,
      paymentMethod: "GCash"}).then((result) => {
      settled = true;
      return result;
    });

    await vi.waitFor(() => expect(claimBookingMarked).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    const outboxWrite = transactionWrites.find(([ref]) =>
      ref.__doc === "booking_notification_jobs/booking-fixed");
    expect(outboxWrite?.[1]).toMatchObject({
      bookingId: "booking-fixed",
      guestId: "guest-1",
      status: "waiting_for_markers",
      markerDates: ["2026-10-01", "2026-10-02"]});
    expect(claimBookingMarked).toHaveBeenCalledTimes(1);
    expect(claimBookingMarked.mock.calls[0][0]).toEqual({
      bookingId: "booking-fixed"});
    resolveClaim({ claimed: 1 });
    await expect(resultPromise).resolves.toMatchObject({
      id: "booking-fixed",
      roomName: "Deluxe Suite"});
  });

  it("falls back to transactional marker claim when Worker fails, preserving booking", async () => {
    compensationCalls.length = 0;
    claimBookingMarkedInTx.mockClear();
    claimBookingMarked.mockRejectedValueOnce(
      new Error("Worker timeout or network error"));

    const res = await createBooking({
      guestId: "guest-1",
      roomId: "room-1",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      paxCount: 1,
      paymentMethod: "GCash"});

    expect(res).toMatchObject({
      id: "booking-fixed",
      roomName: "Deluxe Suite",
      status: "Awaiting Payment"});
    expect(claimBookingMarkedInTx).toHaveBeenCalledTimes(1);
    expect(claimBookingMarkedInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        roomId: "room-1",
        bookingId: "booking-fixed",
        status: "Awaiting Payment"}));
    expect(compensationCalls).toEqual([]);
  });

  it("compensates, clears markers, and cancels booking when both Worker and fallback marker claim fail", async () => {
    compensationCalls.length = 0;
    clearBookingMarked.mockClear();
    claimBookingMarkedInTx.mockClear();
    claimBookingMarked.mockRejectedValueOnce(
      new Error("Worker unavailable"));
    claimBookingMarkedInTx.mockRejectedValueOnce(
      new Error("Firestore transaction failed"));

    await expect(createBooking({
      guestId: "guest-1",
      roomId: "room-1",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      paxCount: 1,
      paymentMethod: "GCash"})).rejects.toThrow("Firestore transaction failed");

    expect(clearBookingMarked).toHaveBeenCalledTimes(1);
    expect(clearBookingMarked).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      bookingId: "booking-fixed",
      dates: ["2026-10-01", "2026-10-02"]}));
    expect(compensationCalls).toHaveLength(1);
    expect(compensationCalls[0][0]).toBe("updateDoc");
    expect(compensationCalls[0][2]).toMatchObject({
      status: "Cancelled",
      rejectionReason: "Availability claim failed."});
  });

  it("compensates and clears markers on a definitive conflict during fallback claim", async () => {
    compensationCalls.length = 0;
    clearBookingMarked.mockClear();
    claimBookingMarkedInTx.mockClear();
    claimBookingMarked.mockRejectedValueOnce(
      new Error("Worker unavailable"));
    claimBookingMarkedInTx.mockRejectedValueOnce(
      new Error("Those dates were just taken by another guest."));

    await expect(createBooking({
      guestId: "guest-1",
      roomId: "room-1",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      paxCount: 1,
      paymentMethod: "GCash"})).rejects.toThrow("Those dates were just taken by another guest.");

    expect(clearBookingMarked).toHaveBeenCalledTimes(1);
    expect(compensationCalls).toHaveLength(1);
    expect(compensationCalls[0][2]).toMatchObject({
      status: "Cancelled",
      rejectionReason: "Dates taken by an earlier booking."});
  });

  it("compensates a definitive marker conflict from the Worker and clears markers", async () => {
    compensationCalls.length = 0;
    clearBookingMarked.mockClear();
    const conflict = Object.assign(
      new Error("Those dates were just taken by another guest."),
      { status: 409 });
    claimBookingMarked.mockRejectedValueOnce(conflict);

    await expect(createBooking({
      guestId: "guest-1",
      roomId: "room-1",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      paxCount: 1,
      paymentMethod: "GCash"})).rejects.toThrow("Those dates were just taken by another guest.");

    expect(clearBookingMarked).toHaveBeenCalledTimes(1);
    expect(clearBookingMarked).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      bookingId: "booking-fixed",
      dates: ["2026-10-01", "2026-10-02"]}));
    expect(compensationCalls).toHaveLength(1);
    expect(compensationCalls[0][0]).toBe("updateDoc");
    expect(compensationCalls[0][2]).toMatchObject({
      status: "Cancelled",
      rejectionReason: "Dates taken by an earlier booking."});
  });
});
