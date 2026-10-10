import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ADMIN_LINKS, FO_LINKS } from "@/lib/nav-links";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Sidebar's real data comes from Firestore; this test only pins that the nav
// groups moved to @/lib/nav-links still reach the rendered links.
const auth = vi.hoisted(() => ({ role: "fo", user: { uid: "u1" } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ role: auth.role, user: auth.user, logout: () => {} }),
}));
vi.mock("@/hooks/useFOIndicators", () => ({ useFOIndicators: () => ({}) }));
vi.mock("@/services/alertService", () => ({
  subscribeToUnresolvedCount: () => () => {},
}));

const { default: Sidebar } = await import("@/components/layout/Sidebar");

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(Sidebar)),
    );
  });
  return { container, root };
}

function paths(group) {
  return group.flatMap((g) => g.items.map((i) => i.to));
}

describe("sidebar nav parity", () => {
  it("renders every FO nav link from the shared data", () => {
    auth.role = "fo";
    auth.user = { uid: "u1" };
    const { container, root } = render();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const path of paths(FO_LINKS)) expect(hrefs).toContain(path);
    for (const item of FO_LINKS.flatMap((g) => g.items)) {
      expect(container.textContent).toContain(item.label);
    }
    act(() => root.unmount());
    container.remove();
  });

  it("renders every Admin nav link from the shared data", () => {
    auth.role = "admin";
    const { container, root } = render();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const path of paths(ADMIN_LINKS)) expect(hrefs).toContain(path);
    act(() => root.unmount());
    container.remove();
  });

  it("renders nothing without a user", () => {
    auth.role = "fo";
    auth.user = null;
    const { container, root } = render();
    expect(container.textContent).toBe("");
    act(() => root.unmount());
    container.remove();
  });
});
