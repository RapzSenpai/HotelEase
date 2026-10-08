import { AlertTriangle, CalendarPlus, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * The selected booking's money panel: the overdue warning (when the stay ran
 * past its check-out date) and the folio summary with its itemized breakdown.
 *
 * Held no state — the two actions are reported upward — and the two blocks were
 * contiguous and shared every dependency, so they moved as one. Markup is
 * unchanged.
 */
export default function CheckoutFolioPanel({
  booking,
  balance,
  paid,
  onExtendStay,
  onAddFee,
}) {
  const paidAmount = paid ?? (booking.totalCost ?? 0) - balance;
  return (
    <>
      {/* Overdue Warning Callout */}
      {booking.isOverdue && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Overdue Stay Alert: {booking.overdueDays} day(s) past check-out deadline</span>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            This guest was scheduled to check out on{" "}
            <strong>
              {booking.checkOutDate?.toDate
                ? booking.checkOutDate.toDate().toLocaleDateString()
                : new Date(booking.checkOutDate).toLocaleDateString()}
            </strong>
            . You can contact the guest, add an overstay penalty fee, extend their stay if the room is free, or finalize their checkout.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex items-center gap-1.5 border-destructive/30 hover:bg-destructive/15 text-destructive"
              onClick={onAddFee}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Add Overstay Fee
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex items-center gap-1.5 border-primary/40 hover:bg-primary/10 text-primary"
              onClick={onExtendStay}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Extend Stay
            </Button>
          </div>
        </div>
      )}

      {/* Folio summary */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <CardHeader className="p-0">
            <div className="font-semibold text-base">Folio Summary</div>
          </CardHeader>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex items-center gap-1"
              onClick={onExtendStay}
            >
              <CalendarPlus className="h-3 w-3" />
              Extend Stay
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex items-center gap-1"
              onClick={onAddFee}
            >
              <DollarSign className="h-3 w-3" />
              Add Fee
            </Button>
          </div>
        </div>
        <CardContent className="p-0 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Card className="rounded-lg bg-background/50 p-3">
              <CardContent className="p-0">
                <div className="text-xs text-foreground/50 mb-1">
                  Total
                </div>
                <div className="font-semibold text-sm">
                  PHP{" "}
                  {Number(
                    booking.totalCost ?? 0,
                  ).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-lg bg-background/50 p-3">
              <CardContent className="p-0">
                <div className="text-xs text-foreground/50 mb-1">
                  Paid
                </div>
                <div className="font-semibold text-sm text-success">
                  PHP{" "}
                  {Number(
                    paidAmount,
                  ).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-lg bg-background/50 p-3">
              <CardContent className="p-0">
                <div className="text-xs text-foreground/50 mb-1">
                  Outstanding
                </div>
                <div
                  className={`font-semibold text-sm ${
                    balance > 0
                      ? "text-destructive"
                      : "text-success"
                  }`}
                >
                  PHP {balance.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Folio itemized breakdown */}
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-foreground/70">
              <span>Base Room Rate ({booking.nights} night{booking.nights !== 1 ? "s" : ""}):</span>
              <span className="font-medium">
                PHP {Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0) - (booking.overstayFee || 0))).toLocaleString()}
              </span>
            </div>
            {booking.extraPaxTotal > 0 && (
              <div className="flex items-center justify-between text-primary font-medium">
                <span>Extra Guests ({booking.extraPaxCount} pax):</span>
                <span>+PHP {Number(booking.extraPaxTotal).toLocaleString()}</span>
              </div>
            )}
            {booking.overstayFee > 0 && (
              <div className="flex items-center justify-between text-destructive font-semibold">
                <span>{booking.overstayReason || "Late checkout fee"}:</span>
                <span>+PHP {Number(booking.overstayFee).toLocaleString()}</span>
              </div>
            )}
            {booking.isExtended && (
              <div className="flex items-center justify-between text-info text-[11px]">
                <span>Stay Extension:</span>
                <span>+{booking.extendedNights || 1} extended night(s)</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
