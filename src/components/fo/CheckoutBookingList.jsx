import { AlertTriangle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Left panel of the check-out screen: the checked-in booking picker.
 *
 * `filterMode`, `displayedBookings` and `overdueCount` were referenced nowhere
 * outside this block, so the tab state stays in the page (it drives
 * `displayedBookings`) while the markup moves here. `bookings` is the list
 * already filtered by the active tab. Markup is unchanged.
 */
export default function CheckoutBookingList({
  roomIdParam,
  totalCount,
  overdueCount,
  filterMode,
  onFilterChange,
  bookings,
  selectedBookingId,
  onSelect,
  guestsMap,
  roomById,
}) {
  return (
    <div className="lg:col-span-2 space-y-3">
      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Checked-in bookings</div>
            <div className="mt-0.5 text-xs text-foreground/60">
              {roomIdParam ? "Filtered by room." : "All checked-in guests."}
            </div>
          </div>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />
              {overdueCount} Overdue
            </Badge>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 border-t border-border/50 pt-2">
          <Button
            size="sm"
            variant={filterMode === "all" ? "default" : "outline"}
            className="h-7 text-xs flex-1"
            onClick={() => onFilterChange("all")}
          >
            All ({totalCount})
          </Button>
          <Button
            size="sm"
            variant={filterMode === "overdue" ? "destructive" : "outline"}
            className="h-7 text-xs flex-1 flex items-center gap-1"
            onClick={() => onFilterChange("overdue")}
          >
            <Clock className="h-3 w-3" />
            Overdue ({overdueCount})
          </Button>
        </div>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70 text-center">
          {filterMode === "overdue" ? "No overdue bookings." : "No bookings to check out."}
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const room = roomById.get(b.roomId);
            const total = Number(b.totalCost ?? 0);
            const paid = Number(b.payment?.deposit ?? 0);
            const balance = Math.max(0, total - paid);
            const active = selectedBookingId === b.id;
            const guestName =
              guestsMap[b.guestId]?.fullName ||
              guestsMap[b.guestId]?.email ||
              b.guestName ||
              "Guest";
            const roomName = room?.name || room?.type || b.roomId;

            return (
              <div
                key={b.id}
                className={`rounded-xl border p-3.5 space-y-2.5 transition-all ${
                  active
                    ? "border-primary/60 bg-primary/5 ring-2 ring-primary/30 shadow-sm"
                    : b.isOverdue
                    ? "border-destructive/40 bg-destructive/5 hover:border-destructive/70"
                    : "border-border bg-background hover:border-border/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm truncate">{guestName}</span>
                      {b.isOverdue && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 uppercase tracking-wide font-semibold">
                          {b.overdueDays}d Overdue
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-foreground/60 truncate">
                      {roomName} · Checkout: {b.checkOutDate?.toDate ? b.checkOutDate.toDate().toLocaleDateString() : new Date(b.checkOutDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    className={`text-xs font-semibold shrink-0 text-right ${
                      balance > 0 ? "text-destructive" : "text-success"
                    }`}
                  >
                    {balance > 0
                      ? `PHP ${balance.toLocaleString()} due`
                      : "Paid"}
                  </div>
                </div>

                <Button
                  variant={active ? "default" : b.isOverdue ? "destructive" : "outline"}
                  size="sm"
                  className="w-full h-8 text-xs font-medium"
                  onClick={() => onSelect(b.id)}
                >
                  {active ? "Selected" : b.isOverdue ? "Resolve Overdue Checkout" : "Select for Checkout"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
