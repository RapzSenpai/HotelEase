import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: BookingTimeline } = await import("@/components/bookings/BookingTimeline");

let root = null;
let container = null;

async function renderTimeline(booking) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(BookingTimeline, { booking }));
  });
}

function dots() {
  return [...container.querySelectorAll("[data-state]")];
}

function dotByState(state) {
  return dots().filter((d) => d.dataset.state === state);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe("BookingTimeline", () => {
  it("renders the five real lifecycle stages with the active one marked", async () => {
    await renderTimeline({ status: "Pending" });

    const labels = ["Requested", "Payment", "Approved", "Checked In", "Completed"];
    for (const label of labels) {
      expect(container.textContent).toContain(label);
    }
    // Payment done, Front Office approval current, rest upcoming.
    expect(dotByState("done")).toHaveLength(2);
    expect(dotByState("current")).toHaveLength(1);
    expect(dotByState("upcoming")).toHaveLength(2);
    // The active stage carries aria-current for a11y.
    const current = container.querySelector('[aria-current="step"]');
    expect(current).toBeTruthy();
    expect(current.dataset.state).toBe("current");
    expect(container.textContent).toMatch(/front office/i);
  });

  it("shows no checked-in steps as current while a cancellation is under review", async () => {
    await renderTimeline({ status: "Cancellation Requested" });
    expect(dotByState("current")).toHaveLength(0);
    expect(dotByState("done")).toHaveLength(3);
    expect(container.textContent).toMatch(/cancellation requested/i);
  });

  it("renders a cancelled booking as Requested + red terminal node with the reason", async () => {
    await renderTimeline({
      status: "Cancelled",
      rejectionReason: "Room unavailable"});

    expect(dotByState("cancelled")).toHaveLength(1);
    expect(container.textContent).toContain("Cancelled");
    expect(container.textContent).toContain("Room unavailable");
    // No fake progress past the terminal node.
    expect(dotByState("current")).toHaveLength(0);
    expect(dotByState("upcoming")).toHaveLength(0);
    // Requested stays as history.
    expect(dotByState("done")).toHaveLength(1);
  });

  it("keeps a completed stay fully green with a closer note", async () => {
    await renderTimeline({ status: "Checked Out" });
    expect(dotByState("done")).toHaveLength(5);
    expect(dotByState("current")).toHaveLength(0);
    expect(container.textContent).toMatch(/thanks for staying/i);
  });
});
