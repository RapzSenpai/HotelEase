import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  CalendarDays,
  BedDouble,
  Receipt,
  XCircle,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { mapFirebaseError } from "@/lib/errors";
import { uploadPaymentProof } from "@/services/bookingsService";
import { listPaymentsForBooking } from "@/services/paymentsService";
import { generateReceipt } from "@/services/receiptService";
import { isRoomActive } from "@/services/roomsService";
import BookingDetails from "./BookingDetails";
import BookingPaymentSection from "./BookingPaymentSection";
import CancelBookingDialog from "./CancelBookingDialog";

const STATUS_VARIANT = {
  "Awaiting Payment": "warning",
  Pending: "warning",
  Approved: "info",
  "Cancellation Requested": "warning",
  "Checked In": "success",
  "Checked Out": "muted",
  Cancelled: "danger",
};

/**
 * One booking in the guest's "My Bookings" list: a collapsed summary row that
 * expands into details, payment and cancellation actions.
 *
 * Moved out of MyBookingsPage verbatim, along with STATUS_VARIANT (which only
 * this card used). The card still owns the state that its footer CTA needs —
 * the payment records and the receipt download — while the detail, payment and
 * cancel markup live in the sibling components above.
 */
export default function BookingCard({ booking, room, trainingMode, userProfile, onCancelled }) {
  const [expanded, setExpanded] = useState(false);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsFetched, setPaymentsFetched] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  // Payment proof upload state
  const [paymentFile, setPaymentFile] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);

  const status = booking.status || "Pending";
  const canCancel = status === "Pending" || status === "Approved";
  const total = Number(booking.totalCost ?? 0);
  const paid = Number(booking.payment?.deposit ?? 0);
  const balance = Math.max(0, total - paid);

  // Payment deadline formatting
  const deadline = booking.paymentDeadline?.toDate ? booking.paymentDeadline.toDate() : new Date(booking.paymentDeadline);
  const deadlineStr = deadline && !isNaN(deadline) ? deadline.toLocaleString() : "—";

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);

    // Fetch payments lazily on first expand
    if (next && !paymentsFetched) {
      setPaymentsLoading(true);
      try {
        const data = await listPaymentsForBooking(booking.id, { trainingMode });
        setPayments(data);
      } catch {
        setPayments([]);
      } finally {
        setPaymentsLoading(false);
        setPaymentsFetched(true);
      }
    }
  }

  const receiptPayment = useMemo(() => {
    // Find the payment record that (ideally) has a receiptNo.
    // Usually the one where balance hit zero or the latest one.
    return payments.find(p => p.receiptNo) || payments[0] || null;
  }, [payments]);

  const handleDownloadReceipt = (e) => {
    e.stopPropagation();
    if (!receiptPayment) return;

    // Total paid across all payments so this matches the FO receipt.
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const paymentRef =
      receiptPayment.note ||
      receiptPayment.methodDetails?.referenceNumber ||
      receiptPayment.methodDetails?.checkNumber ||
      receiptPayment.methodDetails?.cardLast4 ||
      null;

    generateReceipt({
      receiptNo: receiptPayment.receiptNo || ("RCP-" + (receiptPayment.createdAt?.toMillis?.() || Date.now())),
      guestName: userProfile?.fullName || userProfile?.email || "Guest",
      guestEmail: userProfile?.email || "",
      roomName: room?.name || "Room",
      roomType: room?.type || "",
      checkIn: booking.checkInDate?.toDate?.() || new Date(booking.checkInDate),
      checkOut: booking.checkOutDate?.toDate?.() || new Date(booking.checkOutDate),
      numberOfNights: booking.nights,
      ratePerNight: booking.nights > 0 ? Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0) - (booking.overstayFee || 0))) / booking.nights : 0,
      baseTotal: Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0) - (booking.overstayFee || 0))),
      extraPaxCount: Number(booking.extraPaxCount ?? 0),
      extraPaxFee: Number(booking.extraPaxFee ?? 0),
      extraPaxTotal: Number(booking.extraPaxTotal ?? 0),
      overstayFee: Number(booking.overstayFee ?? 0),
      overstayReason: booking.overstayReason || "Late checkout fee",
      total: booking.totalCost,
      amountPaid: totalPaid,
      balance: Math.max(0, Number(booking.totalCost ?? 0) - totalPaid),
      paymentMethod: receiptPayment.method,
      gatewayRef: booking.gatewayRef || null,
      bankRef: booking.bankRef || null,
      reference: paymentRef,
      simulated: receiptPayment.source === "simulated_gateway" || booking.paymentGateway === "simulated",
      paymentDate: receiptPayment.createdAt?.toDate?.() || new Date(),
      processedBy: receiptPayment.processedBy || "Front Office Staff",
    });
  };

  async function handlePaymentProofUpload(e) {
    e.preventDefault();
    if (!paymentFile) {
      toast.error("Please select a file to upload.");
      return;
    }

    setUploadingProof(true);
    try {
      // Use booking's stored paymentMethod and paymentType, not local state
      await uploadPaymentProof(booking.id, paymentFile, booking.paymentType || "Full", booking.paymentMethod, { trainingMode });
      toast.success("Payment proof uploaded successfully!");
      setPaymentFile(null);
      onCancelled?.();
    } catch (err) {
      toast.error(mapFirebaseError(err) || "Failed to upload payment proof.");
    } finally {
      setUploadingProof(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* ── Summary row (always visible) ── */}
      <button
        type="button"
        onClick={handleExpand}
        className="w-full text-left p-3.5 flex items-start justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t-xl"
        aria-expanded={expanded}
      >
        <div className="space-y-0.5 min-w-0">
          {/* Room + booking ID */}
          <div className="flex flex-wrap items-center gap-2">
            <BedDouble className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-semibold text-base leading-tight">
              {room?.name || room?.type || `Room ${room?.roomNumber || ""}`}
            </span>
          </div>

          {/* Dates */}
          <div className="flex items-center gap-1.5 text-sm text-foreground/60">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>
              {formatDate(booking.checkInDate)} →{" "}
              {formatDate(booking.checkOutDate)}
            </span>
            {booking.nights ? (
              <span className="text-foreground/40">· {booking.nights}n</span>
            ) : null}
          </div>

        </div>

        {/* Right side: status + amount + chevron */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={STATUS_VARIANT[status] ?? "default"}>{status}</Badge>
          <div className="text-sm font-semibold">
            PHP {total.toLocaleString()}
          </div>
          <div className="text-foreground/40">
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>
      </button>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div className="border-t border-border p-3.5 space-y-3">
          <BookingDetails booking={booking} status={status} />

          <BookingPaymentSection
            booking={booking}
            status={status}
            total={total}
            paid={paid}
            balance={balance}
            deadlineStr={deadlineStr}
            payments={payments}
            paymentsLoading={paymentsLoading}
            paymentFile={paymentFile}
            onPaymentFileChange={setPaymentFile}
            uploadingProof={uploadingProof}
            onUploadProof={handlePaymentProofUpload}
          />

          {/* ── CTA: cancel pending/approved bookings ── */}
          {canCancel ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setIsCancelDialogOpen(true);
              }}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel Booking
            </Button>
          ) : null}

          {/* ── CTA: re-book & download receipt actions ── */}
          {(status === "Checked Out" || status === "Cancelled") && (
            <div className="flex flex-col sm:flex-row sm:justify-end items-center gap-2 pt-2">
              {status === "Checked Out" && paymentsFetched && receiptPayment && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={handleDownloadReceipt}
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Download Receipt
                </Button>
              )}

              {booking.roomId && isRoomActive(room) && (
                <Button
                  asChild
                  variant="default"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <NavLink to={`/rooms/${booking.roomId}`}>
                    Book This Room Again
                  </NavLink>
                </Button>
              )}
            </div>
          )}

          {(status === "Checked Out" || status === "Cancelled") &&
            booking.roomId && !isRoomActive(room) && (
              <p className="text-xs text-foreground/50">
                This room is no longer available for new bookings.
              </p>
            )}
        </div>
      )}

      <CancelBookingDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
        booking={booking}
        room={room}
        status={status}
        userProfile={userProfile}
        trainingMode={trainingMode}
        onCancelled={onCancelled}
      />
    </div>
  );
}
