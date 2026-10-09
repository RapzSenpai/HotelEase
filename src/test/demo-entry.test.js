import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, role: null, profile: null, loading: false }),
}));
vi.mock("@/components/chatbot/ChatbotWidget", () => ({
  default: () => null,
}));
vi.mock("@/services/announcementsService", () => ({
  listAnnouncements: async () => [],
}));
vi.mock("@/services/roomsService", () => ({
  listRooms: async () => [],
  subscribeToRooms: () => () => {},
}));
vi.mock("@/services/reviewsService", () => ({
  listReviewsForRoom: async () => [],
}));
vi.mock("@/services/testimonialsService", () => ({
  subscribeToApprovedTestimonials: () => () => {},
  createTestimonial: async () => ({}),
}));

const { default: LandingPage } = await import("@/pages/public/LandingPage");
const { DemoIndex } = await import("@/demo/DemoRoleDialog");
const { DemoProvider } = await import("@/demo/DemoContext");

let root = null;
let container = null;
let lastPath = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
  lastPath = null;
  vi.clearAllMocks();
});

function PathSpy() {
  const location = useLocation();
  lastPath = location.pathname;
  return null;
}

function clickText(text) {
  const el = [...document.querySelectorAll("button")].find((b) =>
    (b.textContent || "").includes(text),
  );
  if (!el) throw new Error(`button not found: ${text}`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("demo entry", () => {
  it("landing Try Demo lands on the single role picker", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MemoryRouter, { initialEntries: ["/"] },
          createElement(PathSpy),
          createElement(LandingPage)),
      );
    });
    clickText("Try Demo");
    clickText("Guest");
    expect(lastPath).toBe("/demo");
  });

  it("closing the /demo picker returns home instead of stranding", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MemoryRouter, { initialEntries: ["/demo"] },
          createElement(PathSpy),
          createElement(Routes, null,
            createElement(Route, {
              path: "/demo",
              element: createElement(DemoProvider, null, createElement(DemoIndex)),
            }),
            createElement(Route, { path: "/", element: createElement("div", null, "home") }),
          )),
      );
    });
    const close = document.querySelector('button[aria-label="Close"], button:has(.sr-only)');
    const closer = [...document.querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes("Close") || b.getAttribute("aria-label") === "Close",
    );
    if (!closer && !close) throw new Error("close button not found");
    act(() => {
      (closer || close).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(lastPath).toBe("/");
  });
});
