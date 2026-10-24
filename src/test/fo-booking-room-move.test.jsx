import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Same shims as fo-booking-rate-adjust.test.jsx — the dialog lives in
// FoBookingsPage which needs these services mocked to import cleanly.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...path) => ({ path })),
  doc: vi.fn((_db, ...path) => ({ path, id: path.at(-1) })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn()}));
vi.mock("@/services/paymentsService", () => ({
  listPaymentsForBooking: vi.fn(async () => [])}));
vi.mock("@/services/bookingsService", () => ({
  BOOKINGS_PAGE_SIZE: 20,
  subscribeToBookingsPage: vi.fn(),
  countBookingsByStatus: vi.fn(),
  countBookingsPage: vi.fn(),
  approveBooking: vi.fn(),
  rejectBooking: vi.fn(),
  checkAndExpireStaleBookings: vi.fn(),
  getOverdueDays: vi.fn(),
  adjustBookingRate: vi.fn(async () => ({ ok: true })),
  moveBookingRoom: vi.fn(async () => ({ ok: true })),
  RATE_ADJUSTABLE_STATUSES: ["Pending", "Approved"]}));
vi.mock("@/services/roomsService", () => ({ listRooms: vi.fn() }));
vi.mock("@/services/userService", () => ({ getUserDoc: vi.fn() }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => open ? children : null,
  DialogContent: ({ children }) => createElement("div", null, children),
  DialogHeader: ({ children }) => createElement("div", null, children),
  DialogTitle: ({ children }) => createElement("h2", null, children),
  DialogDescription: ({ children }) => createElement("p", null, children)}));

const { BookingDetailsDialog } = await import("@/pages/fo/FoBookingsPage");
const { moveBookingRoom } = await import("@/services/bookingsService");

let root = null;
let container = null;

const ROOMS = {
  "r-1": { id: "r-1", name: "Deluxe 101", status: "Occupied", ratePerNight: 1000 },
  "r-2": { id: "r-2", name: "Suite 201", status: "Available", ratePerNight: 1500 },
  "r-3": { id: "r-3", name: "Cottage 1", status: "Available", ratePerNight: 800 }};

function booking(id, patch = {}) {
  return {
    id,
    status: "Checked In",
    roomId: "r-1",
    nights: 3,
    baseTotal: 3000,
    totalCost: 3000,
    paymentMethod: "GCash",
    checkInDate: new Date("2026-10-01"),
    checkOutDate: new Date("2026-10-02"),
    ...patch};
}

async function render(bookingData, open = true) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root.render(createElement(BookingDetailsDialog, {
      booking: bookingData,
      roomLabel: "Deluxe 101",
      guestName: "Guest",
      rooms: ROOMS,
      open,
      onOpenChange: () => {}}));
  });
}

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

function click(text) {
  const buttons = [...container.querySelectorAll("button")];
  const target = buttons.find((b) => b.textContent.includes(text));
  if (!target) throw new Error(`No button "${text}" among: ${buttons.map((b) => b.textContent).join(" | ")}`);
  return act(async () => { target.click(); });
}

beforeEach(() => { moveBookingRoom.mockClear(); });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("BookingDetailsDialog room move", () => {
  it("hides the move control for bookings that are not Checked In", async () => {
    await render(booking("bk-1", { status: "Approved" }));
    expect(container.textContent).not.toContain("Move room");
  });

  it("lists only other Available rooms in the move form", async () => {
    await render(booking("bk-1"));
    await click("Move room");

    const options = [...container.querySelectorAll("select option")]
      .map((o) => o.textContent);
    expect(options.some((t) => t.includes("Suite 201"))).toBe(true);
    expect(options.some((t) => t.includes("Cottage 1"))).toBe(true);
    expect(options.some((t) => t.includes("Deluxe 101"))).toBe(false);
  });

  it("shows the price-difference note for the chosen room", async () => {
    await render(booking("bk-1"));
    await click("Move room");

    const select = container.querySelector("select");
    setNativeValue(select, "r-2");
    expect(container.textContent).toContain("+PHP 500.00");
  });

  it("blocks submission without a room and without a reason, then submits through the service", async () => {
    await render(booking("bk-1"));
    await click("Move room");

    // No room chosen yet.
    await click("Move guest");
    expect(moveBookingRoom).not.toHaveBeenCalled();

    const select = container.querySelector("select");
    setNativeValue(select, "r-2");

    // Room picked, reason still blank.
    const textarea = container.querySelector("textarea");
    setNativeValue(textarea, "   ");
    await click("Move guest");
    expect(moveBookingRoom).not.toHaveBeenCalled();

    setNativeValue(textarea, "AC broken");
    await click("Move guest");
    expect(moveBookingRoom).toHaveBeenCalledWith(
      "bk-1",
      expect.objectContaining({ newRoomId: "r-2", reason: "AC broken" }));
  });

  it("renders the recorded move history with room names", async () => {
    await render(booking("bk-1", {
      roomMoves: [{
        fromRoomId: "r-1",
        toRoomId: "r-2",
        rateDelta: 500,
        reason: "AC broken",
        at: "2026-10-21T20:00:00.000Z",
        byEmail: "fo@hotelease.test"}]}));
    expect(container.textContent).toContain("Deluxe 101 → Suite 201");
    expect(container.textContent).toContain("AC broken");
    expect(container.textContent).toContain("+PHP 500.00");
  });
});
