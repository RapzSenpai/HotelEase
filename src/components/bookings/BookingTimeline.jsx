import { Check, X } from "lucide-react";
import { bookingTimeline, TIMELINE_STAGES } from "@/lib/booking-timeline";

/**
 * Horizontal booking-timeline strip (My Bookings expanded card). Purely
 * presentational — every state derives from lib/booking-timeline.js, which
 * maps the booking's EXISTING status onto the real lifecycle. No new
 * statuses, no workflow changes. Mobile-friendly: five compact dots fit a
 * 320px screen; labels sit under the dots.
 */

const DOT_CLASS = {
  done: "bg-primary text-primary-foreground border-primary",
  current: "border-2 border-primary bg-background",
  upcoming: "border-border bg-muted/40",
  cancelled: "bg-destructive text-destructive-foreground border-destructive"};

const LABEL_CLASS = {
  done: "text-foreground/70",
  current: "text-foreground font-medium",
  upcoming: "text-foreground/40",
  cancelled: "text-destructive font-medium"};

function Node({ label, state }) {
  return (
    <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <span
        data-state={state}
        aria-current={state === "current" ? "step" : undefined}
        className={`relative flex h-5 w-5 items-center justify-center rounded-full border ${DOT_CLASS[state]}`}>
        {state === "done" ? (
          <Check className="h-3 w-3" strokeWidth={3} />
        ) : state === "cancelled" ? (
          <X className="h-3 w-3" strokeWidth={3} />
        ) : state === "current" ? (
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        ) : null}
      </span>
      <span className={`text-[10px] leading-none ${LABEL_CLASS[state]}`}>{label}</span>
    </div>
  );
}

export default function BookingTimeline({ booking }) {
  const t = bookingTimeline(booking);

  const nodes = t.cancelled
    ? [
        { key: "Requested", state: "done" },
        { key: "Cancelled", state: "cancelled"}]
    : TIMELINE_STAGES.map((label, i) => ({
        key: label,
        state: t.done.includes(i)
          ? "done"
          : t.current === i
            ? "current"
            : "upcoming"}));

  // Keep the connector line between the first and last dot centres.
  const inset = `${100 / (nodes.length * 2)}%`;

  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 pb-2.5 pt-3">
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute top-[10px] h-px bg-border"
          style={{ left: inset, right: inset }}
        />
        <div className="relative flex">
          {nodes.map((node) => (
            <Node key={node.key} label={node.key} state={node.state} />
          ))}
        </div>
      </div>
      <p className="mt-2.5 text-center text-[11px] leading-snug text-foreground/60">
        {t.note}
      </p>
    </div>
  );
}
