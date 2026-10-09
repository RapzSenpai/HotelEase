import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, Receipt } from "lucide-react";
import { formatDate } from "@/lib/format";
import { roomLabel } from "@/lib/room-label";
import { listPaymentsForBooking } from "@/services/paymentsService";
import { refundMethodCopy } from "@/services/refundsService";
import { generateReceipt } from "@/services/receiptService";
import { isRoomActive } from "@/services/roomsService";

const STATUS_VARIANT = {
  "Checked Out": "muted",
  Cancelled: "danger"};

/**
 * Compact history row for past bookings (Checked Out / Cancelled).
 * Mirrors the FO HistoryRow pattern: single-line collapsed summary,
 * small text details on expand. No payment or cancel actions —
 * only re-book + receipt download.
 */
export default function PastBookingRow({ booking, room, userProfile, autoExpand = false }) {
  const [expanded, setExpanded] = useState(!!autoExpand);
  const [payments, setPayments] = useState([]);
  const [paymentsFetched, setPaymentsFetched] = useState(false);

  const status = booking.status || "Checked Out";
  const total = Number(booking.totalCost ?? 0);
  const roomTitle = roomLabel(room);

  async function fetchPaymentsOnce() {
    try {
      const data = await listPaymentsForBooking(booking.id);
      setPayments(data);
    } catch {
      setPayments([]);
    } finally {
      setPaymentsFetched(true);
    }
  }

  // Deep-link auto-expand (refund notif): load payments immediately so the
  // refund line shows without an extra click.
  useEffect(() => {
    if (autoExpand && !paymentsFetched && (status === "Checked Out" || status === "Cancelled")) {
      fetchPaymentsOnce();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpand]);

  async function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !paymentsFetched && (status === "Checked Out" || status === "Cancelled")) {
      await fetchPaymentsOnce();
    }
  }

  // Compact refund status for cancelled rows — same branches as BookingCard,
  // without the reference lookup (see full booking for details).
  const pastRefundLine = (() => {
    if (status !== "Cancelled" || !paymentsFetched) return null;
    const rs = booking.refundStatus || null;
    const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const amt = Number(booking.refundAmount ?? 0);
    const amtStr = amt > 0 ? ` of PHP ${amt.toLocaleString()}` : "";
    if (!rs && paid > 0) {
      return "Cancellation approved — your refund is being prepared by Front Office.";
    }
    if (!rs) {
      return "No payment was recorded for this booking, so no refund is due.";
    }
    if (rs === "Pending") return `Refund${amtStr} requested — waiting for Front Office approval.`;
    if (rs === "Approved") return `Refund${amtStr} approved — will be sent ${refundMethodCopy(booking.refundMethod)} shortly.`;
    if (rs === "Paid") return `Refund${amtStr} sent ${refundMethodCopy(booking.refundMethod)}.`;
    if (rs === "Rejected") return "The refund request wasn't approved — contact the front office if you have questions.";
    return null;
  })();

  const receiptPayment = useMemo(() => {
    return payments.find((p) => p.receiptNo) || payments[0] || null;
  }, [payments]);

  function handleDownloadReceipt(e) {
    e.stopPropagation();
    if (!receiptPayment) return;
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
      paymentMethod: receiptPayment.method || booking.paymentMethod || "",
      paymentRef,
      paymentDate: receiptPayment.createdAt?.toDate?.() || new Date()});
  }

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={handleToggle}
          className="flex flex-1 items-center gap-3 text-left min-w-0"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide booking details" : "Show booking details"}
        >
          <Badge variant={STATUS_VARIANT[status] || "default"} className="shrink-0">
            {status}
          </Badge>
          <span className="truncate text-sm font-medium text-foreground">
            {roomTitle}
          </span>
        </button>
        <span className="hidden md:block shrink-0 text-xs text-foreground/50 tabular-nums">
          {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)}
        </span>
        <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
          PHP {total.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={handleToggle}
          className="shrink-0 text-foreground/50 hover:text-foreground/80 transition-colors"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide booking details" : "Show booking details"}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-dashed border-border/60 px-3 py-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/50">
            <span>
              Check-in: <span className="font-medium text-foreground/80">{formatDate(booking.checkInDate)}</span>
            </span>
            <span>
              Check-out: <span className="font-medium text-foreground/80">{formatDate(booking.checkOutDate)}</span>
            </span>
            {booking.nights != null && (
              <span>
                Nights: <span className="font-medium text-foreground/80">{booking.nights}</span>
              </span>
            )}
            {booking.paxCount != null && (
              <span>
                Pax: <span className="font-medium text-foreground/80">{booking.paxCount}</span>
              </span>
            )}
            {booking.paymentMethod && (
              <span>
                Method: <span className="font-medium text-foreground/80">{booking.paymentMethod}</span>
              </span>
            )}
            {booking.paymentType && (
              <span>
                Payment: <span className="font-medium text-foreground/80">{booking.paymentType}</span>
              </span>
            )}
          </div>
          {status === "Cancelled" && booking.rejectionReason && (
            <p className="rounded bg-destructive/5 px-2.5 py-1.5 text-xs text-foreground/70">
              <span className="font-medium text-foreground/80">Cancellation reason:</span> {booking.rejectionReason}
            </p>
          )}
          {pastRefundLine ? (
            <p className="rounded bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-foreground/80">
              {pastRefundLine}
            </p>
          ) : null}
          <div className="flex flex-col sm:flex-row sm:justify-end items-center gap-2 pt-1">
            {status === "Checked Out" && paymentsFetched && receiptPayment && (
              <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handleDownloadReceipt}>
                <Receipt className="mr-2 h-4 w-4" />
                Download Receipt
              </Button>
            )}
            {booking.roomId && isRoomActive(room) && (
              <Button asChild variant="default" size="sm" className="w-full sm:w-auto">
                <NavLink to={`/rooms/${booking.roomId}`}>Book This Room Again</NavLink>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
