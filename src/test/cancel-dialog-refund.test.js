import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

// React only runs act() when the environment opts in (testing-library does this
// for us normally; this file renders with the bare react-dom client).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The guest's cancel flow, rendered for real: an approved (paid) cancellation
// must explain the refund, and an unpaid one must not show that step at all.
const state = vi.hoisted(() => ({ payments: [] }));

vi.mock("@/services/bookingsService", () => ({
  cancelBooking: vi.fn(async () => ({ ok: true })),
  requestCancellation: vi.fn(async () => ({ ok: true }))}));
vi.mock("@/services/paymentsService", () => ({
  listPaymentsForBooking: async () => state.payments}));
vi.mock("@/services/userService", () => ({
  getUserDoc: async () => ({ cancellationCount: 0 })}));

const { default: CancelBookingDialog } = await import("@/components/bookings/CancelBookingDialog");

const BOOKING = {
  id: "book-1",
  guestId: "guest-1",
  status: "Approved",
  rateType: "Standard",
  nights: 2,
  baseTotal: 1994,
  totalCost: 1994,
  checkInDate: new Date("2026-12-01T00:00:00"),
  checkOutDate: new Date("2026-12-03T00:00:00"),
  cancellationDeadline: new Date("2026-11-30T00:00:00"),
  paymentMethod: "GCash"};

let root = null;
let container = null;

async function renderDialog(props) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(CancelBookingDialog, {
        open: true,
        onOpenChange: () => {},
        booking: BOOKING,
        room: { name: "Deluxe Suite" },
        status: "Approved",
        userProfile: { cancellationCount: 0 },
        ...props}));
  });
}

function setTextAreaValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function confirmCancel() {
  // Only an approved booking asks for a reason before confirming.
  const textarea = document.querySelector("#cancel-reason");
  if (textarea) {
    await act(async () => {
      setTextAreaValue(textarea, "Change of plans");
    });
  }
  const confirm = [...document.querySelectorAll("button")].find((b) =>
    /yes, cancel/i.test(b.textContent || ""));
  await act(async () => {
    confirm.click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  state.payments = [];
  vi.clearAllMocks();
});

describe("guest cancel dialog", () => {
  it("explains the expected refund when an approved, paid booking is cancelled", async () => {
    state.payments = [{ amount: 1994 }];
    const onOpenChange = vi.fn();
    await renderDialog({ onOpenChange });
    await confirmCancel();

    const body = document.body.textContent;
    expect(body).toContain("Refund if approved");
    expect(body).toContain("Cancellation submitted");
    expect(body).toContain("Front Office");
    // The cancellation itself is only *requested* here — the dialog must stay
    // open for the refund step rather than closing on the spot.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("closes with no refund step when nothing was paid", async () => {
    state.payments = [];
    const onOpenChange = vi.fn();
    await renderDialog({ onOpenChange });
    await confirmCancel();

    expect(document.body.textContent).not.toContain("Refund");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the final wording when the booking is cancelled outright", async () => {
    state.payments = [{ amount: 1994 }];
    await renderDialog({ status: "Pending", booking: { ...BOOKING, status: "Pending" } });
    await confirmCancel();

    const body = document.body.textContent;
    expect(body).toContain("Booking cancelled");
    expect(body).toContain("Refund due");
    expect(body).not.toContain("if approved");
  });
});
