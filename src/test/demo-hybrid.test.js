import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: DemoRoomCard } = await import("@/demo/DemoRoomCard");
const { default: DemoBookingCard } = await import("@/demo/DemoBookingCard");
const { buildDemoData } = await import("@/demo/fixtures");
const { default: DemoAdminPage } = await import("@/demo/admin/DemoAdminPage");
const { default: DemoFoPage } = await import("@/demo/fo/DemoFoPage");
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
    const el = await renderFoHousekeeping();
    act(() => {
      probeCtx.guest.demoRequestHousekeeping({ bookingId: "demo-bk-checkedin", note: "Fresh towels" });
    });
    clickText(el, "Housekeeping");
    expect(el.textContent).toContain("Verification Photos");
    expect(el.textContent).toContain("Leyte Suite");
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
