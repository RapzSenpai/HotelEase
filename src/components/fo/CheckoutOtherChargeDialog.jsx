import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Add other charge" dialog for desk charges that are NOT late-checkout
 * penalties (minibar, damage, transfer, ...). Same contract as
 * CheckoutOverstayFeeDialog: the page keeps the Firestore write in
 * `onSubmit({ label, amount })`, which must reject so the failure surfaces
 * here.
 */
export default function CheckoutOtherChargeDialog({
  open,
  onOpenChange,
  booking,
  onSubmit,
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setLabel("");
      setAmount("");
    }
  }, [open, booking?.id]);

  async function handleConfirm() {
    if (typeof label !== "string" || !label.trim()) {
      setError("A description of the charge is required.");
      return;
    }
    const charge = Number(amount);
    if (!Number.isFinite(charge) || charge <= 0) {
      setError("Please enter a valid positive amount.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ label, amount: charge });
      setLabel("");
      setAmount("");
    } catch (e) {
      setError(e?.message || "Failed to add the charge.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-warning" />
            Add other charge
          </DialogTitle>
        </DialogHeader>

        {booking && (
          <div className="space-y-4 py-2 text-sm">
            <p className="text-xs text-foreground/70 leading-relaxed">
              Desk charges (minibar, damage, transfers...) become part of the
              folio, appear on the final receipt, and count in the guest's
              outstanding balance. Not a payment — no cash record is written.
            </p>

            <div className="space-y-2">
              <Label htmlFor="chargeLabel">Description</Label>
              <Input
                id="chargeLabel"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. Minibar"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chargeAmount">Amount (PHP)</Label>
              <Input
                id="chargeAmount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. 350"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={submitting}>
                {submitting ? "Adding..." : "Add charge"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
