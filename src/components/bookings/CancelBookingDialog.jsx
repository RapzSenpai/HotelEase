import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { XCircle, CheckCircle2 } from "lucide-react";
import { cancelBooking, requestCancellation } from "@/services/bookingsService";
import { listPaymentsForBooking } from "@/services/paymentsService";
import { getUserDoc } from "@/services/userService";
import { computeRefund, defaultRefundMethod, refundMethodCopy } from "@/services/refundsService";
import { deadlineFor, guestRefundNotice, oneNightFor } from "@/lib/refund-policy";
import { mapFirebaseError } from "@/lib/errors";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * The cancel / request-cancellation dialog for one booking, in two steps:
 *
 *   1. reason + confirm ("Cancelling…" while the write is in flight)
 *   2. refund notice — what the policy says is due, and how it gets sent —
 *      only when a refund is actually due (see guestRefundNotice).
 *
 * Both steps are the same Dialog root, so the refund notice replaces the
 * reason form in place: no close/reopen, no resize, no gap.
 *
 * Rendered by MyBookingsPage (not the card) because a cancelled booking moves
 * Active → Past and unmounts the card mid-flow — the parent owns `open` and the
 * target booking so step 2 survives that move.
 */
export default function CancelBookingDialog({
  open,
  onOpenChange,
  booking,
  room,
  status,
  userProfile,
  trainingMode,
  onCancelled,
}) {
  const [step, setStep] = useState("reason");
  const [cancelling, setCancelling] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [refundStep, setRefundStep] = useState(null);

  // Remaining count BEFORE this cancel — the dialog advertises it, so the
  // result toast repeats it where it stays readable after the dialog closes.
  const cancelRemaining = Math.max(0, 3 - (userProfile?.cancellationCount || 0));

  function remainingSuffix(after) {
    const r = Math.max(0, after);
    return r === 0
      ? " No cancellations remaining on this account."
      : ` ${r} cancellation${r !== 1 ? "s" : ""} remaining.`;
  }

  function handleOpenChange(next) {
    if (!next) {
      // Reset for the next open — step state must never leak into another booking.
      setStep("reason");
      setRefundStep(null);
      setCancellationReason("");
    }
    onOpenChange(next);
  }

  // Paid total from live payment records (same source FO uses), then the
  // policy's expected refund for the guest's own confirmation step.
  async function paidTotalFor(bookingId) {
    const recs = await listPaymentsForBooking(bookingId, { trainingMode });
    return recs.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  }

  async function handleConfirmCancel() {
    if (status === "Approved" && !cancellationReason.trim()) {
      toast.error("Please provide a reason for cancellation.");
      return;
    }

    setCancelling(true);
    try {
      if (status === "Approved") {
        await requestCancellation(booking.id, booking.guestId, cancellationReason, { trainingMode });
      } else {
        // Direct cancel consumes one immediately (server increments the count).
        await cancelBooking(booking.id, { trainingMode });
      }
      // Remaining count is re-read from the profile AFTER the write, so the
      // toast never reports a stale pre-click number. Request path consumes
      // nothing yet (FO approval does) — the fresh count already reflects that.
      let remaining = cancelRemaining;
      try {
        const fresh = await getUserDoc(booking.guestId, { preferTraining: trainingMode });
        const actual = Number(fresh?.cancellationCount);
        if (Number.isFinite(actual)) remaining = Math.max(0, 3 - actual);
      } catch {
        // Non-fatal: fall back to the pre-click estimate.
        if (status !== "Approved") remaining = Math.max(0, cancelRemaining - 1);
      }
      if (status === "Approved") {
        toast.success(`Cancellation request submitted.${remainingSuffix(remaining)}`);
      } else {
        toast.success(`Booking cancelled successfully.${remainingSuffix(remaining)}`);
      }
      onCancelled?.();

      // Paid and a refund is actually due → swap this same dialog to the refund
      // step, so a GCash/bank guest is told what they get back before they
      // leave. Same policy math the FO queue runs. An approved booking only
      // *requested* the cancellation (the FO still decides), so that copy says
      // "if approved" rather than promising money.
      try {
        const paid = await paidTotalFor(booking.id);
        const notice = guestRefundNotice({
          mode: status === "Approved" ? "requested" : "cancelled",
          paid,
          ...computeRefund({
            paid,
            rateType: booking.rateType || "Standard",
            cancelTime: new Date(),
            deadline: deadlineFor(booking),
            oneNightRate: oneNightFor(booking),
          }),
        });
        if (notice) {
          setRefundStep(notice);
          setStep("refund");
          return;
        }
      } catch {
        // Non-fatal: the toast already confirmed the cancellation.
      }

      handleOpenChange(false);
    } catch (e) {
      toast.error(mapFirebaseError(e) || "Failed to cancel booking.");
    } finally {
      setCancelling(false);
    }
  }

  const refundChannel = refundMethodCopy(
    booking?.refundMethod || defaultRefundMethod([booking?.paymentMethod]),
  );
  const refundRequested = refundStep?.mode === "requested";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]" onClick={(e) => e.stopPropagation()}>
        {step === "reason" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" /> Cancel Booking
              </DialogTitle>
              <DialogDescription asChild>
                <div className="text-sm text-muted-foreground">
                  Are you sure you want to cancel your booking for{" "}
                  <strong>{room?.name || room?.type || "this room"}</strong> (
                  {formatDate(booking?.checkInDate)} → {formatDate(booking?.checkOutDate)})?
                  This action cannot be undone.

                  {/* Remaining cancellation count warning */}
                  {(() => {
                    const count = userProfile?.cancellationCount || 0;
                    const remaining = Math.max(0, 3 - count);
                    if (remaining <= 0) {
                      return (
                        <span className="mt-2 text-destructive font-medium block">
                          You have reached the maximum cancellation limit. Further cancellations are not allowed.
                        </span>
                      );
                    }
                    if (remaining === 1) {
                      return (
                        <span className="mt-2 text-warning font-medium block">
                          Warning: You have 1 cancellation remaining before your account is restricted.
                        </span>
                      );
                    }
                    return (
                      <span className="mt-2 text-foreground/60 block">
                        You have {remaining} cancellation{remaining !== 1 ? "s" : ""} remaining.
                      </span>
                    );
                  })()}

                  {status === "Approved" ? (
                    <>
                      <span className="mt-2 text-warning font-medium block">
                        Cancelling an approved booking requires Front Office review and may be noted on your account.
                      </span>
                      <div className="mt-4">
                        <label htmlFor="cancel-reason" className="text-xs font-semibold uppercase text-foreground/70">
                          Cancellation Reason *
                        </label>
                        <textarea
                          id="cancel-reason"
                          className="w-full mt-1 p-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                          rows={3}
                          placeholder="Please explain why you need to cancel..."
                          value={cancellationReason}
                          onChange={(e) => setCancellationReason(e.target.value)}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={cancelling}>
                Keep Booking
              </Button>
              <Button variant="destructive" onClick={handleConfirmCancel} disabled={cancelling}>
                {cancelling ? "Cancelling..." : "Yes, Cancel"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                {refundRequested ? "Cancellation submitted" : "Booking cancelled"}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    {refundRequested
                      ? "Your cancellation request is with the Front Office. If they approve it, this is the refund our policy expects:"
                      : "Your booking has been cancelled."}
                  </p>
                  {refundStep ? (
                    <div className="space-y-1 rounded-lg border border-border bg-muted/5 px-3 py-2 tabular-nums">
                      <p className="font-medium text-foreground">
                        {refundRequested ? "Refund if approved" : "Refund due"}:{" "}
                        {formatCurrency(refundStep.refund)}
                      </p>
                      <p className="text-xs">
                        Paid {formatCurrency(refundStep.paid)} − cancellation fee{" "}
                        {formatCurrency(refundStep.fee)}
                      </p>
                      {refundStep.reason ? <p className="text-xs">{refundStep.reason}</p> : null}
                    </div>
                  ) : null}
                  <p className="text-xs">
                    Refunds are handled manually by the Front Office {refundChannel}, and you will get a
                    notification the moment yours is sent.
                    {refundRequested
                      ? " If the request is declined, your booking stands and no refund is due."
                      : ""}
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>I Understand</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
