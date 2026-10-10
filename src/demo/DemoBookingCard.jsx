import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BedDouble, CalendarDays, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { formatDate } from "@/lib/format";
import { roomLabel } from "@/lib/room-label";
import BookingDetails from "@/components/bookings/BookingDetails";

// Demo fork of BookingCard: same summary-row skeleton + BookingDetails,
// payments via props (no lazy fetch), cancel via onCancel, no services.
const STATUS_VARIANT = {
  "Awaiting Payment": "warning",
  Pending: "warning",
  Approved: "info",
  "Cancellation Requested": "warning",
  "Checked In": "success",
  "Checked Out": "muted",
  Cancelled: "danger",
};

export default function DemoBookingCard({ booking, room, payments = [], onCancel = () => {} }) {
  const [expanded, setExpanded] = useState(false);
  const status = booking.status || "Pending";
  const canCancel = status === "Pending" || status === "Awaiting Payment";
  const total = Number(booking.totalCost ?? 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const balance = Math.max(0, total - paid);

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-2 rounded-t-xl p-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
        aria-expanded={expanded}
      >
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <BedDouble className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-semibold text-base leading-tight text-wrap-balance">
              {roomLabel(room)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-foreground/60">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>
              {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)}
            </span>
            {booking.nights ? (
              <span className="text-foreground/40">· {booking.nights}n</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end sm:gap-1">
          <Badge variant={STATUS_VARIANT[status] ?? "default"}>{status}</Badge>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold tabular-nums">PHP {total.toLocaleString()}</span>
            <span className="text-foreground/40">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3.5 space-y-3">
          <BookingDetails booking={booking} status={status} />
          <div className="text-xs text-foreground/60 tabular-nums">
            Total PHP {total.toLocaleString()} · Paid PHP {paid.toLocaleString()} · Balance PHP{" "}
            {balance.toLocaleString()}
          </div>
          {canCancel ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive active:scale-[0.96]"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(booking.id);
              }}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel Booking
            </Button>
          ) : null}
          {(status === "Checked Out" || status === "Cancelled") && booking.roomId ? (
            <div className="flex sm:justify-end">
              <Button asChild variant="default" size="sm" className="w-full sm:w-auto">
                <NavLink to={`/demo/guest/rooms/${booking.roomId}`}>Book This Room Again</NavLink>
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
