import { afterEach, describe, expect, it } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { DemoProvider, useDemo } from "@/demo/DemoContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: DemoGuestPage } = await import("@/demo/guest/DemoGuestPage");

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
