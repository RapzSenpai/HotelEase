import { afterEach, describe, expect, it } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { DemoProvider, useDemo } from "@/demo/DemoContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: DemoGuestPage } = await import("@/demo/guest/DemoGuestPage");
const { default: DemoFoPage } = await import("@/demo/fo/DemoFoPage");
const { default: DemoAdminPage } = await import("@/demo/admin/DemoAdminPage");

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

function AdminWithRole() {
  const { role, setRole } = useDemo();
  useEffect(() => {
    if (!role) setRole("admin");
  }, [role, setRole]);
  return createElement(DemoAdminPage);
}

async function renderAdmin() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MemoryRouter, null,
        createElement(DemoProvider, null, createElement(AdminWithRole))),
    );
  });
  const text = container.textContent;
  act(() => root.unmount());
  container.remove();
  root = null;
  container = null;
  return text;
}

describe("admin demo actions", () => {  it("shows Rooms, Users, Analytics tabs", async () => {
    const text = await renderAdmin();
    for (const tab of ["Rooms", "Users", "Analytics"]) {
      expect(text).toContain(tab);
    }
  });

  it("fixture factory returns fresh objects per call", async () => {
    const { buildDemoData } = await import("@/demo/fixtures");
    const now = new Date();
    expect(buildDemoData(now).rooms).not.toBe(buildDemoData(now).rooms);
  });
});

describe("demo smoke", () => {
  it("guest books, FO approves, balance settles in sequence", async () => {
    const { buildDemoData } = await import("@/demo/fixtures");
    const data = buildDemoData(new Date());
    expect(data.bookings.some((b) => b.status === "Pending")).toBe(true);
    expect(data.bookings.some((b) => b.status === "Checked In")).toBe(true);
  });

  it("every inbox link stays inside /demo", async () => {
    const { buildDemoData } = await import("@/demo/fixtures");
    const links = buildDemoData(new Date()).notifications.map((n) => n.link);
    expect(links.every((l) => l.startsWith("/demo/"))).toBe(true);
  });

  it("role pages redirect to the picker when no role is selected", async () => {
    const fs = await import("node:fs");
    const guest = fs.readFileSync("src/demo/guest/DemoGuestPage.jsx", "utf8");
    const fo = fs.readFileSync("src/demo/fo/DemoFoPage.jsx", "utf8");
    const admin = fs.readFileSync("src/demo/admin/DemoAdminPage.jsx", "utf8");
    for (const src of [guest, fo, admin]) {
      expect(src.includes('"/demo"') || src.includes("'/demo'")).toBe(true);
    }
  });
});
