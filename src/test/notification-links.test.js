import { describe, expect, it } from "vitest";
import {
  notificationMatchesVisit,
  unreadNotificationIdsForVisit,
} from "@/lib/notification-links";

describe("visited-link notification ack", () => {
  it("matches when path and bookingId both match", () => {
    expect(
      notificationMatchesVisit("/my-bookings?bookingId=b1", {
        pathname: "/my-bookings",
        bookingId: "b1",
      }),
    ).toBe(true);
  });

  it("does not match a different booking on the same page", () => {
    expect(
      notificationMatchesVisit("/my-bookings?bookingId=b1", {
        pathname: "/my-bookings",
        bookingId: "b2",
      }),
    ).toBe(false);
    expect(
      notificationMatchesVisit("/my-bookings?bookingId=b1", {
        pathname: "/my-bookings",
        bookingId: null,
      }),
    ).toBe(false);
  });

  it("matches path-only links without a bookingId", () => {
    expect(notificationMatchesVisit("/fo/messages", { pathname: "/fo/messages" })).toBe(true);
    expect(notificationMatchesVisit("/fo/messages", { pathname: "/fo/bookings" })).toBe(false);
  });

  it("ignores unrelated query params in the link", () => {
    expect(
      notificationMatchesVisit("/fo/cancellations?tab=requests&bookingId=b9", {
        pathname: "/fo/cancellations",
        bookingId: "b9",
      }),
    ).toBe(true);
  });

  it("never acks missing or relative-junk links", () => {
    expect(notificationMatchesVisit(null, { pathname: "/my-bookings" })).toBe(false);
    expect(notificationMatchesVisit("", { pathname: "/my-bookings" })).toBe(false);
    expect(notificationMatchesVisit("/my-bookings", { pathname: "" })).toBe(false);
  });

  it("selects matching unread IDs only from the visit snapshot", () => {
    const visitSnapshot = [
      { id: "matching", link: "/my-bookings?bookingId=b1", isRead: false },
      { id: "read", link: "/my-bookings?bookingId=b1", isRead: true },
      { id: "other-booking", link: "/my-bookings?bookingId=b2", isRead: false },
    ];
    const laterNotification = {
      id: "arrived-later",
      link: "/my-bookings?bookingId=b1",
      isRead: false,
    };

    expect(
      unreadNotificationIdsForVisit(visitSnapshot, {
        pathname: "/my-bookings",
        bookingId: "b1",
      }),
    ).toEqual(["matching"]);
    expect(visitSnapshot).not.toContain(laterNotification);
  });
});
