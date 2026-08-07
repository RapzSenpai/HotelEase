import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";

import { listBookingsForRoom } from "@/services/bookingsService";
import { getRoomAvailabilityCards } from "@/services/availabilityService";

const statusToColor = {
  Pending: "#F97316", // warning/orange
  Approved: "#8B5CF6", // reserved/purple
  "Awaiting Payment": "#F59E0B",
  "Checked In": "#EF4444", // danger/red
  "Checked Out": "#6B7280", // muted/gray
  Cancelled: "#94A3B8",
};

export default function RoomBookingsCalendar({ roomId, trainingMode = false }) {
  const normalizedRoomId = typeof roomId === "string" ? roomId : roomId?.id;
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    // Reconstruct full-range events from night markers by grouping on bookingId.
    function fromMarkers(cards) {
      const byBooking = new Map();
      for (const c of cards) {
        if (!c.bookingId) continue;
        if (!byBooking.has(c.bookingId)) {
          byBooking.set(c.bookingId, { id: c.bookingId, status: c.status, start: null, end: null });
        }
        const g = byBooking.get(c.bookingId);
        const d = new Date(`${c.date}T00:00:00`);
        const dEnd = new Date(d);
        dEnd.setDate(dEnd.getDate() + 1);
        g.start = g.start && g.start < d ? g.start : d;
        g.end = g.end && g.end > dEnd ? g.end : dEnd;
        if (g.status !== c.status) g.status = c.status;
      }
      return [...byBooking.values()].map((g) => ({
        id: g.id,
        title: g.status,
        start: g.start,
        end: g.end,
        backgroundColor: statusToColor[g.status] || "#F5C518",
        borderColor: statusToColor[g.status] || "#F5C518",
        allDay: true,
      }));
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);
        if (!normalizedRoomId) {
          setEvents([]);
          setLoading(false);
          return;
        }

        let mapped;
        if (trainingMode) {
          // Legacy path: full booking objects from the open training sandbox.
          const bookings = await listBookingsForRoom(normalizedRoomId, { trainingMode });
          mapped = bookings.map((b) => {
            const start = b.checkInDate?.toDate ? b.checkInDate.toDate() : b.checkInDate;
            const end = b.checkOutDate?.toDate ? b.checkOutDate.toDate() : b.checkOutDate;
            return {
              id: b.id,
              title: b.status,
              start,
              end,
              backgroundColor: statusToColor[b.status] || "#F5C518",
              borderColor: statusToColor[b.status] || "#F5C518",
              allDay: true,
            };
          });
        } else {
          // PROD: PII-free night markers (guests can't read other guests' bookings).
          const cards = await getRoomAvailabilityCards(normalizedRoomId);
          mapped = fromMarkers(cards);
        }

        if (!isMounted) return;
        setEvents(mapped);
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load room bookings.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (roomId) load();
    return () => {
      isMounted = false;
    };
  }, [roomId, normalizedRoomId, trainingMode]);

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
          right: "",
        }}
        events={events}
        dayMaxEventRows={3}
        eventDisplay="block"
        eventContent={(arg) => {
          const label = arg.event.title || "";
          return (
            <div className="px-2 py-1 text-[0.75rem] leading-tight text-foreground">
              {label}
            </div>
          );
        }}
      />
      {/* Keep this calendar read-only for Phase 2 */}
    </div>
  );
}

