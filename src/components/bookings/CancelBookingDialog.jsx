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
import { XCircle } from "lucide-react";
import { cancelBooking, requestCancellation } from "@/services/bookingsService";
import { mapFirebaseError } from "@/lib/errors";
import { formatDate } from "@/lib/format";

/**
 * The cancel / request-cancellation confirmation dialog for one booking.
 *
 * Split out of BookingCard. The reason text, the in-flight flag and the submit
 * handler moved here because nothing outside the dialog reads them; the parent
 * still owns the `open` flag, since the trigger button lives in the card.
 *
 * Behaviour is unchanged: an Approved booking asks for a reason and goes
 * through requestCancellation, anything else cancels outright.
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
  const [cancelling, setCancelling] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  async function handleConfirmCancel() {
    if (status === "Approved" && !cancellationReason.trim()) {
      toast.error("Please provide a reason for cancellation.");
      return;
    }

    setCancelling(true);
    try {
      if (status === "Approved") {
        await requestCancellation(booking.id, booking.guestId, cancellationReason, { trainingMode });
        toast.success("Cancellation request submitted.");
      } else {
        await cancelBooking(booking.id, { trainingMode });
        toast.success("Booking cancelled successfully.");
      }
      onOpenChange(false);
      onCancelled?.();
    } catch (e) {
      toast.error(mapFirebaseError(e) || "Failed to cancel booking.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" /> Cancel Booking
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">
              Are you sure you want to cancel your booking for{" "}
              <strong>{room?.name || room?.type || "this room"}</strong> (
              {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)})?
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancelling}>
            Keep Booking
          </Button>
          <Button variant="destructive" onClick={handleConfirmCancel} disabled={cancelling}>
            {cancelling ? "Cancelling..." : "Yes, Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
