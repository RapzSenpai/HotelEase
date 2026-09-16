import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
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
 * "Add Overstay / Late Check-Out Fee" dialog: reason, amount, quick amounts
 * (including half-day, when the room has a rate) and validation.
 *
 * All four pieces of state were referenced nowhere but this dialog, so they
 * moved with the markup. The page keeps the Firestore write as
 * `onSubmit({ amount, reason })`, which must reject so the failure surfaces
 * here. A stale error used to be cleared by the page's "Add Overstay Fee"
 * buttons; the dialog does that itself now.
 */
const QUICK_AMOUNTS = [300, 500, 1000];

export default function CheckoutOverstayFeeDialog({
  open,
  onOpenChange,
  booking,
  roomRate,
  onSubmit,
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Overstay / Late Check-Out Fee");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setAmount("");
      setReason("Overstay / Late Check-Out Fee");
    }
  }, [open, booking?.id]);

  const halfDay = Math.round(roomRate / 2);

  async function handleConfirm() {
    const fee = Number(amount);
    if (!Number.isFinite(fee) || fee <= 0) {
      setError("Please enter a valid positive fee amount.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ amount: fee, reason });
      setAmount("");
    } catch (e) {
      setError(e?.message || "Failed to add overstay fee.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-destructive" />
            Add Overstay / Late Check-Out Fee
          </DialogTitle>
        </DialogHeader>

        {booking && (
          <div className="space-y-4 py-2 text-sm">
            <p className="text-xs text-foreground/70 leading-relaxed">
              Add an incidental charge or late checkout penalty to this booking folio. It will be added to the outstanding balance and itemized on the official receipt.
            </p>

            <div className="space-y-2">
              <Label htmlFor="feeReason">Fee Reason / Description</Label>
              <Input
                id="feeReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Overstay Penalty / Late Departure Fee"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feeAmount">Fee Amount (PHP)</Label>
              <Input
                id="feeAmount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. 500"
              />
            </div>

            {/* Quick suggestion buttons */}
            <div className="space-y-1">
              <span className="text-[11px] text-foreground/50">Quick amounts:</span>
              <div className="flex gap-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2.5"
                    onClick={() => setAmount(String(amt))}
                  >
                    ₱{amt.toLocaleString()}
                  </Button>
                ))}
                {roomRate > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2.5"
                    onClick={() => {
                      setAmount(String(halfDay));
                      setReason("Late Check-Out Fee (Half Day)");
                    }}
                  >
                    Half Day (₱{halfDay.toLocaleString()})
                  </Button>
                )}
              </div>
            </div>

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
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || !amount || !booking}
          >
            {submitting ? "Adding..." : "Add Fee to Folio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
