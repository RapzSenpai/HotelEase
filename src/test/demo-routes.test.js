import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ADMIN_LINKS, FO_LINKS } from "@/lib/nav-links";
import { SECTION_CONFIG_PATHS, STAFF_SECTIONS, demoPath } from "@/demo/routes";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: DemoSidebar } = await import("@/demo/DemoSidebar");
const { DemoProvider } = await import("@/demo/DemoContext");

function navPaths(groups) {
  return groups.flatMap((g) => g.items.map((i) => demoPath(i.to)));
}

function renderSidebar(role) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [`/demo/${role}`] },
        createElement(DemoProvider, null, createElement(DemoSidebar, { role })),
      ),
    );
  });
  return { container, root };
}

describe("demo route table", () => {
  it("has exactly one route per nav item, for both staff roles", () => {
    expect(STAFF_SECTIONS.map((s) => s.path).sort()).toEqual(
      [...navPaths(FO_LINKS), ...navPaths(ADMIN_LINKS)].sort(),
    );
    const paths = STAFF_SECTIONS.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // Both role indexes are routed through the same section table as every other
  // nav item, so a nav item can never end up with a placeholder by accident.
  it("flags exactly the two role index routes, both fully configured", () => {
    const index = STAFF_SECTIONS.filter((s) => s.index);
    expect(index.map((s) => s.path).sort()).toEqual(["/demo/admin", "/demo/fo"]);
    for (const section of index) {
      expect(SECTION_CONFIG_PATHS).toContain(section.prodPath);
    }
  });

  it("tags each section with the role that owns it", () => {
    for (const section of STAFF_SECTIONS) {
      const source = section.role === "fo" ? FO_LINKS : ADMIN_LINKS;
      const other = section.role === "fo" ? ADMIN_LINKS : FO_LINKS;
      expect(navPaths(source)).toContain(section.path);
      expect(navPaths(other)).not.toContain(section.path);
    }
  });
});

describe("demo sidebar", () => {
  for (const role of ["fo", "admin"]) {
    it(`keeps every ${role} link inside /demo`, () => {
      const { container, root } = renderSidebar(role);
      const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
      const groups = role === "fo" ? FO_LINKS : ADMIN_LINKS;
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(href.startsWith("/demo")).toBe(true);
      for (const item of groups.flatMap((g) => g.items)) {
        expect(hrefs).toContain(demoPath(item.to));
        expect(container.textContent).toContain(item.label);
      }
      act(() => root.unmount());
      container.remove();
    });
  }
});
