import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: DemoPreviewStrip } = await import(
  "@/components/layout/DemoPreviewStrip"
);

function renderAt(path) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(MemoryRouter, { initialEntries: [path] },
        createElement(DemoPreviewStrip)),
    );
  });
  return { container, root };
}

describe("DemoPreviewStrip", () => {
  it("shows strip with back-to-demo link when ?demo=1", () => {
    const { container, root } = renderAt("/rooms?demo=1");
    expect(container.textContent).toMatch(/Demo preview/);
    const link = container.querySelector('a[href="/demo/guest"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/Back to simulated demo/);
    act(() => root.unmount());
    container.remove();
  });

  it("renders nothing without the query", () => {
    const { container, root } = renderAt("/rooms");
    expect(container.textContent).toBe("");
    act(() => root.unmount());
    container.remove();
  });
});
