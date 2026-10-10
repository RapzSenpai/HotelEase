import { Card } from "@/components/ui/card";
import { BedDouble, Check, Users, CalendarClock, Sparkles, Wrench } from "lucide-react";

/**
 * The six-tile inventory summary above the admin room list.
 * Colors follow the housekeeping chips: occupied = destructive,
 * cleaning = warning. Counts come from lib/room-stats.
 *
 * Pure presentation — the counts are computed by the page and handed in as
 * `stats`. Markup is verbatim.
 */
export default function RoomsStatsBar({ stats }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:divide-y-0 xl:divide-x">
        <div className="flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BedDouble className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-foreground/50">Total Rooms</div>
            <div className="text-lg font-semibold leading-tight">{stats.total}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <Check className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-foreground/50">Available</div>
            <div className="text-lg font-semibold leading-tight">{stats.available}</div>
            <div className="text-[11px] tabular-nums text-foreground/45">
              {stats.availabilityRate}% of sellable
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-foreground/50">Occupied</div>
            <div className="text-lg font-semibold leading-tight">{stats.occupied}</div>
            <div className="text-[11px] tabular-nums text-foreground/45">
              {stats.occupancyRate}% occupancy
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-foreground/50">Reserved</div>
            <div className="text-lg font-semibold leading-tight">{stats.reserved}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-foreground/50">Cleaning</div>
            <div className="text-lg font-semibold leading-tight">{stats.cleaning}</div>
            <div className="text-[11px] tabular-nums text-foreground/45">
              {stats.midStay} mid-stay
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-foreground/50">Out of Order</div>
            <div className="text-lg font-semibold leading-tight">{stats.outOfOrder}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
