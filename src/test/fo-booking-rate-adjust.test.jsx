import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
const { adjustBookingRate } = await import("@/services/bookingsService");

let root = null;
let container = null;

function booking(id, patch = {}) {
  return {
    id,
    status: "Approved",
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
      roomLabel: "Deluxe Suite",
      guestName: "Guest",
      open,
      onOpenChange: () => {}}));
  });
}

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function click(text) {
  const buttons = [...container.querySelectorAll("button")];
  const target = buttons.find((b) => b.textContent.includes(text));
  if (!target) throw new Error(`No button "${text}" among: ${buttons.map((b) => b.textContent).join(" | ")}`);
  return act(async () => { target.click(); });
}

beforeEach(() => { adjustBookingRate.mockClear(); });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("BookingDetailsDialog nightly rate", () => {
  it("shows the current nightly rate derived from baseTotal / nights", async () => {
    await render(booking("bk-1"));
    expect(container.textContent).toContain("PHP 1,000.00");
    expect(container.textContent).toContain("/ night");
  });

  it("shows the Adjust rate control only for Pending or Approved bookings", async () => {
    await render(booking("bk-1", { status: "Pending" }));
    expect(container.textContent).toContain("Adjust rate");

    await act(async () => { root.render(null); });
    container = null;
    root = null;
    await render(booking("bk-1", { status: "Checked In" }));
    expect(container.textContent).not.toContain("Adjust rate");
  });

  it("submits the new rate and required reason through the service", async () => {
    await render(booking("bk-1"));
    await click("Adjust rate");

    const inputs = [...container.querySelectorAll("input")];
    setNativeValue(inputs[0], "1200");
    const textarea = container.querySelector("textarea");
    setNativeValue(textarea, "Walk-in negotiated price");
    await click("Update rate");

    expect(adjustBookingRate).toHaveBeenCalledWith(
      "bk-1",
      expect.objectContaining({ newRatePerNight: 1200, reason: "Walk-in negotiated price" }));
  });

  it("blocks submission without a reason and without a rate", async () => {
    await render(booking("bk-1"));
    await click("Adjust rate");

    const textarea = container.querySelector("textarea");
    setNativeValue(textarea, "   ");
    await click("Update rate");
    expect(adjustBookingRate).not.toHaveBeenCalled();

    const inputs = [...container.querySelectorAll("input")];
    setNativeValue(inputs[0], "1200");
    await click("Update rate");
    expect(adjustBookingRate).not.toHaveBeenCalled();

    setNativeValue(textarea, "Corporate rate");
    await click("Update rate");
    expect(adjustBookingRate).toHaveBeenCalledTimes(1);
  });

  it("renders the recorded adjustment history", async () => {
    await render(booking("bk-1", {
      rateAdjustments: [{
        previousRatePerNight: 1000,
        newRatePerNight: 1200,
        reason: "Walk-in negotiated price",
        at: "2026-10-21T20:00:00.000Z",
        byEmail: "fo@hotelease.test"}]}));
    expect(container.textContent).toContain("PHP 1,000.00 → PHP 1,200.00");
    expect(container.textContent).toContain("Walk-in negotiated price");
    expect(container.textContent).toContain("fo@hotelease.test");
  });
});
