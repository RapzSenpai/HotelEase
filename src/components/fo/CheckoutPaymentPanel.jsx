import { CheckCircle } from "lucide-react";
import { Select } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The selected booking's payment panel: the "Payment Successful!" card once the
 * balance is settled, otherwise the record-payment form.
 *
 * This one stays controlled rather than owning its fields. Validation, `setError`
 * (the page's top banner) and `submitting` — which the Check Out button also
 * reads — all live in the page, so the submit handler is unchanged. Only the
 * markup and METHOD_OPTIONS moved. `disabled` was the same expression four
 * times; it is now computed once from `submitting || balance <= 0`.
 */
const METHOD_OPTIONS = ["Cash", "GCash", "Check", "Credit Card"];

export default function CheckoutPaymentPanel({
  balance,
  submitting,
  hasReceipt = false,
  generatingReceipt,
  values,
  onChange,
  onSubmit,
  onDownloadReceipt,
  onDismissReceipt,
}) {
  const disabled = submitting || balance <= 0;

  // Success card only for a fresh payment (hasReceipt). Settled bookings
  // with no new receipt get a quiet settled card — Done used to clear the
  // receipt but the balance gate kept the card stuck.
  if (balance <= 0 && hasReceipt) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="h-12 w-12 text-success" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-success">
            Payment Successful!
          </h3>
          <p className="text-sm text-foreground/70">
            You can now download the official receipt or proceed to checkout.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onDownloadReceipt}
            disabled={generatingReceipt}
          >
            {generatingReceipt ? "Generating..." : "Download Receipt"}
          </Button>
          <Button
            variant="default"
            className="flex-1"
            onClick={onDismissReceipt}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (balance <= 0) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="h-12 w-12 text-success" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-success">
            Settled
          </h3>
          <p className="text-sm text-foreground/70">
            No outstanding balance. You can download the receipt or proceed to checkout.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={onDownloadReceipt}
          disabled={generatingReceipt}
        >
          {generatingReceipt ? "Generating..." : "Download Receipt"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-4">
      <div className="font-semibold">Record Payment</div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="payAmount">Amount (PHP)</Label>
          <Input
            id="payAmount"
            type="number"
            min={1}
            value={values.amount}
            onChange={(e) => onChange.amount(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payMethod">Method</Label>
          <Select.Root
            value={values.method}
            onValueChange={(value) => onChange.method(value)}
            disabled={disabled}
          >
            <Select.Trigger
              id="payMethod"
              className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            >
              <Select.Value />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content position="popper" side="bottom" align="start" sideOffset={4} className="z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                <Select.Viewport>
                  {METHOD_OPTIONS.map((m) => (
                    <Select.Item
                      key={m}
                      value={m}
                      className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground"
                    >
                      <Select.ItemText>{m}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="payRef">
          {values.method === "GCash"
            ? "GCash Reference Number"
            : values.method === "Check"
              ? "Check Number"
              : values.method === "Credit Card"
                ? "Last 4 Digits"
                : "Reference / Note (optional)"}
        </Label>
        <Input
          id="payRef"
          value={values.ref}
          onChange={(e) => onChange.ref(e.target.value)}
          placeholder={
            values.method === "GCash"
              ? "e.g. 09123456789-ref"
              : values.method === "Check"
                ? "e.g. CHK-00421"
                : values.method === "Credit Card"
                  ? "e.g. 4242"
                  : "Optional note or reference"
          }
          disabled={disabled}
         />
      </div>

      <Button
        variant="default"
        className="w-full"
        onClick={onSubmit}
        disabled={disabled}
      >
        {submitting ? "Processing..." : "Record Payment"}
      </Button>
    </div>
  );
}
