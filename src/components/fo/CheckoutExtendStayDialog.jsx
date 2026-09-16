import { useEffect, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Extend Guest Stay" dialog: pick a new check-out date, see the extra nights
 * and the resulting charge, then confirm.
 *
 * The date field, the validation and the preview all needed the same parsed
 * current check-out date, so they moved in together (the page's handler re-parsed
 * it a third time). The page keeps the Firestore write as
 * `onSubmit({ checkOutDate, addedNights, dailyRate })`, which must reject so the
 * failure surfaces here. Two page-level buttons used to clear a stale error
 * before opening; the dialog does that itself now.
 */
const DAY_MS = 1000 * 60 * 60 * 24;

function toDate(value) {
  if (value?.toDate) return value.toDate();
  return new Date(value);
}

export default function CheckoutExtendStayDialog({
  open,
  onOpenChange,
  booking,
  guestName,
  roomName,
  dailyRate,
  onSubmit,
}) {
  const [checkOutDate, setCheckOutDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Normalized to local midnight: stored check-outs carry a time (e.g. noon),
  // which skewed minDate via toISOString (UTC day) and made the next calendar
  // day compute 0 nights. Midnight-to-midnight is always whole nights.
  const currentOut = useMemo(() => {
    if (!booking) return null;
    const d = toDate(booking.checkOutDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [booking]);

  useEffect(() => {
    if (open) {
      setError(null);
      setCheckOutDate("");
    }
  }, [open, booking?.id]);

  const minDate = useMemo(() => {
    if (!currentOut) return undefined;
    const nextDay = new Date(currentOut);
    nextDay.setDate(nextDay.getDate() + 1);
    const m = String(nextDay.getMonth() + 1).padStart(2, "0");
    const d = String(nextDay.getDate()).padStart(2, "0");
    return `${nextDay.getFullYear()}-${m}-${d}`;
  }, [currentOut]);

  function addedNightsFor(value) {
    if (!value || !currentOut) return 0;
    const chosenOut = new Date(`${value}T00:00:00`);
    return Math.max(0, Math.round((chosenOut.getTime() - currentOut.getTime()) / DAY_MS));
  }

  async function handleConfirm() {
    if (!checkOutDate) {
      setError("Please select a new check-out date.");
      return;
    }
    const chosenOut = new Date(`${checkOutDate}T00:00:00`);
    if (currentOut && chosenOut <= currentOut) {
      setError("New check-out date must be after current check-out date.");
      return;
    }

    const addedNights = addedNightsFor(checkOutDate);
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ checkOutDate: chosenOut, addedNights, dailyRate, expectedCheckOutDate: currentOut });
      setCheckOutDate("");
    } catch (e) {
      setError(e?.message || "Failed to extend stay.");
    } finally {
      setSubmitting(false);
    }
  }

  const addedNights = addedNightsFor(checkOutDate);
  // Match the page write (Math.max(1, ...)) so preview never shows +PHP 0
  // for a charge that posts 1 night.
  const billedNights = checkOutDate ? Math.max(1, addedNights) : 0;
  const addedTotal = dailyRate * billedNights;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Extend Guest Stay
          </DialogTitle>
        </DialogHeader>

        {booking && (
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-foreground/60">Guest:</span>
                <span className="font-semibold">{guestName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/60">Room:</span>
                <span className="font-semibold">{roomName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/60">Current Check-out:</span>
                <span className="font-semibold">
                  {toDate(booking.checkOutDate).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newCheckOutDate">New Check-out Date</Label>
              <Input
                id="newCheckOutDate"
                type="date"
                min={minDate}
                value={checkOutDate}
                onChange={(e) => {
                  setCheckOutDate(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>

            {checkOutDate && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1 text-xs">
                <div className="flex justify-between text-foreground/70">
                  <span>Additional Nights:</span>
                  <span className="font-semibold">{billedNights} night{billedNights !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex justify-between text-foreground/70">
                  <span>Nightly Rate:</span>
                  <span>PHP {dailyRate.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-primary font-bold border-t border-border/40 pt-1">
                  <span>Additional Charge:</span>
                  <span>+PHP {addedTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || !checkOutDate || !booking}
          >
            {submitting ? "Extending..." : "Confirm Extension"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
