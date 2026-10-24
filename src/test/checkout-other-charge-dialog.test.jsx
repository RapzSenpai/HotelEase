import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => open ? children : null,
  DialogContent: ({ children }) => createElement("div", null, children),
  DialogHeader: ({ children }) => createElement("div", null, children),
  DialogTitle: ({ children }) => createElement("h2", null, children)}));

const CheckoutOtherChargeDialog = (await import("@/components/fo/CheckoutOtherChargeDialog")).default;

let root = null;
let container = null;

async function render(open = true) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root.render(createElement(CheckoutOtherChargeDialog, {
      open,
      onOpenChange: () => {},
      booking: { id: "bk-1", roomName: "Deluxe 101" },
      onSubmit: onSubmit})); 
  });
  return container;
}

const onSubmit = vi.fn();

beforeEach(() => {
  onSubmit.mockClear();
  onSubmit.mockResolvedValue({ ok: true });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function setNativeValue(el, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function click(text) {
  const buttons = [...container.querySelectorAll("button")];
  const target = buttons.find((b) => b.textContent.includes(text));
  if (!target) throw new Error(`No button "${text}"`);
  return act(async () => { target.click(); });
}

describe("CheckoutOtherChargeDialog", () => {
  it("writes a valid labelled charge through onSubmit", async () => {
    await render();

    const inputs = [...container.querySelectorAll("input")];
    setNativeValue(inputs[0], "Minibar");
    setNativeValue(inputs[1], "350");
    await click("Add charge");

    expect(onSubmit).toHaveBeenCalledWith({ label: "Minibar", amount: 350 });
  });

  it("blocks a blank description or non-positive amount", async () => {
    await render();

    const inputs = [...container.querySelectorAll("input")];
    setNativeValue(inputs[1], "0");
    await click("Add charge");
    expect(onSubmit).not.toHaveBeenCalled();

    setNativeValue(inputs[0], "Minibar");
    setNativeValue(inputs[1], "350");
    await click("Add charge");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failing write and keeps the dialog in error state", async () => {
    onSubmit.mockRejectedValue(new Error("Only Checked-In bookings can incur folio charges."));
    await render();

    const inputs = [...container.querySelectorAll("input")];
    setNativeValue(inputs[0], "Minibar");
    setNativeValue(inputs[1], "350");
    await click("Add charge");

    expect(container.textContent).toContain("Only Checked-In bookings can incur folio charges.");
  });
});
