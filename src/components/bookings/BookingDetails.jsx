import { Users } from "lucide-react";
import { formatDate } from "@/lib/format";

/**
 * The read-only detail blocks of an expanded booking card.
 *
 * Split out of BookingCard, which had grown past 600 lines. This component has
 * no state, no effects and no handlers — it is a pure function of its props, so
 * it cannot behave differently from the inline JSX it replaced. The markup is
 * kept verbatim: the parent renders it inside a `space-y-3` container, and the
 * fragment here means these stay direct children of that container.
 */
export default function BookingDetails({ booking, status }) {
  return (
    <>
      {/* ── Info grid ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
        <div className="space-y-0.5">
          <p className="text-xs text-foreground/50 uppercase tracking-wide">
            Check-in
          </p>
          <p className="font-medium">{formatDate(booking.checkInDate)}</p>
          <p className="text-xs text-foreground/40">2:00 PM</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-foreground/50 uppercase tracking-wide">
            Check-out
          </p>
          <p className="font-medium">{formatDate(booking.checkOutDate)}</p>
          <p className="text-xs text-foreground/40">12:00 NN</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-foreground/50 uppercase tracking-wide">
            Nights
          </p>
          <p className="font-medium">{booking.nights ?? "—"}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-foreground/50 uppercase tracking-wide">
            Guests (pax)
          </p>
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-foreground/50" />
            <p className="font-medium">{booking.paxCount ?? 1}</p>
          </div>
        </div>
      </div>

      {/* ── Special requests ── */}
      {booking.specialRequests ? (
        <div className="space-y-0.5">
          <p className="text-xs text-foreground/50 uppercase tracking-wide">
            Special Requests
          </p>
          <p className="text-sm text-foreground/80">
            {booking.specialRequests}
          </p>
        </div>
      ) : null}

      {/* ── Rejection reason (Cancelled bookings) ── */}
      {status === "Cancelled" && booking.rejectionReason ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 space-y-0.5">
          <p className="text-xs text-foreground/50 uppercase tracking-wide">
            Cancellation Reason
          </p>
          <p className="text-sm text-foreground/80">
            {booking.rejectionReason}
          </p>
        </div>
      ) : null}
    </>
  );
}
