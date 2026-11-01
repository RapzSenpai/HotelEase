import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";

import { subscribeRoomAvailabilityCards } from "@/services/availabilityService";
import { buildCalendarEvents, localDateKey } from "@/lib/booking-calendar";

export default function RoomBookingsCalendar({ roomId }) {
  const normalizedRoomId = typeof roomId === "string" ? roomId : roomId?.id;
  const [events, setEvents] = useState([]);
  const [checkoutDates, setCheckoutDates] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    if (!normalizedRoomId) {
      // Pre-existing sync reset; kept as-is to avoid behavior change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEvents([]);
      setCheckoutDates(new Set());
      setLoading(false);
      return undefined;
    }

    // PII-free night markers in both modes — stays in sync as guests book
    // and staff approve / check in / cancel while the page is open. Trainee
    // guests cannot read training_bookings directly, so markers are the only
    // source the rules allow them.
    setLoading(true);
    setError(null);
    const unsubscribe = subscribeRoomAvailabilityCards(normalizedRoomId, (cards) => {
      if (!isMounted) return;
      const next = buildCalendarEvents(cards);
      setEvents(next.events);
      setCheckoutDates(next.checkoutDates);
      setLoading(false);
    });
    return () => {
      isMounted = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [roomId, normalizedRoomId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
        Loading calendar...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
        {error}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        height="auto"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: ""}}
        events={events}
        dayMaxEventRows={3}
        eventDisplay="block"
        dayCellContent={(arg) => {
          const now = new Date();
          const isToday =
            arg.date.getFullYear() === now.getFullYear() &&
            arg.date.getMonth() === now.getMonth() &&
            arg.date.getDate() === now.getDate();
          const checkoutKey = localDateKey(arg.date);
          const isCheckout = checkoutKey ? checkoutDates.has(checkoutKey) : false;
          return (
            <>
              <span className="inline-flex items-center gap-1">
                {arg.dayNumberText}
                {isToday && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                    <span className="sr-only">(today)</span>
                  </>
                )}
              </span>
              {isCheckout && (
                <span className="mt-0.5 block text-[0.625rem] font-medium uppercase tracking-wide text-foreground/50">
                  Check-out
                </span>
              )}
            </>
          );
        }}
        eventContent={(arg) => (
          <div className="truncate px-2 py-1 text-[0.75rem] leading-tight text-foreground">
            {arg.event.title || ""}
          </div>
        )}
        eventDidMount={(arg) => {
          const { checkIn, checkOut } = arg.event.extendedProps;
          if (!checkIn || !checkOut) return;
          arg.el.setAttribute(
            "title",
            `${arg.event.title} · Check-in ${localDateKey(checkIn)} → Check-out ${localDateKey(checkOut)}`);
        }}
      />
      {/* Keep this calendar read-only for Phase 2 */}
    </div>
  );
}
