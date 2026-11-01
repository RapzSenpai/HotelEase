import { describe, expect, it } from "vitest";
import {
  buildCalendarEvents,
  calendarStatusLabel,
  localDateKey,
} from "@/lib/booking-calendar";

const marker = (date, status = "Pending", bookingId = "bk-1") => ({
  date,
  status,
  bookingId,
});

describe("booking calendar events", () => {
  it("keeps checkout exclusive but exposes it as the checkout date", () => {
    const dates = [
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
    ];
    const { events, checkoutDates } = buildCalendarEvents(
      dates.map((date) => marker(date)),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "bk-1",
      title: "Pending Approval",
      start: new Date(2026, 9, 24),
      end: new Date(2026, 9, 30),
      backgroundColor: "#F97316",
      allDay: true,
    });
    expect(events[0].extendedProps).toMatchObject({
      status: "Pending",
      checkIn: new Date(2026, 9, 24),
      checkOut: new Date(2026, 9, 30),
    });
    expect([...checkoutDates]).toEqual(["2026-10-30"]);
    expect(localDateKey(events[0].end)).toBe("2026-10-30");
  });

  it("uses the most advanced status when one booking's markers disagree", () => {
    const { events } = buildCalendarEvents([
      marker("2026-10-24", "Awaiting Payment"),
      marker("2026-10-25", "Pending"),
      marker("2026-10-26", "Awaiting Payment"),
    ]);

    expect(events[0].title).toBe("Pending Approval");
    expect(events[0].backgroundColor).toBe("#F97316");
    expect(events[0].extendedProps.status).toBe("Pending");
  });

  it("maps internal statuses to guest-facing labels", () => {
    expect(calendarStatusLabel("Awaiting Payment")).toBe("Awaiting Payment");
    expect(calendarStatusLabel("Pending")).toBe("Pending Approval");
    expect(calendarStatusLabel("Approved")).toBe("Reserved");
    expect(calendarStatusLabel("Checked In")).toBe("Occupied");
    expect(calendarStatusLabel("Custom Status")).toBe("Custom Status");
  });

  it("ignores markers without a booking id or a usable date", () => {
    const { events } = buildCalendarEvents([
      { date: "2026-10-24", status: "Pending" },
      { bookingId: "bk-2", date: "not-a-date", status: "Pending" },
    ]);
    expect(events).toEqual([]);
  });
});
