import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout engine: the widget's auto-scroll effect needs a stub.
window.HTMLElement.prototype.scrollTo ??= () => {};

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  user: { uid: "guest-1" },
}));

vi.mock("@/services/chatbotService", () => ({
  sendMessage: mocks.sendMessage}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user })}));

const { default: ChatbotWidget } = await import("@/components/chatbot/ChatbotWidget");

const ROOMS_REPLY = [
  "Here is what is free for Dec 20 to Dec 22:",
  "```rooms",
  JSON.stringify({
    checkIn: "2026-12-20",
    checkOut: "2026-12-22",
    nights: 2,
    rooms: [
      {
        roomId: "r1",
        name: "Sunset Suite",
        type: "Suite Room",
        ratePerNight: 2500,
        basePax: 2,
        maxPax: 4,
        extraPaxFee: 500,
        amenities: ["Wi-Fi"],
      },
    ],
  }),
  "```",
].join("\n");

const SUMMARY_REPLY = [
  "Here is your booking summary:",
  "```booking-summary",
  JSON.stringify({
    roomId: "r1",
    roomName: "Sunset Suite",
    checkIn: "2026-12-20",
    checkOut: "2026-12-22",
    nights: 2,
    pax: 4,
    ratePerNight: 2500,
    extraPaxCount: 2,
    extraPaxFee: 500,
    extraPaxTotal: 2000,
    totalCost: 7000,
  }),
  "```",
].join("\n");

function Probe() {
  const params = useParams();
  const location = useLocation();
  if (params.roomId) {
    return createElement(
      "div",
      null,
      `BOOKING:${params.roomId}:${location.search}`);
  }
  return createElement("div", null, `PAGE:${location.pathname}`);
}

let root = null;
let container = null;

function renderWidget(widgetProps = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/", element: createElement(ChatbotWidget, widgetProps) }),
          createElement(Route, { path: "/booking/:roomId", element: createElement(Probe) }),
          createElement(Route, { path: "/login", element: createElement(Probe) }))));
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

/** Open the widget and send one message through the real input+submit path. */
async function sendChat(element, text) {
  click(element.querySelector('[aria-label="Open chat"]'));
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
  vi.clearAllMocks();
  mocks.user = { uid: "guest-1" };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe("ChatbotWidget booking handoff", () => {
  it("renders the rooms block as a card, then carries the summary into the booking page", async () => {
    mocks.sendMessage
      .mockResolvedValueOnce({ reply: ROOMS_REPLY })
      .mockResolvedValueOnce({ reply: SUMMARY_REPLY });

    const element = renderWidget();
    await sendChat(element, "I want to book Dec 20-22 for 4 guests");

    expect(element.textContent).toContain("Sunset Suite");
    expect(element.textContent).toContain("PHP 2,500.00");
    // Reply chips are gone — the concierge is conversational now.
    expect(element.textContent).not.toContain("View available rooms");

    await act(async () => {
      click(nodeByText(element, "select"));
    });
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(
      "I'll take the Sunset Suite.",
      expect.any(Array),
      null,
    );

    expect(element.textContent).toContain("PHP 7,000.00");
    await act(async () => {
      click(nodeByText(element, "Book Now"));
    });

    expect(element.textContent).toContain("BOOKING:r1:?checkIn=2026-12-20&checkOut=2026-12-22&pax=4");
  });

  it("sends signed-out guests to login with the booking link preserved", async () => {
    mocks.user = null;
    mocks.sendMessage.mockResolvedValueOnce({ reply: SUMMARY_REPLY });

    const element = renderWidget();
    await sendChat(element, "book this");

    expect(element.textContent).toContain("Sign in to book");
    await act(async () => {
      click(nodeByText(element, "Sign in to book"));
    });

    expect(element.textContent).toContain("PAGE:/login");
  });

  it("forwards the viewed-room context with every message", async () => {
    mocks.sendMessage.mockResolvedValueOnce({ reply: SUMMARY_REPLY });

    const element = renderWidget({ roomContext: { roomId: "r1", name: "Sunset Suite" } });
    await sendChat(element, "book this room");

    expect(mocks.sendMessage).toHaveBeenCalledWith("book this room", expect.any(Array), {
      roomId: "r1",
      name: "Sunset Suite",
    });
  });

  it("falls back to a plain code block when the model emits malformed JSON", async () => {
    mocks.sendMessage.mockResolvedValueOnce({ reply: "```rooms\n{broken json\n```" });

    const element = renderWidget();
    await sendChat(element, "rooms please");

    expect(element.textContent).toContain("{broken json");
    expect(element.querySelector("pre")).not.toBeNull();
  });

  it("renders the rooms card even when the model tags the fence as json", async () => {
    mocks.sendMessage.mockResolvedValueOnce({
      reply: ROOMS_REPLY.replace("```rooms", "```json")});

    const element = renderWidget();
    await sendChat(element, "what's free?");

    expect(element.textContent).toContain("Sunset Suite");
    expect(element.querySelector("pre")).toBeNull();
  });

  it("shows guests how many free messages are left today", async () => {
    mocks.user = null;
    mocks.sendMessage.mockResolvedValueOnce({ reply: "Hi!", remainingToday: 4, dailyLimit: 5 });

    const element = renderWidget();
    await sendChat(element, "hello");

    expect(element.textContent).toContain("4 of 5 left today");
  });

  it("hides the counter for signed-in users until it gets low", async () => {
    mocks.sendMessage
      .mockResolvedValueOnce({ reply: "Hi!", remainingToday: 87, dailyLimit: 100 })
      .mockResolvedValueOnce({ reply: "Again!", remainingToday: 3, dailyLimit: 100 });

    const element = renderWidget();
    await sendChat(element, "hello");
    expect(element.textContent).not.toContain("left today");

    await typeAndSend(element, "again");
    expect(element.textContent).toContain("3 of 100 left today");
  });

  it("greys the composer out and shows the reset time when the daily cap hits", async () => {
    mocks.user = null;
    mocks.sendMessage.mockRejectedValueOnce(
      Object.assign(new Error("You've used your free AI messages for today."), {
        code: "DAILY_CAP",
        resetAt: "2026-10-17T00:00:00.000Z",
      }),
    );

    const element = renderWidget();
    await sendChat(element, "one more?");

    const input = element.querySelector("input");
    expect(input.disabled).toBe(true);
    expect(input.getAttribute("placeholder")).toBe("Out of messages for today");
    expect(element.textContent).toContain("Free messages used up");
    expect(element.textContent).toContain("Resets at");
    expect(element.textContent).toContain("Sign in for more messages.");
    expect(nodeByText(element, "Sign In to Continue", "a")).toBeTruthy();
  });

  it("keeps the sign-in button hidden for capped signed-in users", async () => {
    mocks.sendMessage.mockRejectedValueOnce(
      Object.assign(new Error("You've reached your AI assistant limit for today."), {
        code: "DAILY_CAP",
        resetAt: "2026-10-17T00:00:00.000Z",
      }),
    );

    const element = renderWidget();
    await sendChat(element, "one more?");

    expect(element.textContent).toContain("Daily message limit reached");
    expect(nodeByText(element, "Sign In to Continue", "a")).toBeUndefined();
  });
});
