import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() },
}));

const { default: DemoGuestLayout } = await import("@/demo/guest/DemoGuestLayout");
const { default: DemoGuestRooms } = await import("@/demo/guest/DemoGuestRooms");
const { default: DemoGuestRoomDetail } = await import("@/demo/guest/DemoGuestRoomDetail");
const { default: DemoGuestBookings } = await import("@/demo/guest/DemoGuestBookings");
const { default: DemoGuestStay } = await import("@/demo/guest/DemoGuestStay");
const { DemoProvider } = await import("@/demo/DemoContext");
const { buildDemoData } = await import("@/demo/fixtures");
const { balanceOf, payableBookings, stayBooking } = await import("@/demo/guest/guestDemoData");
const { toast } = await import("sonner");

let root = null;
let container = null;
let lastPath = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  lastPath = null;
  vi.clearAllMocks();
});

function PathSpy() {
  lastPath = useLocation().pathname;
  return null;
}

/** Renders the real guest route tree so links and navigation are exercised. */
function renderGuest(entry = "/demo/guest") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(PathSpy),
        createElement(
          DemoProvider,
          null,
          createElement(
            Routes,
            null,
            createElement(
              Route,
              { path: "/", element: createElement("div", null, "home") },
            ),
            createElement(
              Route,
              { path: "/demo/guest", element: createElement(DemoGuestLayout) },
              createElement(Route, { index: true, element: createElement(DemoGuestRooms) }),
              createElement(Route, {
                path: "rooms/:roomId",
                element: createElement(DemoGuestRoomDetail),
              }),
              createElement(Route, { path: "bookings", element: createElement(DemoGuestBookings) }),
              createElement(Route, { path: "stay", element: createElement(DemoGuestStay) }),
            ),
          ),
        ),
      ),
    );
  });
  return container;
}

function click(el, text) {
  const node = [...el.querySelectorAll("button, a")].find(
    (n) => (n.textContent || "").includes(text) || n.getAttribute("aria-label") === text,
  );
  if (!node) throw new Error(`clickable not found: ${text}`);
  act(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  return node;
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  act(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("guest demo rooms", () => {
  it("is a room catalogue with images, prices and details", () => {
    const el = renderGuest();
    expect(el.textContent).not.toContain("Your simulated stay at HotelEase");
    expect(el.textContent).toContain("Our rooms");
    expect(el.textContent).toContain("Your stay so far");

    const data = buildDemoData(new Date());
    expect(el.querySelectorAll("img").length).toBeGreaterThanOrEqual(data.rooms.length);
    for (const room of data.rooms) {
      expect(el.textContent).toContain(room.name);
      expect(el.textContent).toContain(room.description.slice(0, 24));
    }
    for (const amenity of ["Free WiFi", "Air Conditioning"]) {
      expect(el.textContent).toContain(amenity);
    }
  });

  it("links every room into the demo detail route, never the live one", () => {
    const el = renderGuest();
    const hrefs = [...el.querySelectorAll("a")]
      .map((a) => a.getAttribute("href"))
      .filter((href) => href.includes("/rooms/"));
    const data = buildDemoData(new Date());
    for (const room of data.rooms) expect(hrefs).toContain(`/demo/guest/rooms/${room.id}`);
    for (const href of hrefs) expect(href.startsWith("/demo/guest/rooms/")).toBe(true);
    expect(el.textContent).not.toContain("No photo");
  });

  it("offers the guest bar with the demo sections and an exit", () => {
    const el = renderGuest();
    for (const label of ["Rooms", "My bookings", "Your stay", "Exit demo"]) {
      expect(el.textContent).toContain(label);
    }
    click(el, "Exit demo");
    expect(lastPath).toBe("/");
  });
});

describe("guest demo room detail", () => {
  it("shows the room, its amenities and a total that follows the nights", () => {
    const el = renderGuest("/demo/guest/rooms/demo-103");
    const room = buildDemoData(new Date()).rooms.find((r) => r.id === "demo-103");
    expect(el.textContent).toContain(room.name);
    expect(el.textContent).toContain("3,500");
    for (const amenity of room.amenities) expect(el.textContent).toContain(amenity);

    expect(el.textContent).toContain("PHP 7,000.00");
    click(el, "More nights");
    expect(el.textContent).toContain("PHP 10,500.00");
    expect(el.textContent).toContain("Book 3 nights (demo)");
  });

  it("books the chosen nights into my bookings", () => {
    const el = renderGuest("/demo/guest/rooms/demo-103");
    click(el, "More nights");
    click(el, "Book 3 nights (demo)");
    expect(lastPath).toBe("/demo/guest/bookings");
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain("Cebu Suite");
    expect(el.textContent).toContain("Pending");
    expect(el.textContent).toContain("PHP 10,500.00");
  });

  it("explains an unknown room instead of failing", () => {
    const el = renderGuest("/demo/guest/rooms/demo-999");
    expect(el.textContent).toContain("Room not in the sample data");
    click(el, "Back to the rooms");
    expect(lastPath).toBe("/demo/guest");
  });
});

describe("guest demo payment simulation", () => {
  it("opens pre-filled with the newest outstanding balance", () => {
    const el = renderGuest("/demo/guest/bookings");
    const data = buildDemoData(new Date());
    const first = payableBookings(data)[0];
    const input = el.querySelector('input[aria-label="Payment amount"]');
    expect(input.value).toBe(String(balanceOf(first, data.payments)));
  });

  it("rejects an amount over the balance and accepts a valid one", () => {
    const el = renderGuest("/demo/guest/bookings");
    const input = el.querySelector('input[aria-label="Payment amount"]');
    setInputValue(input, "999999");
    click(el, "Pay");
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();

    setInputValue(input, "500");
    click(el, "Pay");
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success.mock.calls[0][0]).toContain("PHP 500.00");
  });
});

describe("guest demo stay", () => {
  it("sends a mid-stay housekeeping request", () => {
    const el = renderGuest("/demo/guest/stay");
    const stay = stayBooking(buildDemoData(new Date()));
    expect(el.textContent).toContain("Checked In");
    click(el, "Send request (demo)");
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain("Leyte Suite");
    expect(stay).toBeTruthy();
  });

  it("submits a review for the completed stay", () => {
    const el = renderGuest("/demo/guest/stay");
    click(el, "Submit review (demo)");
    expect(toast.success.mock.calls[0][0]).toContain("review submitted");
  });
});
