import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const requests = [];
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
  where: vi.fn(),
}));
vi.mock("@/services/paymentsService", () => ({
  listPaymentsForBooking: vi.fn((bookingId) => new Promise((resolve, reject) => {
    requests.push({ bookingId, resolve, reject });
  })),
}));
vi.mock("@/services/bookingsService", () => ({
  BOOKINGS_PAGE_SIZE: 20,
  subscribeToBookingsPage: vi.fn(),
  countBookingsByStatus: vi.fn(),
  countBookingsPage: vi.fn(),
  approveBooking: vi.fn(),
  rejectBooking: vi.fn(),
  checkAndExpireStaleBookings: vi.fn(),
  getOverdueDays: vi.fn(),
}));
vi.mock("@/services/roomsService", () => ({ listRooms: vi.fn() }));
vi.mock("@/services/userService", () => ({ getUserDoc: vi.fn() }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => open ? children : null,
  DialogContent: ({ children }) => createElement("div", null, children),
  DialogHeader: ({ children }) => createElement("div", null, children),
  DialogTitle: ({ children }) => createElement("h2", null, children),
  DialogDescription: ({ children }) => createElement("p", null, children),
}));

const { BookingDetailsDialog } = await import("@/pages/fo/FoBookingsPage");

let root = null;
let container = null;

function booking(id) {
  return {
    id,
    status: "Approved",
    totalCost: 1000,
    paymentMethod: "GCash",
    checkInDate: new Date("2026-10-01"),
    checkOutDate: new Date("2026-10-02"),
  };
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
      onOpenChange: () => {},
      trainingMode: false,
    }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  requests.length = 0;
  vi.clearAllMocks();
});

describe("Front Office booking detail payment summary", () => {
  it("clears loaded totals when reopening lookup for the same booking fails", async () => {
    await render(booking("booking-a"));
    await act(async () => {
      requests[0].resolve([{ amount: 600 }]);
    });
    expect(container.textContent).toContain("PaidPHP 600.00");

    await render(booking("booking-a"), false);
    await render(booking("booking-a"));
    await act(async () => {
      requests[1].reject(new Error("payment history unavailable"));
    });

    expect(container.textContent).toContain("Paid…");
    expect(container.textContent).toContain("Balance…");
    expect(container.textContent).not.toContain("PHP 600.00");
  });

  it("ignores an old booking lookup that resolves after selection changes", async () => {
    await render(booking("booking-a"));
    await render(booking("booking-b"));
    await act(async () => {
      requests[0].resolve([{ amount: 600 }]);
    });

    expect(container.textContent).toContain("booking-b");
    expect(container.textContent).toContain("Paid…");
    expect(container.textContent).not.toContain("PHP 600.00");
  });
});
