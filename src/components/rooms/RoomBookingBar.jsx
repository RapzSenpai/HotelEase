import { useMemo } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The sticky bottom bar: rate, date pickers (or a summary pill once dates are
 * chosen), the Book Now button and the availability error row.
 *
 * `formattedRate` / `totalCost` / `formatRate` were used nowhere else in the
 * page, so they moved here with the markup. Props are grouped by concern — that
 * keeps the surface at seven and means every reference inside is a property
 * access, so a mistyped name is a lint error rather than a silent `undefined`.
 * Markup is unchanged.
 */

function formatRate(rate) {
  if (rate == null || rate === "") return null;
  const num = Number(rate);
  if (isNaN(num)) return null;
  return num.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

export default function RoomBookingBar({
  room,
  dates: { checkIn, checkOut, todayStr, minCheckOutStr, nights, datesSelected },
  availability: { active: roomActive, loading: bookNowLoading, error: bookNowError },
  onChangeCheckIn,
  onChangeCheckOut,
  onClearDates,
  onBookNow,
}) {
  const formattedRate = useMemo(() => formatRate(room?.ratePerNight), [room?.ratePerNight]);
  const totalCost = useMemo(() => {
    if (!formattedRate || !nights) return null;
    const total = Number(room?.ratePerNight ?? 0) * nights;
    return total.toLocaleString("en-PH", { minimumFractionDigits: 0 });
  }, [room?.ratePerNight, nights, formattedRate]);

  if (!room) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-primary/20 bg-background/95 backdrop-blur-sm shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">

          {/* Price block */}
          <div className="flex items-baseline gap-1.5 shrink-0">
            {formattedRate ? (
              <>
                <span className="font-playfair text-2xl font-bold text-foreground">
                  PHP {formattedRate}
                </span>
                <span className="text-sm text-foreground/50">/ night</span>
                {datesSelected && totalCost && (
                  <span className="ml-2 text-xs text-foreground/50">
                    · PHP {totalCost} total ({nights} night{nights !== 1 ? "s" : ""})
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-foreground/50">Rate not set</span>
            )}
          </div>

          {/* Date pickers — shown in bar if dates not yet selected */}
          {!datesSelected && (
            <div className="flex flex-1 items-center gap-2 flex-wrap">
              <div className="relative">
                <Input
                  type="date"
                  value={checkIn}
                  min={todayStr}
                  onChange={(e) => onChangeCheckIn(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onFocus={(e) => e.target.blur()}
                  className="pr-9 border-border text-sm [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer w-40"
                  placeholder="Check-in"
                />
                <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40 pointer-events-none" />
              </div>
              <span className="text-foreground/30 text-sm">→</span>
              <div className="relative">
                <Input
                  type="date"
                  value={checkOut}
                  min={minCheckOutStr}
                  disabled={!checkIn}
                  onChange={(e) => onChangeCheckOut(e.target.value)}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onFocus={(e) => e.target.blur()}
                  className="pr-9 border-border text-sm [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer disabled:cursor-not-allowed w-40"
                  placeholder="Check-out"
                />
                <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Dates summary pill when dates are selected */}
          {datesSelected && (
            <div className="flex-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs text-foreground/70">
                <CalendarIcon className="h-3.5 w-3.5" />
                {checkIn} → {checkOut}
              </span>
              <button
                type="button"
                onClick={onClearDates}
                className="text-xs text-foreground/45 hover:text-foreground underline underline-offset-2"
              >
                Change dates
              </button>
            </div>
          )}

          {/* Book Now button */}
          <div className="flex items-center justify-end shrink-0">
            {!roomActive ? (
              <Button variant="default" disabled className="min-w-40">
                No Longer Available
              </Button>
            ) : !datesSelected ? (
              <Button variant="default" disabled className="min-w-40">
                Select Dates to Book
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={onBookNow}
                disabled={bookNowLoading}
                className="min-w-40"
              >
                {bookNowLoading ? "Checking…" : "Book Now"}
              </Button>
            )}
          </div>

        </div>

        {/* Availability errors — kept on their own quiet row so the bar stays flat */}
        {bookNowError && (
          <p className="mt-2 text-right text-xs text-destructive">{bookNowError}</p>
        )}
      </div>
    </div>
  );
}
