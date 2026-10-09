import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDate, formatCurrency } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import {
  BOOKINGS_PAGE_SIZE,
  subscribeToBookingsPage,
  countBookingsByStatus,
  countBookingsPage,
  approveBooking,
  rejectBooking,
  checkAndExpireStaleBookings,
  getOverdueDays} from "@/services/bookingsService";
import { listPaymentsForBooking } from "@/services/paymentsService";
import { listRooms } from "@/services/roomsService";
import { getUserDoc } from "@/services/userService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, X, Search, Image as ImageIcon, ChevronDown, CheckCircle2, AlertTriangle, ArrowRight, Clock, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription} from "@/components/ui/dialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  "All",
  "Awaiting Payment",
  "Pending",
  "Approved",
  "Checked In",
  "Checked Out",
  "Cancelled",
];

const ACTIVE_STATUSES = new Set(["Awaiting Payment", "Pending", "Approved", "Checked In"]);

const STATUS_VARIANT = {
  "Awaiting Payment": "warning",
  Pending: "warning",
  Approved: "info",
  "Checked In": "success",
  "Checked Out": "muted",
  Cancelled: "danger"};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateSafe(v) {
  if (!v) return null;
  const d = v?.toDate?.() || new Date(v);
  return d instanceof Date && !isNaN(d) ? d : null;
}

function getBookingPaid(booking) {
  return Number(booking?.payment?.deposit ?? booking?.amountPaid ?? 0);
}

function getPaid(records) {
  return records.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
}

function getBalance(booking, paid) {
  return Math.max(0, Number(booking?.totalCost ?? 0) - paid);
}

function requiresProof(booking) {
  const needs = booking.paymentMethod === "GCash" || booking.paymentMethod === "Bank Transfer";
  return needs && !booking.paymentProofUrl && booking.paymentGateway !== "simulated";
}

function getDeadlineInfo(booking) {
  if (booking.status !== "Awaiting Payment" || !booking.paymentDeadline) return null;
  const d = toDateSafe(booking.paymentDeadline);
  if (!d) return null;
  const ms = d.getTime() - Date.now();
  const expired = ms <= 0;
  const h = Math.floor(Math.max(0, ms) / 3600000);
  const m = Math.floor((Math.max(0, ms) % 3600000) / 60000);
  return {
    expired,
    urgent: !expired && ms < 12 * 3600000,
    text: expired
      ? "Payment expired — auto-cancel pending"
      : `Pay by ${d.toLocaleString()} · expires in ${h}h ${m}m`};
}

// ─── Proof cell (thumbnail + max-w-3xl viewer, reused in table + dialog) ─────

