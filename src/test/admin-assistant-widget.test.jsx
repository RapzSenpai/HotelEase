import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout engine: the widget's auto-scroll effect needs a stub.
window.HTMLElement.prototype.scrollTo ??= () => {};

// jsdom has no ResizeObserver; recharts' ResponsiveContainer requires it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mocks = vi.hoisted(() => ({
  buildAdminContext: vi.fn(),
  sendAdminChat: vi.fn(),
}));

vi.mock("@/services/insightsService", () => ({
  buildAdminContext: mocks.buildAdminContext,
  sendAdminChat: mocks.sendAdminChat,
}));

const { default: AdminAssistantWidget } = await import("@/components/admin/AdminAssistantWidget");

let root = null;
let container = null;

function renderWidget() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(MemoryRouter, { initialEntries: ["/admin"] }, createElement(AdminAssistantWidget)),
    );
  });
  return container;
}

function click(node) {
  act(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function nodeByText(element, text, selector = "button") {
  return [...element.querySelectorAll(selector)].find((n) =>
    n.textContent.toLowerCase().includes(text.toLowerCase()));
}

async function openAndSend(element, text) {
  click(element.querySelector('[aria-label="Open Ops Assistant"]'));
  // Macrotask flush: the open effect's contextReady gate must clear before
  // the first submit, otherwise appendUserAndReply bails silently.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await typeAndSend(element, text);
}

/** Type + submit without touching the open/close button (for follow-ups). */
async function typeAndSend(element, text) {
  const input = element.querySelector("input");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  mocks.sendAdminChat.mockReset();
  mocks.buildAdminContext.mockReset();
  mocks.buildAdminContext.mockResolvedValue({ rightNow: {} });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("AdminAssistantWidget", () => {
  it("hides the quota pill while plenty of messages remain, then shows it when low", async () => {
    mocks.sendAdminChat
      .mockResolvedValueOnce({ content: "Hi!", remainingToday: 87, dailyLimit: 100 })
      .mockResolvedValueOnce({ content: "Again!", remainingToday: 3, dailyLimit: 100 });

    const element = renderWidget();
    await openAndSend(element, "hello");
    expect(element.textContent).not.toContain("left today");

    await typeAndSend(element, "again");
    expect(element.textContent).toContain("3 of 100 left today");
  });

  it("greys the composer out and shows the reset time when the daily cap hits", async () => {
    mocks.sendAdminChat.mockRejectedValueOnce(
      Object.assign(new Error("You've reached your AI assistant limit for today."), {
        code: "DAILY_CAP",
        resetAt: "2026-10-17T00:00:00.000Z",
      }),
    );

    const element = renderWidget();
    await openAndSend(element, "one more?");

    const input = element.querySelector("input");
    expect(input.disabled).toBe(true);
    expect(input.getAttribute("placeholder")).toBe("Out of messages for today");
    expect(element.textContent).toContain("Daily assistant limit reached");
    expect(element.textContent).toContain("Resets at");
  });

  it("keeps an error bubble for non-cap failures", async () => {
    mocks.sendAdminChat.mockRejectedValueOnce(new Error("The assistant is unreachable right now."));

    const element = renderWidget();
    await openAndSend(element, "hi");

    expect(element.textContent).toContain("The assistant is unreachable right now.");
  });

  it("keeps the announcement draft card with its editor handoff", async () => {
    mocks.sendAdminChat.mockResolvedValueOnce({
      content:
        "Here is a draft:\n```action\n" +
        JSON.stringify({
          type: "draft_announcement",
          title: "Pool closed tomorrow",
          body: "The pool will be closed for maintenance tomorrow morning.",
        }) +
        "\n```",
      remainingToday: 50,
      dailyLimit: 100,
    });

    const element = renderWidget();
    await openAndSend(element, "draft an announcement");

    expect(element.textContent).toContain("Pool closed tomorrow");
    expect(element.textContent).toContain("Open in Announcements");
    expect(nodeByText(element, "Open in Announcements")).toBeTruthy();
  });

  it("renders assistant chart blocks without falling back to a code block", async () => {
    mocks.sendAdminChat.mockResolvedValueOnce({
      content:
        "Here you go:\n```chart\n" +
        JSON.stringify({
          type: "bar",
          title: "Revenue by Payment Method",
          data: [
            { label: "GCash", value: 12500 },
            { label: "Cash", value: 3000 },
          ],
        }) +
        "\n```",
      remainingToday: 50,
      dailyLimit: 100,
    });

    const element = renderWidget();
    await openAndSend(element, "chart the revenue");

    expect(element.textContent).toContain("Revenue by Payment Method");
    expect(element.querySelector("pre")).toBeNull();
  });
});
