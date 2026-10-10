import { statusVisual } from "@/lib/room-stats";

const LEGEND_STATUSES = [
  "Available",
  "Occupied",
  "Reserved",
  "Dirty / Needs Cleaning",
  "Being Cleaned",
  "Pending Approval",
  "Out of Order",
  "Archived",
];

export default function RoomsStatusLegend() {
  return (
    <div
      aria-label="Room status legend"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-foreground/60"
    >
      {LEGEND_STATUSES.map((status) => {
        const { Icon, label, className } = statusVisual(status);
        return (
          <span key={status} className="inline-flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 ${className}`} />
            {label}
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-600" />
        Mid-Stay Request
      </span>
    </div>
  );
}
