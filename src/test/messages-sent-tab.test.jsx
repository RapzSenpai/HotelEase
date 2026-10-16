import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  emit: null,
  sendMessageToGuest: vi.fn(async () => ({ ok: true, emailSent: true })),
  markAsRead: vi.fn(async () => ({ ok: true })),
  replyToMessage: vi.fn(async () => ({ ok: true, emailSent: true })),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    message: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/services/messageService", () => ({
  subscribeToMessages: vi.fn((callback) => {
    mocks.emit = callback;
    return () => {};
  }),
  markAsRead: mocks.markAsRead,
  replyToMessage: mocks.replyToMessage,
  sendMessageToGuest: mocks.sendMessageToGuest,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "admin-1", email: "admin@hotelease.test", displayName: null },
    profile: { fullName: "Admin A" },
    role: "admin",
    loading: false,
  }),
}));

const { default: MessagesPage } = await import("@/pages/fo/MessagesPage");

const INCOMING = [
  {
    id: "m1",
    name: "Juan",
    email: "juan@example.com",
    subject: "Payment receipt",
    message: "Where is my receipt?",
    status: "unread",
    createdAt: new Date("2026-10-01T08:00:00Z"),
  },
  {
    id: "m2",
    name: "Maria",
    email: "maria@example.com",
    subject: "Refund",
    message: "Please refund my deposit.",
    status: "replied",
    replyMessage: "Refunded.",
    createdAt: new Date("2026-10-02T08:00:00Z"),
  },
];

const OUTGOING = [
  {
    id: "s1",
    direction: "outgoing",
    toName: "Pedro",
    toEmail: "pedro@example.com",
    subject: "Welcome",
    message: "Your booking is confirmed.",
    status: "sent",
    sentByName: "Admin A",
    emailSent: true,
    createdAt: new Date("2026-10-03T08:00:00Z"),
  },
];

let root = null;
let container = null;

function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(MessagesPage));
  });
  return container;
}

function clickTab(label) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent.trim().startsWith(label),
  );
  button.click();
}

function updateField(element, value) {
  const prototype =
    element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  mocks.emit = null;
  mocks.sendMessageToGuest.mockClear();
  mocks.markAsRead.mockClear();
  mocks.replyToMessage.mockClear();
  mocks.toastSuccess.mockClear();
  mocks.toastError.mockClear();
});

describe("MessagesPage incoming vs sent", () => {
  it("splits the inbox tabs from sent messages", async () => {
    renderPage();
    await act(async () => {
      mocks.emit([...INCOMING, ...OUTGOING]);
    });

    expect(container.textContent).toContain("Juan");
    expect(container.textContent).toContain("Maria");
    expect(container.textContent).not.toContain("Pedro");

    await act(async () => {
      clickTab("Unread");
    });
    expect(container.textContent).toContain("Juan");
    expect(container.textContent).not.toContain("Maria");

    await act(async () => {
      clickTab("Sent");
    });
    expect(container.textContent).toContain("Pedro");
    expect(container.textContent).not.toContain("Juan");
  });

  it("sends from the New Message tab and lands on Sent", async () => {
    renderPage();
    await act(async () => {
      mocks.emit([...INCOMING, ...OUTGOING]);
    });

    await act(async () => {
      clickTab("New Message");
    });
    const emailInput = container.querySelector("#outgoing-to-email");
    expect(emailInput).not.toBeNull();
    expect(container.textContent).toContain("Recipient Email");

    await act(async () => {
      updateField(emailInput, "pedro@example.com");
      updateField(container.querySelector("#outgoing-subject"), "Welcome");
      updateField(container.querySelector("#outgoing-message"), "Thanks for staying with HotelEase.");
    });

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent.includes("Send Message"))
        .click();
    });
    await act(async () => {});

    expect(mocks.sendMessageToGuest).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessageToGuest.mock.calls[0][0]).toMatchObject({
      toEmail: "pedro@example.com",
      subject: "Welcome",
      message: "Thanks for staying with HotelEase.",
      sentBy: "admin-1",
      sentByName: "Admin A",
    });

    expect(container.querySelector("#outgoing-message")).toBeNull();
    expect(container.textContent).toContain("Pedro");
    expect(container.textContent).not.toContain("Juan");
  });

  it("does not accept a message with fewer than 20 trimmed characters", async () => {
    renderPage();
    await act(async () => {
      mocks.emit([]);
    });
    await act(async () => {
      clickTab("New Message");
    });

    await act(async () => {
      updateField(container.querySelector("#outgoing-to-email"), "pedro@example.com");
      updateField(container.querySelector("#outgoing-subject"), "Welcome");
      updateField(container.querySelector("#outgoing-message"), "                  short");
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Send Message"))
        .click();
    });

    expect(mocks.sendMessageToGuest).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Message must be at least 20 characters.");
  });

  it("reports an audit update failure without implying email delivery failed", async () => {
    mocks.sendMessageToGuest.mockResolvedValueOnce({
      ok: true,
      emailSent: true,
      auditUpdateFailed: true,
    });
    renderPage();
    await act(async () => {
      mocks.emit([]);
    });
    await act(async () => {
      clickTab("New Message");
    });

    await act(async () => {
      updateField(container.querySelector("#outgoing-to-email"), "pedro@example.com");
      updateField(container.querySelector("#outgoing-subject"), "Welcome");
      updateField(
        container.querySelector("#outgoing-message"),
        "Thanks for staying with HotelEase.",
      );
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Send Message"))
        .click();
    });
    await act(async () => {});

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Message sent, but delivery status could not be saved.",
    );
  });
});
