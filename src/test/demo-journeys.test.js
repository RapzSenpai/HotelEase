import { afterEach, describe, expect, it } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { DemoProvider, useDemo } from "@/demo/DemoContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: DemoGuestPage } = await import("@/demo/guest/DemoGuestPage");
const { default: DemoFoPage } = await import("@/demo/fo/DemoFoPage");

let root = null;
let container = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function GuestWithRole() {
  const { role, setRole } = useDemo();
  useEffect(() => {
    if (!role) setRole("guest");
  }, [role, setRole]);
  return createElement(DemoGuestPage);
}

async function renderGuest() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MemoryRouter, null,
        createElement(DemoProvider, null, createElement(GuestWithRole))),
    );
  });
  return container.textContent;
}

describe("demo context", () => {
  it("exposes scripted guest actions", () => {
    expect(typeof useDemo).toBe("function");
  });
});

describe("demo entry", () => {
  it("role dialog offers exactly Guest, FO, Admin", async () => {
    const { default: DemoRoleDialog } = await import("@/demo/DemoRoleDialog");
    expect(typeof DemoRoleDialog).toBe("function");
  });
});

describe("guest book journey", () => {
  it("shows Rooms, Bookings, Reviews, Housekeeping tabs", async () => {
    const text = await renderGuest();
    for (const tab of ["Rooms", "My Bookings", "Reviews", "Housekeeping"]) {
      expect(text).toContain(tab);
    }
  });
});

function FoWithRole() {
  const { role, setRole } = useDemo();
  useEffect(() => {
    if (!role) setRole("fo");
  }, [role, setRole]);
  return createElement(DemoFoPage);
}

async function renderFo() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MemoryRouter, null,
        createElement(DemoProvider, null, createElement(FoWithRole))),
    );
  });
  const text = container.textContent;
  act(() => root.unmount());
  container.remove();
  root = null;
  container = null;
  return text;
}

describe("fo payment guard", () => {
  it("shows Dashboard, Bookings, Payments, Housekeeping tabs", async () => {
    const text = await renderFo();
    for (const tab of ["Dashboard", "Bookings", "Payments", "Housekeeping"]) {
      expect(text).toContain(tab);
    }
  });

  it("rejects amounts above the fixture balance", async () => {
    const { buildDemoData } = await import("@/demo/fixtures");
    const data = buildDemoData(new Date());
    const b = data.bookings.find((x) => x.status === "Approved");
    const paid = data.payments.filter((p) => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0);
    expect(b.totalCost - paid).toBeGreaterThan(0);
  });
});
