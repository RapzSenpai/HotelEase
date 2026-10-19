import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, role: null, logout: vi.fn(), loading: false, profile: null }),
}));
vi.mock("@/components/notifications/NotificationBell", () => ({ default: () => null }));

const { default: Navbar } = await import("@/components/layout/Navbar");

let root = null;
let container = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderAt(path) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(Navbar, { onToggleSidebar: () => {} }),
      ),
    );
  });
  return container;
}

describe("Navbar demo chrome", () => {
  it("gives demo staff a sidebar toggle and a demo badge instead of login buttons", () => {
    const el = renderAt("/demo/fo");
    expect(el.querySelector('[aria-label="Toggle sidebar"]')).toBeTruthy();
    expect(el.textContent).toContain("Demo mode");
    expect(el.textContent).not.toContain("Login");
    expect(el.textContent).not.toContain("Register");
  });

  it("keeps the login buttons on the landing page", () => {
    const el = renderAt("/");
    expect(el.querySelector('[aria-label="Toggle sidebar"]')).toBe(null);
    expect(el.textContent).toContain("Login");
    expect(el.textContent).not.toContain("Demo mode");
  });

  it("leaves the guest demo on the navbar's visitor chrome", () => {
    const el = renderAt("/demo/guest");
    expect(el.querySelector('[aria-label="Toggle sidebar"]')).toBe(null);
    expect(el.textContent).toContain("Login");
    expect(el.textContent).not.toContain("Demo mode");
  });
});
