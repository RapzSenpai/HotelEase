import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: DemoRoomCard } = await import("@/demo/DemoRoomCard");
const { default: DemoBookingCard } = await import("@/demo/DemoBookingCard");
const { buildDemoData } = await import("@/demo/fixtures");

let root = null;
let container = null;

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