function ProofViewer({ booking, open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Payment Proof</DialogTitle>
        </DialogHeader>
        {booking.paymentProofUrl && (
          <div className="flex justify-center">
            <img
              src={booking.paymentProofUrl}
              alt="Payment proof full size"
              className="max-h-[70vh] w-auto rounded-lg border border-border"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Details dialog (max-w-2xl): breakdown + payment history + proof ─────────

export function BookingDetailsDialog({ booking, roomLabel, guestName, open, onOpenChange}) {
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsLoadedFor, setPaymentsLoadedFor] = useState(null);
  const [proofOpen, setProofOpen] = useState(false);

  useEffect(() => {
    if (!open || !booking?.id) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dialog open is external sync point, mirrors FoPaymentsPage history load
    setPayments([]);
    setPaymentsLoadedFor(null);
    setPaymentsLoading(true);
    listPaymentsForBooking(booking.id)
      .then((rows) => {
        if (!cancelled) {
          setPayments(rows);
          setPaymentsLoadedFor(booking.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPayments([]);
          setPaymentsLoadedFor(null);
        }
      })
      .finally(() => { if (!cancelled) setPaymentsLoading(false); });
    return () => { cancelled = true; };
  }, [open, booking?.id]);

  if (!booking) return null;
  const recordsTotal = getPaid(payments);
  const paid = paymentsLoadedFor === booking.id ? recordsTotal : null;
  const balance = paid === null ? null : getBalance(booking, paid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Booking Details</DialogTitle>
          <DialogDescription>
            {guestName || booking.guestName || booking.guestId || "—"} · {roomLabel} · {booking.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[booking.status] || "default"}>{booking.status}</Badge>
            {booking.paymentType && <Badge variant="outline">{booking.paymentType}</Badge>}
            {booking.bookingType && <Badge variant="outline">{booking.bookingType}</Badge>}
          </div>

          {(booking.leadGuestEmail || booking.leadGuestPhone) && (
            <p className="text-xs text-foreground/50">
              {[booking.leadGuestEmail, booking.leadGuestPhone].filter(Boolean).join(" · ")}
            </p>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <div>
              <p className="text-xs text-foreground/50">Check-in</p>
              <p className="font-medium">{formatDate(booking.checkInDate)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Check-out</p>
              <p className="font-medium">{formatDate(booking.checkOutDate)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Nights</p>
              <p className="font-medium">{booking.nights ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Pax</p>
              <p className="font-medium">
                {booking.paxCount ?? "—"}
                {booking.extraPaxCount > 0 ? ` (${booking.extraPaxCount} extra)` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Total</p>
              <p className="font-medium tabular-nums">{formatCurrency(booking.totalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Paid</p>
              <p className="font-medium tabular-nums">{paid === null ? "…" : formatCurrency(paid)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Balance</p>
              <p className="font-medium tabular-nums">{balance === null ? "…" : formatCurrency(balance)}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Method</p>
              <p className="font-medium">{booking.paymentMethod || "—"}</p>
            </div>
          </div>

          {(booking.arrivalTime || booking.specialRequests) && (
            <div className="space-y-1 text-xs text-foreground/60">
              {booking.arrivalTime && (
                <p><span className="font-medium text-foreground/70">Est. Arrival:</span> {booking.arrivalTime}</p>
              )}
              {booking.specialRequests && (
                <p><span className="font-medium text-foreground/70">Requests:</span> {booking.specialRequests}</p>
              )}
            </div>
          )}

          {booking.status === "Cancelled" && booking.rejectionReason && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs">
              <span className="font-medium">Rejection reason:</span> {booking.rejectionReason}
            </p>
          )}

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-foreground/50" />
              <span className="text-xs font-semibold text-foreground/70">Payment Proof</span>
            </div>
            {booking.paymentGateway === "simulated" && !booking.paymentProofUrl ? (
              <div className="space-y-1 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Simulated gateway payment
                </div>
                {booking.gatewayRef && (
                  <p className="text-xs text-foreground/60">
                    Ref: <span className="font-mono font-semibold">{booking.gatewayRef}</span>
                  </p>
                )}
              </div>
            ) : booking.paymentProofUrl ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setProofOpen(true)}
                  className="relative h-16 w-16 overflow-hidden rounded-md border border-border transition-colors hover:border-primary/50"
                >
                  <img src={booking.paymentProofUrl} alt="Payment proof" className="h-full w-full object-cover" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground/60">Click thumbnail to view full proof</p>
                  {booking.proofUploadedAt && (
                    <p className="mt-0.5 text-xs text-foreground/40">Uploaded: {formatDate(booking.proofUploadedAt)}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-foreground/70">
                {booking.paymentMethod === "Over-the-Counter" || booking.paymentMethod === "Credit/Debit Card"
                  ? "Pay at arrival (OTC/Card)"
                  : "No payment proof submitted"}
              </p>
            )}
          </div>
          <ProofViewer booking={booking} open={proofOpen} onOpenChange={setProofOpen} />

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-foreground/70">
              Payment History{payments.length > 0 ? ` (${payments.length})` : ""}
            </p>
            {paymentsLoading ? (
              <p className="text-xs text-foreground/50">Loading payments…</p>
            ) : payments.length === 0 ? (
              <p className="text-xs text-foreground/50">No payments recorded yet for this booking.</p>
            ) : (
              <ul className="space-y-1.5">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-foreground/60">
                      {formatDate(p.createdAt) || "—"}
                      {p.method ? ` · ${p.method}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <span className="font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {payments.length > 0 && (
              <p className="mt-2 border-t border-dashed border-border/60 pt-2 text-xs text-foreground/60">
                Records total: <span className="font-semibold tabular-nums">{formatCurrency(recordsTotal)}</span>
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Booking Card (rectangle) + compact history row ───────────────────────────

function FoBookingCard({
  booking,
  roomLabel,
  guestName,
  isActing,
  isRejectingThis,
  rejectReason,
  onApprove,
  onOpenReject,
  onCancelReject,
  onRejectReasonChange,
  onSubmitReject,
  onSeeDetails}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const overdueDays = booking.status === "Checked In" ? getOverdueDays(booking.checkOutDate) : 0;
  const isOverdue = overdueDays > 0;
  const deadlineInfo = useMemo(() => getDeadlineInfo(booking), [booking]);
  const paid = getBookingPaid(booking);
  const balance = getBalance(booking, paid);
  const blocked = requiresProof(booking);

  return (
    <div className={`overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md ${
      isOverdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-background"
    }`}>
      {/* ── Summary row (always visible) ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide booking details" : "Show booking details"}
        className="flex w-full items-center gap-3 rounded-t-xl p-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium text-foreground">{guestName || booking.guestName || booking.guestId || "—"}</p>
            {isOverdue && (
              <Badge variant="destructive" className="flex items-center gap-1 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide">
                <AlertTriangle className="h-3 w-3" />
                {overdueDays}d Overdue
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs tabular-nums text-foreground/50">
            {roomLabel} · {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)} · {formatCurrency(booking.totalCost)}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[booking.status] || "default"} className="shrink-0">
          {booking.status}
        </Badge>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-foreground/50 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* ── Expanded panel ── */}
      {expanded && (
      <div className="border-t border-border p-4 pt-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
      {(booking.leadGuestEmail || booking.leadGuestPhone) && (
        <p className="text-xs text-foreground/50">
          {[booking.leadGuestEmail, booking.leadGuestPhone].filter(Boolean).join(" · ")}
        </p>
      )}
      <p className="mt-0.5 text-xs tabular-nums text-foreground/50">
        {formatCurrency(paid)} paid · {formatCurrency(balance)} balance
      </p>
      </div>
      {/* ── Actions (right of contact/paid block) ── */}
      {!isRejectingThis && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {booking.status === "Pending" && (
            <>
              <Button
                size="sm"
                disabled={isActing || blocked}
                onClick={onApprove}
                className="h-7 gap-1 whitespace-nowrap"
                title={blocked ? "No payment proof submitted" : undefined}
              >
                <Check className="h-3.5 w-3.5" />
                {isActing ? "Approving…" : blocked ? "No Proof" : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isActing}
                onClick={onOpenReject}
                className="h-7 gap-1 whitespace-nowrap"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          )}
          {booking.status === "Checked In" && (
            <Button
              size="sm"
              variant={isOverdue ? "destructive" : "outline"}
              className="h-7 gap-1 whitespace-nowrap"
              onClick={() => navigate(`/fo/check-out?roomId=${booking.roomId || ""}`)}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {isOverdue ? "Resolve Overdue Checkout" : "Go to Check-Out"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onSeeDetails} className="h-7 gap-1 whitespace-nowrap">
            <Eye className="h-3.5 w-3.5" />
            See Details
          </Button>
        </div>
      )}
      </div>

      {/* ── Payment deadline (Awaiting Payment holds block the room until the sweep frees them) ── */}
      {deadlineInfo && (
        <p className={`mt-2 text-xs font-medium ${deadlineInfo.expired ? "text-destructive" : deadlineInfo.urgent ? "text-warning" : "text-foreground/60"}`}>
          <Clock className="mr-1 inline h-3.5 w-3.5 align-middle" />
          {deadlineInfo.text}
        </p>
      )}

      {/* ── Payment Proof (Pending bookings) ── */}
      {booking.status === "Pending" && (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-foreground/50" />
              <span className="text-xs font-semibold text-foreground/70">Payment Proof</span>
            </div>
            {booking.paymentType && (
              <Badge variant="outline" className="text-xs">
                {booking.paymentType}
              </Badge>
            )}
          </div>

          {booking.paymentGateway === "simulated" && !booking.paymentProofUrl ? (
            <div className="space-y-1 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Simulated gateway payment
              </div>
              {booking.gatewayRef && (
                <p className="text-xs text-foreground/60">
                  Ref: <span className="font-mono font-semibold">{booking.gatewayRef}</span>
                </p>
              )}
            </div>
          ) : booking.paymentProofUrl ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setProofOpen(true)}
                className="relative h-16 w-16 overflow-hidden rounded-md border border-border transition-colors hover:border-primary/50"
              >
                <img
                  src={booking.paymentProofUrl}
                  alt="Payment proof"
                  className="h-full w-full object-cover"
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground/60">
                  Click thumbnail to view full proof
                </p>
                {booking.proofUploadedAt && (
                  <p className="mt-0.5 text-xs text-foreground/40">
                    Uploaded: {formatDate(booking.proofUploadedAt)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-foreground/70">
              {booking.paymentMethod === "Over-the-Counter" || booking.paymentMethod === "Credit/Debit Card"
                ? "Pay at arrival (OTC/Card)"
                : "No payment proof submitted"}
            </p>
          )}
        </div>
      )}

      {/* ── Rejection reason (if cancelled) ── */}
      {booking.status === "Cancelled" && booking.rejectionReason && (
        <p className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-foreground/70">
          <span className="font-medium text-foreground/80">
            Rejection reason:
          </span>{" "}
          {booking.rejectionReason}
        </p>
      )}

      {/* ── Inline Reject Form ── */}
      {isRejectingThis && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">
            Rejection Reason{" "}
            <span className="text-xs font-normal text-foreground/50">(optional)</span>
          </p>
          <textarea
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-foreground/45 focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/10"
            rows={3}
            placeholder="Please provide a brief reason for rejecting this booking..."
            value={rejectReason}
            onChange={(e) => onRejectReasonChange(e.target.value)}
            disabled={isActing}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isActing}
              onClick={onCancelReject}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isActing}
              onClick={onSubmitReject}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              {isActing ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </div>
        </div>
      )}

      </div>
      )}

      {/* ── Payment proof viewer ── */}
      <ProofViewer booking={booking} open={proofOpen} onOpenChange={setProofOpen} />
    </div>
  );
}

// ─── History Row (compact, for past bookings) ────────────────────────────────

function HistoryRow({ booking, roomLabel, guestName }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-background">
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide booking details" : "Show booking details"}
        >
          <Badge variant={STATUS_VARIANT[booking.status] || "default"} className="shrink-0">
            {booking.status}
          </Badge>
          <span className="truncate text-sm font-medium text-foreground">
            {guestName || booking.guestName || booking.guestId || "—"}
          </span>
        </button>

        <span className="hidden max-w-48 shrink-0 truncate text-sm text-foreground/70 sm:block">
          {roomLabel}
        </span>
        <span className="hidden shrink-0 text-xs tabular-nums text-foreground/50 md:block">
          {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(booking.totalCost)}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-foreground/50 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-2 border-t border-dashed border-border/60 px-3 py-3 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-foreground/70">
            <span className="text-xs text-foreground/50">
              Room: <span className="font-medium text-foreground/80">{roomLabel}</span>
            </span>
            <span className="text-xs text-foreground/50">
              Check-in:{" "}
              <span className="font-medium text-foreground/80">{formatDate(booking.checkInDate)}</span>
            </span>
            <span className="text-xs text-foreground/50">
              Check-out:{" "}
              <span className="font-medium text-foreground/80">{formatDate(booking.checkOutDate)}</span>
            </span>
            {booking.nights != null && (
              <span className="text-xs text-foreground/50">
                Nights: <span className="font-medium text-foreground/80">{booking.nights}</span>
              </span>
            )}
            {booking.paxCount != null && (
              <span className="text-xs text-foreground/50">
                Pax: <span className="font-medium text-foreground/80">{booking.paxCount}</span>
              </span>
            )}
          </div>

          {(booking.leadGuestEmail || booking.leadGuestPhone) && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/50">
              {booking.leadGuestEmail && <span>{booking.leadGuestEmail}</span>}
              {booking.leadGuestPhone && <span>{booking.leadGuestPhone}</span>}
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/50">
            {booking.paymentMethod && (
              <span>
                Method:{" "}
                <span className="font-medium text-foreground/80">{booking.paymentMethod}</span>
              </span>
            )}
            {booking.paymentType && (
              <span>
                Payment:{" "}
                <span className="font-medium text-foreground/80">{booking.paymentType}</span>
              </span>
            )}
            {booking.bookingType && (
              <span>
                Type:{" "}
                <span className="font-medium text-foreground/80">{booking.bookingType}</span>
              </span>
            )}
            {booking.arrivalTime && (
              <span>
                Est. Arrival:{" "}
                <span className="font-medium text-foreground/80">{booking.arrivalTime}</span>
              </span>
            )}
          </div>

          {booking.specialRequests && (
            <p className="text-xs text-foreground/55">
              <span className="font-medium text-foreground/80">Requests:</span>{" "}
              {booking.specialRequests}
            </p>
          )}

          {booking.status === "Cancelled" && booking.rejectionReason && (
            <p className="text-xs text-foreground/55">
              <span className="font-medium text-foreground/80">Rejection reason:</span>{" "}
              {booking.rejectionReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BookingsList({
  bookings,
  roomsMap,
  roomsLoaded = true,
  guestsMap,
  actionLoading,
  rejecting,
  onApprove,
  onOpenReject,
  onCancelReject,
  onRejectReasonChange,
  onSubmitReject,
  onSeeDetails,
  compact = false}) {
  const Card = compact ? HistoryRow : FoBookingCard;
  return (
    <div className="space-y-3">
      {bookings.map((booking) => {
        // Placeholder while the rooms query is still in flight — never the
        // raw room id (see lib/room-label).
        const roomLabel = roomLabelFrom(roomsMap, booking.roomId, roomsLoaded ? "—" : "…");
        const isActing = actionLoading === booking.id;
        const isRejectingThis = !!rejecting && rejecting.bookingId === booking.id;
        return (
          <div key={booking.id} id={`booking-${booking.id}`} className="scroll-mt-24">
            <Card
              booking={booking}
              roomLabel={roomLabel}
              guestName={guestsMap[booking.guestId]}
              isActing={isActing}
              isRejectingThis={isRejectingThis}
              rejectReason={rejecting?.reason ?? ""}
              onSeeDetails={() => onSeeDetails(booking.id)}
              onApprove={() => onApprove(booking.id)}
              onOpenReject={() => onOpenReject(booking.id)}
              onCancelReject={onCancelReject}
              onRejectReasonChange={onRejectReasonChange}
              onSubmitReject={onSubmitReject}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FoBookingsPage() {

  const [bookings, setBookings] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [guestsMap, setGuestsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [rejecting, setRejecting] = useState(null); // { bookingId, reason }
  const [actionLoading, setActionLoading] = useState(null); // bookingId currently acting on
  const [showPastBookings, setShowPastBookings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailsBookingId, setDetailsBookingId] = useState(null);
  const detailsBooking = useMemo(
    () => bookings.find((b) => b.id === detailsBookingId) ?? null,
    [bookings, detailsBookingId]);
  useEffect(() => {
    if (detailsBookingId && !bookings.some((b) => b.id === detailsBookingId)) {
      setDetailsBookingId(null);
    }
  }, [bookings, detailsBookingId]);
  // Bell deep-link (?bookingId=): open the details dialog + scroll to the
  // card. One-shot — closing the dialog must not reopen on later updates.
  const [searchParams] = useSearchParams();
  const deepBookingId = searchParams.get("bookingId");
  const deepLinkAppliedRef = useRef(null);
  useEffect(() => {
    if (!deepBookingId || loading) return;
    if (deepLinkAppliedRef.current === deepBookingId) return;
    if (!bookings.some((b) => b.id === deepBookingId)) return;
    deepLinkAppliedRef.current = deepBookingId;
    setDetailsBookingId(deepBookingId);
    const t = setTimeout(() => {
      document.getElementById(`booking-${deepBookingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [deepBookingId, loading, bookings]);
  // P0 scalability: bounded live window instead of the whole collection.
  const [pageSize, setPageSize] = useState(BOOKINGS_PAGE_SIZE);
  const [tabCounts, setTabCounts] = useState({});
  const countRequestSeqRef = useRef({ tabs: {}, range: 0 });
  // P2 date filter on check-in date. Presets + custom range; bounds are
  // local-midnight inclusive on both ends.
  const [datePreset, setDatePreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rangeCount, setRangeCount] = useState(null);

  function dayStart(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  const dateBounds = useMemo(() => {
    const today = dayStart(new Date());
    if (datePreset === "today") {
      return { fromDate: today, toDate: new Date(today.getTime() + 86400000 - 1), label: "today", active: true };
    }
    if (datePreset === "7" || datePreset === "30") {
      const days = Number(datePreset);
      return {
        fromDate: today,
        toDate: new Date(today.getTime() + days * 86400000 - 1),
        label: `the next ${days} days`,
        active: true};
    }
    if (datePreset === "custom" && (customFrom || customTo)) {
      const fromDate = customFrom ? dayStart(new Date(`${customFrom}T00:00:00`)) : null;
      const toDate = customTo
        ? new Date(dayStart(new Date(`${customTo}T00:00:00`)).getTime() + 86400000 - 1)
        : null;
      if (fromDate && toDate && fromDate > toDate) {
        return { fromDate: null, toDate: null, label: "", active: false, invalid: true };
      }
      return { fromDate, toDate, label: "the selected dates", active: true };
    }
    return { fromDate: null, toDate: null, label: "", active: false };
  }, [datePreset, customFrom, customTo]);

  function handleDatePreset(preset) {
    setDatePreset(preset);
    setPageSize(BOOKINGS_PAGE_SIZE);
    setRangeCount(null);
  }
  // Guest-name cache mirror: on-demand getUserDoc per visible guest, so the
  // page never reads the whole users collection. "" = resolved, no name.
  const guestsMapRef = useRef({});
  const guestsGenerationRef = useRef(0);

  // ── Fetch rooms for name mapping (rooms are tens, not thousands) ──
  useEffect(() => {
    let isMounted = true;
    setRoomsLoaded(false);
    async function loadResources() {
      try {
        const rooms = await listRooms();

        if (!isMounted) return;
        const rMap = {};
        rooms.forEach((r) => {
          rMap[r.id] = r;
        });
        setRoomsMap(rMap);
      } catch (err) {
        console.error("[FoBookingsPage] Failed to load resources:", err);
      } finally {
        if (isMounted) setRoomsLoaded(true);
      }
    }
    loadResources();
    return () => { isMounted = false; };
  }, []);

  // Guest-name cache clears only on training-mode switch — tab changes,
  // date changes and "Show more" reuse already-resolved names.
  useEffect(() => {
    guestsGenerationRef.current += 1;
    guestsMapRef.current = {};
    setGuestsMap({});
  }, []);

  // Resolve display names for guests visible in the current window.
  async function ensureGuestNames(list) {
    const generation = guestsGenerationRef.current;
    const missing = [...new Set(list.map((b) => b.guestId).filter(Boolean))]
      .filter((id) => !(id in guestsMapRef.current));
    if (missing.length === 0) return;
    const entries = await Promise.all(
      missing.map(async (id) => {
        try {
          const d = await getUserDoc(id);
          return [id, d?.fullName || d?.email || ""];
        } catch {
          return [id, ""];
        }
      }));
    if (generation !== guestsGenerationRef.current) return;
    entries.forEach(([id, name]) => {
      guestsMapRef.current[id] = name;
    });
    setGuestsMap({ ...guestsMapRef.current });
  }

  // ── Real-time bookings subscription (bounded per-tab window) ──
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    let countsTimer = null;

    // Server-side counts stay exact without loading docs. Defined in-effect
    // so the flag drops late results from a previous tab/mode/page.
    async function refreshTabCounts() {
      await Promise.all(TABS.map(async (tab) => {
        const request = (countRequestSeqRef.current.tabs[tab] || 0) + 1;
        countRequestSeqRef.current.tabs[tab] = request;
        try {
          const count = await countBookingsByStatus(tab === "All" ? null : tab);
          if (!cancelled && countRequestSeqRef.current.tabs[tab] === request) {
            setTabCounts((prev) => ({ ...prev, [tab]: count }));
          }
        } catch (err) {
          console.error(`[FoBookingsPage] Failed to load ${tab} count:`, err);
        }
      }));
    }

    // Exact in-range total for the caption (count, not docs).
    async function refreshRangeCount(bounds, status) {
      const request = ++countRequestSeqRef.current.range;
      if (!bounds.active) {
        if (!cancelled && countRequestSeqRef.current.range === request) setRangeCount(null);
        return;
      }
      try {
        const n = await countBookingsPage({
          status: status === "All" ? null : status,
          fromDate: bounds.fromDate,
          toDate: bounds.toDate});
        if (!cancelled && countRequestSeqRef.current.range === request) setRangeCount(n);
      } catch (err) {
        console.error("[FoBookingsPage] range count failed (index?):", err);
        if (!cancelled && countRequestSeqRef.current.range === request) setRangeCount(null);
      }
    }
    // Check for stale bookings (lazy-expiry)
    checkAndExpireStaleBookings().catch((e) => {
      console.error("Failed to check stale bookings:", e);
    });

    // Badge/range counts stay live, but snapshots must not fan out count
    // queries 1:1 — snapshot-triggered refreshes are trailing-edge debounced
    // (bookings themselves stay realtime-immediate). The flag drops late
    // results after tab/mode/page changes.
    function refreshCountsSoon() {
      if (countsTimer) return;
      countsTimer = setTimeout(() => {
        countsTimer = null;
        if (cancelled) return;
        refreshTabCounts();
        refreshRangeCount(dateBounds, activeTab);
      }, 3000);
    }

    refreshTabCounts();
    refreshRangeCount(dateBounds, activeTab);

    const unsub = subscribeToBookingsPage(
      {
        status: activeTab === "All" ? null : activeTab,
        pageSize,
        fromDate: dateBounds.invalid ? null : dateBounds.fromDate,
        toDate: dateBounds.invalid ? null : dateBounds.toDate},
      (data) => {
        if (cancelled) return;
        setBookings(data);
        setLoading(false);
        ensureGuestNames(data);
        refreshCountsSoon();
      });
    return () => {
      cancelled = true;
      if (countsTimer) clearTimeout(countsTimer);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ activeTab, pageSize, dateBounds]);


  // ── Filtered list ──
  const filtered = bookings.filter(
    (b) => (activeTab === "All" || b.status === activeTab) && matchesSearch(b));

  // ── Active vs Past split (for "All" tab) ──
  const activeBookings = useMemo(
    () => bookings.filter((b) => ACTIVE_STATUSES.has(b.status) && matchesSearch(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, searchQuery, guestsMap, roomsMap]);
  const pastBookings = useMemo(
    () =>
      bookings.filter(
        (b) => !ACTIVE_STATUSES.has(b.status) && matchesSearch(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, searchQuery, guestsMap, roomsMap]);

  // ── Tab badge counts (server-side, exact without loading docs) ──
  function countForTab(tab) {
    return tabCounts[tab] ?? "…";
  }

  // ── Search filter ──
  function matchesSearch(booking) {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const guestName = guestsMap[booking.guestId] || booking.guestName || "";
    const roomLabel = roomLabelFrom(roomsMap, booking.roomId, "");
    return (
      String(guestName).toLowerCase().includes(q) ||
      String(booking.guestId || "").toLowerCase().includes(q) ||
      String(booking.leadGuestEmail || "").toLowerCase().includes(q) ||
      String(booking.leadGuestPhone || "").toLowerCase().includes(q) ||
      String(booking.id || "").toLowerCase().includes(q) ||
      String(roomLabel).toLowerCase().includes(q)
    );
  }

  // ── Action handlers ──
  async function handleApprove(bookingId) {
    setActionLoading(bookingId);
    try {
      await approveBooking(bookingId);
      toast.success("Booking approved successfully!");
    } catch (err) {
      toast.error(err?.message || "Failed to approve booking.");
    } finally {
      setActionLoading(null);
    }
  }

  function handleOpenReject(bookingId) {
    setRejecting({ bookingId, reason: "" });
  }

  function handleCancelReject() {
    setRejecting(null);
  }

  function handleRejectReasonChange(value) {
    setRejecting((prev) => (prev ? { ...prev, reason: value } : prev));
  }

  async function handleSubmitReject() {
    if (!rejecting) return;
    const { bookingId, reason } = rejecting;
    setActionLoading(bookingId);
    try {
      await rejectBooking(bookingId, reason);
      toast.success("Booking rejected.");
      setRejecting(null);
    } catch (err) {
      toast.error(err?.message || "Failed to reject booking.");
    } finally {
      setActionLoading(null);
    }
  }

  const tableProps = {
    roomsMap,
    roomsLoaded,
    guestsMap,
    actionLoading,
    rejecting,
    onApprove: handleApprove,
    onOpenReject: handleOpenReject,
    onCancelReject: handleCancelReject,
    onRejectReasonChange: handleRejectReasonChange,
    onSubmitReject: handleSubmitReject,
    onSeeDetails: setDetailsBookingId};

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-playfair text-3xl font-semibold">Bookings</h1>
          <p className="mt-1 text-sm text-foreground/70">
            Manage and respond to guest booking requests in real-time.
          </p>
        </div>
        <div className="relative w-full sm:w-72 group">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40 pointer-events-none group-focus-within:text-primary transition-colors" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guest, room, booking ID…"
            className="pl-9 border-border bg-background text-sm"
            aria-label="Search bookings"
          />
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((tab) => {
          const count = countForTab(tab);
          const isActive = activeTab === tab;
          return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setShowPastBookings(false); setPageSize(BOOKINGS_PAGE_SIZE); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
              }`}
            >
              {tab}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs leading-none ${
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted/20 text-foreground/50"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Date filter (check-in date, server-side) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-foreground/50">Check-in:</span>
        {[
          ["all", "All dates"],
          ["today", "Today"],
          ["7", "Next 7 days"],
          ["30", "Next 30 days"],
          ["custom", "Custom"],
        ].map(([id, label]) => {
          const isActive = datePreset === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleDatePreset(id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
              }`}
            >
              {label}
            </button>
          );
        })}
        {datePreset === "custom" && (
          <>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => { setCustomFrom(e.target.value); setPageSize(BOOKINGS_PAGE_SIZE); setRangeCount(null); }}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              aria-label="Check-in from date"
            />
            <span className="text-xs text-foreground/40">to</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => { setCustomTo(e.target.value); setPageSize(BOOKINGS_PAGE_SIZE); setRangeCount(null); }}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              aria-label="Check-in to date"
            />
          </>
        )}
        {dateBounds.active && (
          <button
            type="button"
            onClick={() => { handleDatePreset("all"); setCustomFrom(""); setCustomTo(""); }}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-foreground/50 hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {dateBounds.invalid && (
        <p className="text-xs text-destructive">From date is after To date — showing unfiltered.</p>
      )}
      {dateBounds.active && !dateBounds.invalid && !loading && (
        <p className="text-xs text-foreground/50">
          {rangeCount ?? "…"} booking{rangeCount === 1 ? "" : "s"} checking in {dateBounds.label}.
        </p>
      )}

      {/* Search covers the loaded window only — the note keeps that honest. */}
      {searchQuery.trim() !== "" && !loading && (
        <p className="text-xs text-foreground/50">
          Searching the {bookings.length} loaded bookings — use Show more below to search deeper.
        </p>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="py-20 text-center text-sm text-foreground/50">
          Loading bookings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center text-sm text-foreground/50">
          {searchQuery.trim()
            ? "No bookings match your search."
            : "No bookings found."}
        </div>
      ) : (
        <div className="space-y-3">

          {/* ── When viewing "All": Active table first, then collapsible Past table ── */}
          {activeTab === "All" ? (
            <>
              {activeBookings.length > 0 && (
                <BookingsList bookings={activeBookings} {...tableProps} />
              )}

              {pastBookings.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border/60" />
                    <button
                      type="button"
                      onClick={() => setShowPastBookings((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/40 uppercase tracking-wider hover:text-foreground/60 transition-colors"
                    >
                      Past Bookings ({pastBookings.length})
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${
                          showPastBookings ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                  {showPastBookings && (
                    <BookingsList bookings={pastBookings} {...tableProps} compact />
                  )}
                </div>
              )}
            </>
          ) : (
            /* ── When viewing a specific status: cards for active, compact rows for past ── */
            <BookingsList
              bookings={filtered}
              {...tableProps}
              compact={!filtered.some((b) => ACTIVE_STATUSES.has(b.status))}
            />
          )}
          {!loading && filtered.length > 0 && bookings.length >= pageSize && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={() => setPageSize((n) => n + BOOKINGS_PAGE_SIZE)}>
                Show more (+{BOOKINGS_PAGE_SIZE})
              </Button>
            </div>
          )}
        </div>
      )}

      <BookingDetailsDialog
        booking={detailsBooking}
        roomLabel={detailsBooking ? roomLabelFrom(roomsMap, detailsBooking.roomId, roomsLoaded ? "—" : "…") : "—"}
        guestName={detailsBooking ? guestsMap[detailsBooking.guestId] : ""}
        open={!!detailsBooking}
        onOpenChange={(v) => { if (!v) setDetailsBookingId(null); }}
      />
    </div>
  );
}
