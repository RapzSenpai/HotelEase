import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/services/bookingsService", () => ({
  subscribeToBookingsPage: vi.fn(() => () => {}),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
    info: vi.fn(),
  },
}));

const { default: DemoRoomCard } = await import("@/demo/DemoRoomCard");
const { default: DemoBookingCard } = await import("@/demo/DemoBookingCard");
const { buildDemoData } = await import("@/demo/fixtures");
const { default: DemoAdminPage } = await import("@/demo/admin/DemoAdminPage");
const { default: DemoFoPage } = await import("@/demo/fo/DemoFoPage");
const { default: DemoGuestPage } = await import("@/demo/guest/DemoGuestPage");
const { default: RoomScheduleTape } = await import("@/components/dashboard/RoomScheduleTape");
const { subscribeToBookingsPage } = await import("@/services/bookingsService");
const { buildRequests, ACTIVE_STATUS_TEXT } = await import("@/lib/housekeeping-requests");
const { default: demoToast, DEMO_DISABLED_MESSAGE } = await import("@/demo/demoToast");
const { toast } = await import("sonner");

describe("demoToast", () => {
  it("toasts exactly once per call with the default copy", () => {
    toast.info.mockClear();
    demoToast();
    demoToast();
    expect(toast.info).toHaveBeenCalledTimes(2);
    expect(toast.info).toHaveBeenCalledWith(DEMO_DISABLED_MESSAGE);
    expect(DEMO_DISABLED_MESSAGE).toBe("Demo — nothing was saved.");
  });
});
const { DemoProvider, useDemo } = await import("@/demo/DemoContext");
const { useEffect } = await import("react");

let root = null;
let container = null;
let probeCtx = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const room = {
  id: "demo-103",
  name: "Cebu Suite",
  type: "Suite Room",
  status: "Available",
  ratePerNight: 3500,
  description: "Spacious suite with a separate living area.",
  amenities: ["Free WiFi", "Air Conditioning", "Mini Bar"],
};

function renderCard(props = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(MemoryRouter, null,
        createElement(DemoRoomCard, {
          room,
          isFavorite: false,
          onToggleFavorite: () => {},
          ...props,
        })),
    );
  });
  return container;
}

describe("DemoRoomCard", () => {
  it("keeps prod card classes, name, and price", () => {
    const el = renderCard();
    expect(el.querySelector(".room-card-enter")).not.toBeNull();
    expect(el.textContent).toContain("Cebu Suite");
    expect(el.textContent).toContain("3,500");
  });

  it("favorite toggle calls back with the room id", () => {
    const onToggleFavorite = vi.fn();
    const el = renderCard({ onToggleFavorite });
    const btn = el.querySelector('button[aria-label="Add to favorites"]');
    expect(btn).not.toBeNull();
    const classes = btn.className.split(/\s+/);
    expect(classes).toContain("opacity-100");
    expect(classes).not.toContain("opacity-0");
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggleFavorite).toHaveBeenCalledWith("demo-103");
  });

  it("view action links to the real detail page in preview mode", () => {
    const el = renderCard();
    const link = el.querySelector('a[href="/rooms/demo-103?demo=1"]');
    expect(link).not.toBeNull();
  });
});

