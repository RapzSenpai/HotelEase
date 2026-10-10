import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn() },
}));

const { default: DemoAdminAnalytics } = await import("@/demo/admin/DemoAdminAnalytics");
const { default: DemoAdminOperations } = await import("@/demo/admin/DemoAdminOperations");
const { default: DemoAdminUsers } = await import("@/demo/admin/DemoAdminUsers");
const { DemoProvider } = await import("@/demo/DemoContext");
const { buildDemoData } = await import("@/demo/fixtures");
const { SECTION_CONFIG_PATHS, STAFF_SECTIONS, sectionElement } = await import("@/demo/routes");
const { default: DemoSidebar } = await import("@/demo/DemoSidebar");
const { revenueByRoomType } = await import("@/demo/admin/adminDemoData");
const { toast } = await import("sonner");

let root = null;
let container = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(element, path = "/demo/admin") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(DemoProvider, null, element),
      ),
    );
  });
  return container;
}

// Lazy section pages resolve asynchronously; poll until the module lands.
async function renderAsync(element, path = "/demo/admin") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(DemoProvider, null, element),
      ),
    );
  });
  const deadline = Date.now() + 3000;
  while (!container.textContent && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return container;
}

function click(el, text, tag = "button") {
  const node = [...el.querySelectorAll(tag)].find((n) => (n.textContent || "").includes(text));
  if (!node) throw new Error(`${tag} not found: ${text}`);
  act(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return node;
}

function rowTexts(el) {
  return [...el.querySelectorAll("tbody tr")].map((tr) => tr.textContent || "");
}

describe("admin analytics section", () => {
  it("renders the sample aggregates and the room-type breakdown", () => {
    const el = render(createElement(DemoAdminAnalytics));
    for (const label of [
      "Sample rooms",
      "Sample bookings",
      "Collected (sample)",
      "Outstanding (sample)",
      "Occupancy now",
      "Open alerts",
      "Testimonials awaiting review",
      "Room type",
    ]) {
      expect(el.textContent).toContain(label);
    }
    expect(rowTexts(el).length).toBe(revenueByRoomType(buildDemoData(new Date())).length);
  });
});

describe("admin operations section", () => {
  it("applies a bulk status to the selected rooms in memory", () => {
    const el = render(createElement(DemoAdminOperations));
    const before = (el.textContent.match(/Reserved/g) || []).length;
    expect(el.textContent).toContain("Sunrise Single");
    act(() => {
      el.querySelector('button[aria-label="Select Sunrise Single"]').dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      el.querySelector('button[aria-label="Select Cebu Suite"]').dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    click(el, "Reserved");
    toast.success.mockClear();
    click(el, "Apply to 2 room(s)");
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success.mock.calls[0][0]).toContain("2 room(s) set to Reserved");
    expect((el.textContent.match(/Reserved/g) || []).length).toBe(before + 2);
  });

  it("refuses to apply with nothing selected", () => {
    const el = render(createElement(DemoAdminOperations));
    toast.error.mockClear();
    click(el, "Apply to 0 room(s)");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("disables the exports with the demo notice", () => {
    const el = render(createElement(DemoAdminOperations));
    toast.info.mockClear();
    click(el, "Export rooms CSV");
    expect(toast.info).toHaveBeenCalledWith("Demo — nothing was saved.");
  });
});

describe("admin users section", () => {
  it("switches a sample account's role in memory", () => {
    const el = render(createElement(DemoAdminUsers));
    const row = [...el.querySelectorAll("div.rounded-xl")].find((card) =>
      (card.textContent || "").includes("Cynthia Abell"),
    );
    expect(row).toBeTruthy();
    const adminBtn = [...row.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "admin",
    );
    expect(adminBtn.getAttribute("aria-pressed")).toBe("false");
    toast.success.mockClear();
    act(() => {
      adminBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(adminBtn.getAttribute("aria-pressed")).toBe("true");
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});

describe("admin view-only sections", () => {
  const cases = [
    ["/admin/messages", "Messages", "Late check-in tonight"],
    ["/admin/testimonials", "Testimonials", "Spotless room and a very helpful front desk."],
    ["/admin/alerts", "Alerts", "Payment proof awaiting review"],
    ["/admin/health", "System Health", "Image uploads"],
    ["/admin/performance", "Performance", "Room schedule render"],
    ["/admin/availability", "Availability", "Presidential Suite"],
    ["/admin/audit-logs", "Audit Logs", "Edwin Marquez"],
    ["/admin/settings", "System Settings", "Cancellation window"],
  ];

  for (const [prodPath, label, expected] of cases) {
    it(`${prodPath} renders its header and fixture rows`, () => {
      const el = render(sectionElement({ prodPath, label, role: "admin" }));
      expect(el.textContent).toContain(label);
      expect(el.textContent).toContain("Try Demo");
      expect(rowTexts(el).length).toBeGreaterThan(0);
      expect(el.textContent).toContain(expected);
      expect(el.querySelectorAll("input, textarea")).toHaveLength(0);
    });
  }

  it("routes every configured admin section with no placeholder left", async () => {
    const routed = new Set(STAFF_SECTIONS.filter((s) => s.role === "admin").map((s) => s.prodPath));
    const orphans = SECTION_CONFIG_PATHS.filter(
      (p) => p.startsWith("/admin") && !routed.has(p),
    );
    expect(orphans).toEqual([]);
    for (const prodPath of routed) {
      const el = await renderAsync(sectionElement({ prodPath, label: "x", role: "admin" }));
      expect(el.textContent, `${prodPath} rendered nothing`).not.toBe("");
      expect(el.textContent).not.toContain("being wired up next");
    }
  });
});

describe("admin sections stay inside the demo tree", () => {
  it("badges the admin counters from fixtures, not from services", () => {
    const el = render(createElement(DemoSidebar, { role: "admin" }), "/demo/admin");
    const counts = [...el.querySelectorAll("span.rounded-full")]
      .map((s) => s.textContent)
      .filter(Boolean);
    // Unresolved alerts (2) and testimonials awaiting review (1), on both the
    // desktop sidebar and the mobile strip.
    expect(new Set(counts)).toEqual(new Set(["2", "1"]));
    for (const href of [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"))) {
      expect(href.startsWith("/demo")).toBe(true);
    }
  });
});
