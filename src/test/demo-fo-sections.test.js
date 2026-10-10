import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() },
}));
vi.mock("@/services/bookingsService", () => ({
  subscribeToBookingsPage: vi.fn(() => () => {}),
  getOverdueDays: () => 0,
}));

const { default: DemoFoDashboard } = await import("@/demo/fo/DemoFoDashboard");
const { default: DemoFoBookings } = await import("@/demo/fo/DemoFoBookings");
const { default: DemoFoCheckIn } = await import("@/demo/fo/DemoFoCheckIn");
const { default: DemoFoCheckOut } = await import("@/demo/fo/DemoFoCheckOut");
const { default: DemoFoPayments } = await import("@/demo/fo/DemoFoPayments");
const { DemoProvider } = await import("@/demo/DemoContext");
const { buildDemoData } = await import("@/demo/fixtures");
const { balanceOf } = await import("@/demo/fo/foDemoData");
const { SECTION_CONFIG_PATHS, STAFF_SECTIONS, sectionElement } = await import("@/demo/routes");
const { default: DemoSidebar } = await import("@/demo/DemoSidebar");
const { toast } = await import("sonner");

let root = null;
let container = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/demo/fo"] },
        createElement(DemoProvider, null, element),
      ),
    );
  });
  return container;
}

// Lazy section pages resolve asynchronously; direct imports do not.
async function renderAsync(element) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/demo/fo"] },
        createElement(DemoProvider, null, element),
      ),
    );
  });
  // Lazy section imports land after the first paint; poll until the module
  // graph is transformed and rendered (the housekeeping page pulls the biggest
  // subtree), with a hard deadline so a real failure still fails.
  const deadline = Date.now() + 3000;
  while (!container.textContent && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return container;
}

function click(el, text) {
  const btn = [...el.querySelectorAll("button")].find((b) =>
    (b.textContent || "").includes(text),
  );
  if (!btn) throw new Error(`button not found: ${text}`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return btn;
}

function rowTexts(el) {
  return [...el.querySelectorAll("tbody tr")].map((tr) => tr.textContent || "");
}

describe("FO demo dashboard", () => {
  it("renders the four metrics without a picked role", () => {
    const el = render(createElement(DemoFoDashboard));
    for (const label of [
      "Available rooms",
      "Pending bookings",
      "Checked in",
      "Rooms needing cleaning",
    ]) {
      expect(el.textContent).toContain(label);
    }
  });
});

describe("FO demo bookings", () => {
  it("lists every fixture booking in the table", () => {
    const el = render(createElement(DemoFoBookings));
    const data = buildDemoData(new Date());
    expect(rowTexts(el).length).toBe(data.bookings.length);
    expect(el.textContent).toContain("Cebu Suite");
  });

  it("approving a pending booking flips its status", async () => {
    const el = render(createElement(DemoFoBookings));
    const pendingRoom = el.textContent.includes("Cebu Suite");
    expect(pendingRoom).toBe(true);
    click(el, "Approve (demo)");
    const row = rowTexts(el).find((r) => r.includes("Cebu Suite"));
    expect(row).toContain("Approved");
  });
});

describe("FO demo check-in", () => {
  it("checks an approved arrival in", () => {
    const el = render(createElement(DemoFoCheckIn));
    expect(rowTexts(el).length).toBe(0);
    expect(el.textContent).toContain("Presidential Suite");
    click(el, "Check in (demo)");
    expect(el.textContent).toContain("No approved arrivals in the sample data.");
  });
});

describe("FO demo check-out", () => {
  it("blocks check-out while the balance is unpaid", () => {
    const el = render(createElement(DemoFoCheckOut));
    const data = buildDemoData(new Date());
    const inHouse = data.bookings.find((b) => b.status === "Checked In");
    expect(balanceOf(inHouse, data.payments)).toBeGreaterThan(0);
    toast.error.mockClear();
    click(el, "Check out (demo)");
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain("Balance due");
  });
});

describe("FO demo payments", () => {
  it("opens with the amount prefilled to the outstanding balance", () => {
    const el = render(createElement(DemoFoPayments));
    const data = buildDemoData(new Date());
    const first = data.bookings.find(
      (b) => b.status === "Approved" || b.status === "Checked In",
    );
    const input = el.querySelector('input[aria-label="Payment amount"]');
    expect(input.value).toBe(String(balanceOf(first, data.payments) || ""));
  });

  it("records a valid payment and grows the history", () => {
    const el = render(createElement(DemoFoPayments));
    const before = rowTexts(el).length;
    click(el, "Record (demo)");
    expect(rowTexts(el).length).toBe(before + 1);
  });
});

describe("FO view-only sections", () => {
  // Only sections that exist in the nav-derived route table are listed here.
  const cases = [
    ["/fo/cancellations", "Cancellations & Refunds", "Sunrise Single", "Pending"],
    ["/fo/announcements", "Announcements", "Pool maintenance on Saturday", "Edwin Marquez"],
    ["/fo/messages", "Messages", "Late check-in tonight", "unread"],
  ];

  for (const [prodPath, label, ...expected] of cases) {
    it(`${prodPath} renders its header and fixture rows`, () => {
      const el = render(sectionElement({ prodPath, label, role: "fo" }));
      expect(el.textContent).toContain(label);
      expect(el.textContent).toContain("Try Demo");
      expect(rowTexts(el).length).toBeGreaterThan(0);
      for (const text of expected) expect(el.textContent).toContain(text);
      expect(el.querySelectorAll("input, textarea")).toHaveLength(0);
    });
  }
});

describe("demo section config", () => {
  it("has no config for a path the nav table does not route", () => {
    const routed = new Set(STAFF_SECTIONS.map((s) => s.prodPath));
    const orphans = SECTION_CONFIG_PATHS.filter((p) => !routed.has(p));
    expect(orphans).toEqual([]);
  });

  it("every configured section resolves to something renderable", async () => {
    for (const prodPath of SECTION_CONFIG_PATHS) {
      const section = STAFF_SECTIONS.find((s) => s.prodPath === prodPath);
      expect(section, `${prodPath} missing from the nav table`).toBeTruthy();
      const el = await renderAsync(sectionElement(section));
      expect(el.textContent).toContain(section.label);
      expect(el.textContent).not.toContain("Page Not Found");
    }
  });
});

describe("FO sections stay inside the demo tree", () => {
  it("sidebar for the FO role links only to demo routes", () => {
    const el = render(createElement(DemoSidebar, { role: "fo" }));
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href.startsWith("/demo")).toBe(true);
  });
});