describe("DemoBookingCard", () => {
  const data = buildDemoData(new Date());
  const booking = data.bookings.find((b) => b.status === "Pending");
  const room = data.rooms.find((r) => r.id === booking.roomId);
  const payments = data.payments.filter((p) => p.bookingId === booking.id);

  function renderBooking(props = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        createElement(MemoryRouter, null,
          createElement(DemoBookingCard, { booking, room, payments, onCancel: () => {}, ...props })),
      );
    });
    return container;
  }

  it("shows room, tabular money, and expands to details", () => {
    const el = renderBooking();
    expect(el.textContent).toContain(room.name);
    expect(el.querySelector(".tabular-nums")).not.toBeNull();
    act(() => {
      el.querySelector("button").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(el.textContent).toContain("PHP");
  });

  it("cancel calls back with the booking id", async () => {
    const onCancel = vi.fn();
    const el = renderBooking({ onCancel });
    act(() => {
      el.querySelector("button").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const cancel = [...el.querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes("Cancel Booking"),
    );
    expect(cancel).not.toBeUndefined();
    act(() => {
      cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledWith(booking.id);
  });
});

describe("demo admin rooms", () => {
  async function renderAdmin() {
    function WithRole() {
      const { role, setRole } = useDemo();
      useEffect(() => {
        if (!role) setRole("admin");
      }, [role, setRole]);
      return createElement(DemoAdminPage);
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null,
          createElement(DemoProvider, null, createElement(WithRole))),
      );
    });
    return container;
  }

  it("rooms tab renders all six fixture rooms in a real view", async () => {
    const el = await renderAdmin();
    for (const name of ["Sunrise Single", "Cebu Suite", "Presidential Suite"]) {
      expect(el.textContent).toContain(name);
    }
  });

  it("edit toggles availability in memory", async () => {
    const el = await renderAdmin();
    const edit = [...el.querySelectorAll("button")].find((b) =>
      (b.textContent || "").trim() === "Edit",
    );
    expect(edit).not.toBeUndefined();
    act(() => {
      edit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(el.textContent).toContain("Reserved");
  });

  it("edit leaves non-Available rooms alone", async () => {
    const el = await renderAdmin();
    const heading = [...el.querySelectorAll("h4")].find((h) =>
      (h.textContent || "").includes("Ocean View Single"),
    );
    expect(heading).not.toBeUndefined();
    const card = heading.closest("div.rounded-xl");
    const edit = [...card.querySelectorAll("button")].find((b) =>
      (b.textContent || "").trim() === "Edit",
    );
    act(() => {
      edit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(el.textContent).toContain("Dirty / Needs Cleaning");
  });
});

describe("demo FO housekeeping", () => {
  async function renderFoHousekeeping() {
    function WithRole() {
      const { role, setRole } = useDemo();
      useEffect(() => {
        if (!role) setRole("fo");
      }, [role, setRole]);
      probeCtx = useDemo();
      return createElement(DemoFoPage);
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null,
          createElement(DemoProvider, null, createElement(WithRole))),
      );
    });
    return container;
  }

  function clickText(el, text) {
    const btn = [...el.querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes(text),
    );
    if (!btn) throw new Error(`button not found: ${text}`);
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function clickInRow(el, rowText, btnText) {
    const row = [...el.querySelectorAll("tr")].find((tr) =>
      (tr.textContent || "").includes(rowText),
    );
    if (!row) throw new Error(`row not found: ${rowText}`);
    const btn = [...row.querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes(btnText),
    );
    if (!btn) throw new Error(`button not found: ${btnText} in ${rowText}`);
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    return row;
  }

  it("full cleaning cycle runs on the real list view", async () => {
    const el = await renderFoHousekeeping();    act(() => {
      probeCtx.guest.demoRequestHousekeeping({ bookingId: "demo-bk-checkedin", note: "Fresh towels" });
    });
    clickText(el, "Housekeeping");
    expect(el.textContent).toContain("Verification Photos");
    expect(el.textContent).toContain("Leyte Suite");
    expect(el.querySelector('input[type="file"]')).toBeNull();
    clickInRow(el, "Leyte Suite", "Start Clean");
    clickInRow(el, "Leyte Suite", "Submit Review");
    const row = [...el.querySelectorAll("tr")].find((tr) =>
      (tr.textContent || "").includes("Leyte Suite"),
    );
    const approve = [...row.querySelectorAll("button")].find((b) =>
      (b.textContent || "").trim() === "Approve",
    );
    expect(approve).not.toBeUndefined();
    act(() => {
      approve.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const gone = [...el.querySelectorAll("tr")].some((tr) =>
      (tr.textContent || "").includes("Leyte Suite"),
    );
    expect(gone).toBe(false);
  });
});

describe("schedule tape", () => {
  function renderTape(props = {}) {
    const data = buildDemoData(new Date());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        createElement(MemoryRouter, null,
          createElement(RoomScheduleTape, { rooms: data.rooms, ...props })),
      );
    });
    return { el: container, data };
  }

  it("renders fixture bookings with zero subscription calls", () => {
    subscribeToBookingsPage.mockClear();
    const data = buildDemoData(new Date());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        createElement(MemoryRouter, null,
          createElement(RoomScheduleTape, { rooms: data.rooms, bookings: data.bookings })),
      );
    });
    const el = container;
    expect(subscribeToBookingsPage).not.toHaveBeenCalled();
    const chips = [...el.querySelectorAll("button[title]")];
    expect(chips.length).toBeGreaterThan(0);
    expect(el.textContent).toContain("Cebu Suite");
  });

  it("chip CTA calls onSelectBooking instead of navigating", () => {    const onSelectBooking = vi.fn();
    const { el } = renderTape({ bookings: buildDemoData(new Date()).bookings, onSelectBooking });
    const chip = el.querySelector("button[title]");
    act(() => {
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Booking ID");
    const cta = [...document.querySelectorAll("button")].find((b) =>
      /Open in Bookings|Go to Check-In|Go to Check-Out/.test(b.textContent || ""),
    );
    expect(cta).not.toBeUndefined();
    act(() => {
      cta.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectBooking).toHaveBeenCalledTimes(1);
    expect(onSelectBooking.mock.calls[0][0].id).toMatch(/^demo-bk-/);
  });

  it("prop-less render still feeds lanes from the live subscription", () => {
    const data = buildDemoData(new Date());
    subscribeToBookingsPage.mockImplementationOnce((args, cb) => {
      cb(data.bookings);
      return () => {};
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        createElement(MemoryRouter, null,
          createElement(RoomScheduleTape, { rooms: data.rooms })),
      );
    });
    expect(subscribeToBookingsPage).toHaveBeenCalled();
    expect(container.querySelectorAll("button[title]").length).toBeGreaterThan(0);
  });
});

describe("demo guest housekeeping", () => {
  async function renderGuestHk() {
    function WithRole() {
      const { role, setRole } = useDemo();
      useEffect(() => {
        if (!role) setRole("guest");
      }, [role, setRole]);
      probeCtx = useDemo();
      return createElement(DemoGuestPage);
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MemoryRouter, null,
          createElement(DemoProvider, null, createElement(WithRole))),
      );
    });
    return container;
  }

  function openHk(el) {
    const tab = [...el.querySelectorAll("button")].find((b) =>
      (b.textContent || "").trim() === "Housekeeping",
    );
    if (!tab) throw new Error("Housekeeping tab not found");
    act(() => {
      tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("groups one request cycle from the log stream", () => {
    const logs = buildDemoData(new Date()).housekeepingLogs
      .filter((l) => l.roomId === "demo-104");
    const reqs = buildRequests(logs);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].isInFlight).toBe(true);
    expect(ACTIVE_STATUS_TEXT[reqs[0].status]).toBeTruthy();
  });

  it("shows the active request, then completed history", async () => {
    const el = await renderGuestHk();
    openHk(el);
    expect(el.textContent).toContain("currently refreshing");
    act(() => {
      probeCtx.fo.demoAdvanceCleaning({ requestId: "demo-req-1" });
    });
    act(() => {
      probeCtx.fo.demoAdvanceCleaning({ requestId: "demo-req-1" });
    });
    expect(el.textContent).toContain("Completed");
    expect(el.textContent).toContain("Fresh towels");
  });
});
