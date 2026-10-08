import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  markNotificationsRead: vi.fn(),
  onSnapshot: null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "guest-1" }, trainingMode: false }),
}));
vi.mock("@/services/notificationService", () => ({
  subscribeToNotifications: (...args) => mocks.subscribe(...args),
  markAsRead: (...args) => mocks.markAsRead(...args),
  markAllAsRead: (...args) => mocks.markAllAsRead(...args),
  markNotificationsRead: (...args) => mocks.markNotificationsRead(...args),
}));
vi.mock("@/hooks/useNotificationToasts", () => ({
  useNotificationToasts: vi.fn(),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => children,
  PopoverContent: ({ children }) => children,
  PopoverTrigger: ({ children }) => children,
}));

const { default: NotificationBell } = await import("@/components/notifications/NotificationBell");

let root = null;
let container = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  mocks.onSnapshot = null;
  vi.clearAllMocks();
});

describe("NotificationBell visit acknowledgement", () => {
  it("does not acknowledge a matching notification that arrives after page entry", async () => {
    mocks.subscribe.mockImplementation((_uid, onSnapshot) => {
      mocks.onSnapshot = onSnapshot;
      return vi.fn();
    });
    mocks.markNotificationsRead.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/my-bookings?bookingId=booking-1"] },
          createElement(NotificationBell),
        ),
      );
    });
    await act(async () => {
      mocks.onSnapshot([
        {
          id: "late-notification",
          link: "/my-bookings?bookingId=booking-1",
          isRead: false,
          title: "Booking update",
        },
      ]);
    });

    expect(mocks.markNotificationsRead).not.toHaveBeenCalled();
  });
});
