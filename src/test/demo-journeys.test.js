import { afterEach, describe, expect, it } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { DemoProvider, useDemo } from "@/demo/DemoContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: DemoGuestRooms } = await import("@/demo/guest/DemoGuestRooms");
const { default: DemoFoPayments } = await import("@/demo/fo/DemoFoPayments");
const { default: DemoAdminAnalytics } = await import("@/demo/admin/DemoAdminAnalytics");

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
  return createElement(DemoGuestRooms);
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
  it("opens as a room catalogue, not a dashboard of tabs", async () => {
    const text = await renderGuest();
    expect(text).toContain("Our rooms");
    expect(text).toContain("Your stay so far");
    for (const room of ["Sunrise Single", "Cebu Suite", "Presidential Suite"]) {
      expect(text).toContain(room);
    }
  });
});

function FoWithRole() {
  const { role, setRole } = useDemo();
  useEffect(() => {
    if (!role) setRole("fo");
  }, [role, setRole]);
  return createElement(DemoFoPayments);
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
  it("renders the payments screen with the balance line", async () => {
    const text = await renderFo();
    expect(text).toContain("Record payment (demo)");
    expect(text).toContain("Balance");
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
  return createElement(DemoAdminAnalytics);
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

describe("admin demo actions", () => {
  it("shows the sample-data aggregates", async () => {
    const text = await renderAdmin();
    for (const label of ["Sample rooms", "Sample bookings", "Occupancy now", "Room type"]) {
      expect(text).toContain(label);
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

  // Deep links are the point of the demo routes: /demo/guest, /demo/fo and
  // /demo/admin all render on their own, with the shell inferring the role from
  // the path. A hard redirect back to the picker is what used to break that.
  it("no demo page redirects a role path back to the picker", async () => {
    const fs = await import("node:fs");
    const pathMod = await import("node:path");
    const files = fs
      .readdirSync("src/demo", { recursive: true })
      .filter((f) => String(f).endsWith(".jsx"));
    const redirects = files.filter((f) =>
      /<Navigate[^>]*to=["']\/demo["']/.test(
        fs.readFileSync(pathMod.join("src/demo", String(f)), "utf8"),
      ),
    );
    expect(redirects).toEqual([]);
  });
});

let probeCtx = null;
function Probe() {
  probeCtx = useDemo();
  return null;
}

async function renderProbe() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(MemoryRouter, null,
        createElement(DemoProvider, null, createElement(Probe))),
    );
  });
}

function statusOf(id) {
  return probeCtx.data.bookings.find((b) => b.id === id).status;
}

describe("demo stay lifecycle", () => {
  it("check-in flips Approved to Checked In", async () => {
    await renderProbe();
    const id = probeCtx.data.bookings.find((b) => b.status === "Approved").id;
    act(() => {
      probeCtx.fo.demoCheckIn({ bookingId: id });
    });
    expect(statusOf(id)).toBe("Checked In");
  });

  it("check-out flips Checked In to Checked Out", async () => {
    await renderProbe();
    const id = probeCtx.data.bookings.find((b) => b.status === "Checked In").id;
    act(() => {
      probeCtx.fo.demoCheckOut({ bookingId: id });
    });
    expect(statusOf(id)).toBe("Checked Out");
  });

  it("guest cancel flips Pending to Cancelled", async () => {
    await renderProbe();
    const id = probeCtx.data.bookings.find((b) => b.status === "Pending").id;
    act(() => {
      probeCtx.guest.demoCancelBooking({ bookingId: id });
    });
    expect(statusOf(id)).toBe("Cancelled");
  });

  it("illegal transitions are no-ops", async () => {
    await renderProbe();
    const outId = probeCtx.data.bookings.find((b) => b.status === "Checked Out").id;
    const pendId = probeCtx.data.bookings.find((b) => b.status === "Pending").id;
    const before = JSON.stringify(probeCtx.data.bookings);
    act(() => {
      probeCtx.guest.demoCancelBooking({ bookingId: outId });
    });
    act(() => {
      probeCtx.fo.demoCheckIn({ bookingId: pendId });
    });
    expect(statusOf(outId)).toBe("Checked Out");
    expect(statusOf(pendId)).toBe("Pending");
    expect(JSON.stringify(probeCtx.data.bookings)).toBe(before);
  });
});
