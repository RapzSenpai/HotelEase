import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { listBookingsForUser, cancelBooking, requestCancellation, checkAndExpireStaleBookings, uploadPaymentProof } from "@/services/bookingsService";
import { listRooms, isRoomActive } from "@/services/roomsService";
import { listPaymentsForBooking } from "@/services/paymentsService";
import { generateReceipt } from "@/services/receiptService";
import { HOTEL_GCASH_NUMBER, calculatePartialPayment, getPaymentDetails, PROOF_REQUIRED_METHODS } from "@/lib/paymentDetails";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Users,
  CreditCard,
  BedDouble,
  Receipt,
  XCircle,
  Upload,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(tsLike) {
  try {
    return tsLike?.toDate ? tsLike.toDate() : new Date(tsLike ?? 0);
  } catch {
    return new Date(0);
  }
}

function sortBookings(list) {
  return [...list].sort((a, b) => {
    const aActive = ACTIVE_STATUSES.has(a.status) ? 0 : 1;
    const bActive = ACTIVE_STATUSES.has(b.status) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    // Within active: sort by status priority, then by creation date (newest first)
    if (aActive === 0) {
      const aPriority = STATUS_ORDER.indexOf(a.status);
      const bPriority = STATUS_ORDER.indexOf(b.status);
      if (aPriority !== bPriority) return aPriority - bPriority;
      return toDate(b.createdAt) - toDate(a.createdAt);
    }

    // Within past: sort by check-in date descending (most recent stay first)
    return toDate(b.checkInDate) - toDate(a.checkInDate);
  });
}

function formatDate(tsLike) {
  try {
    const d = tsLike?.toDate ? tsLike.toDate() : new Date(tsLike);
    if (!d || isNaN(d)) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function formatDateTime(tsLike) {
  try {
    const d = tsLike?.toDate ? tsLike.toDate() : new Date(tsLike);
    if (!d || isNaN(d)) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

const STATUS_VARIANT = {
  "Awaiting Payment": "warning",
  Pending: "warning",
  Approved: "info",
  "Cancellation Requested": "warning",
  "Checked In": "success",
  "Checked Out": "muted",
  Cancelled: "danger",
};

const STATUS_ORDER = [
  "Awaiting Payment",
  "Pending",
  "Approved",
  "Cancellation Requested",
  "Checked In",
  "Checked Out",
  "Cancelled",
];

// Active statuses appear in the "Active" section; everything else is "Past"
const ACTIVE_STATUSES = new Set([
  "Awaiting Payment",
  "Pending",
  "Approved",
  "Cancellation Requested",
  "Checked In",
]);

// ── BookingCard ───────────────────────────────────────────────────────────────

function BookingCard({ booking, room, trainingMode, userProfile, onCancelled }) {
  const [expanded, setExpanded] = useState(false);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsFetched, setPaymentsFetched] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  
  // Payment proof upload state
  const [paymentType, setPaymentType] = useState("Full");
  const [paymentMethod, setPaymentMethod] = useState("GCash");
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

    generateReceipt({
      receiptNo: receiptPayment.receiptNo || ("RCP-" + (receiptPayment.createdAt?.toMillis?.() || Date.now())),
      guestName: userProfile?.fullName || userProfile?.email || "Guest",
      guestEmail: userProfile?.email || "",
      roomName: room?.name || "Room",
      roomType: room?.type || "",
      checkIn: booking.checkInDate?.toDate?.() || new Date(booking.checkInDate),
      checkOut: booking.checkOutDate?.toDate?.() || new Date(booking.checkOutDate),
      numberOfNights: booking.nights,
      ratePerNight: booking.nights > 0 ? booking.totalCost / booking.nights : 0,
      total: booking.totalCost,
      subtotal: booking.totalCost,
      amountPaid: receiptPayment.amount,
      balance: 0, // Assuming Checked Out usually means 0 balance
      paymentMethod: receiptPayment.method,
      paymentDate: receiptPayment.createdAt?.toDate?.() || new Date(),
      processedBy: receiptPayment.processedBy || "Front Office Staff",
    });
  };

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
      setIsCancelDialogOpen(false);
      onCancelled?.();
    } catch (e) {
      toast.error(e?.message || "Failed to cancel booking.");
    } finally {
      setCancelling(false);
    }
  }

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
      toast.error(err?.message || "Failed to upload payment proof.");
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
        className="w-full text-left p-4 flex items-start justify-between gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t-xl"
        aria-expanded={expanded}
      >
        <div className="space-y-1 min-w-0">
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
        <div className="flex flex-col items-end gap-2 shrink-0">
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
        <div className="border-t border-border p-4 space-y-4">
          {/* ── Info grid ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-foreground/50 uppercase tracking-wide">
                Check-in
              </p>
              <p className="font-medium">{formatDate(booking.checkInDate)}</p>
              <p className="text-xs text-foreground/40">2:00 PM</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-foreground/50 uppercase tracking-wide">
                Check-out
              </p>
              <p className="font-medium">{formatDate(booking.checkOutDate)}</p>
              <p className="text-xs text-foreground/40">12:00 NN</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-foreground/50 uppercase tracking-wide">
                Nights
              </p>
              <p className="font-medium">{booking.nights ?? "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-foreground/50 uppercase tracking-wide">
                Guests (pax)
              </p>
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-foreground/50" />
                <p className="font-medium">{booking.paxCount ?? 1}</p>
              </div>
            </div>
          </div>

          {/* ── Special requests ── */}
          {booking.specialRequests ? (
            <div className="space-y-0.5">
              <p className="text-xs text-foreground/50 uppercase tracking-wide">
                Special Requests
              </p>
              <p className="text-sm text-foreground/80">
                {booking.specialRequests}
              </p>
            </div>
          ) : null}

          {/* ── Rejection reason (Cancelled bookings) ── */}
          {status === "Cancelled" && booking.rejectionReason ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 space-y-0.5">
              <p className="text-xs text-foreground/50 uppercase tracking-wide">
                Cancellation Reason
              </p>
              <p className="text-sm text-foreground/80">
                {booking.rejectionReason}
              </p>
            </div>
          ) : null}

          {/* ── Payment folio ── */}
          <div className="rounded-lg border border-border bg-background p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-foreground/50" />
              <span className="text-sm font-semibold">Payment Folio</span>
            </div>

            {/* For OTC/Card + Pending status, show proof-exempt messaging instead of misleading ₱0 folio */}
            {(booking.paymentMethod === "Credit/Debit Card" || booking.paymentMethod === "Over-the-Counter") && status === "Pending" ? (
              <div className="rounded-md bg-background/80 border border-border px-3 py-2">
                <p className="text-xs text-foreground/50">Payment Status</p>
                <p className="text-sm font-semibold">
                  {(() => {
                    if (booking.paymentType === "Full") {
                      return "Your full payment will be verified and recorded by Front Office. Your booking is pending FO review.";
                    }
                    return "Pay the remaining balance at the front desk upon arrival. Your booking is pending FO review.";
                  })()}
                </p>
                <p className="text-xs text-foreground/60 mt-1">
                  Declared amount: PHP {(booking.paymentType === "Partial" ? calculatePartialPayment(total) : total).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-background/80 border border-border px-2 py-2">
                  <p className="text-xs text-foreground/50">Total</p>
                  <p className="text-sm font-semibold">
                    PHP {total.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md bg-background/80 border border-border px-2 py-2">
                  <p className="text-xs text-foreground/50">Paid</p>
                  <p className="text-sm font-semibold text-success">
                    PHP {paid.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md bg-background/80 border border-border px-2 py-2">
                  <p className="text-xs text-foreground/50">Balance</p>
                  <p
                    className={`text-sm font-semibold ${balance > 0 ? "text-destructive" : "text-success"}`}
                  >
                    PHP {balance.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {/* Individual payment records */}
            {paymentsLoading ? (
              <p className="text-xs text-foreground/50 text-center py-1">
                Loading payment records…
              </p>
            ) : payments.length > 0 ? (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-foreground/50 uppercase tracking-wide">
                  Payment Records
                </p>
                {payments.map((p) => {
                  const ref =
                    p.methodDetails?.referenceNumber ||
                    p.methodDetails?.checkNumber ||
                    p.methodDetails?.cardLast4 ||
                    null;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-xs text-foreground/70 border-t border-border/50 pt-1"
                    >
                      <span>
                        PHP {Number(p.amount ?? 0).toLocaleString()} ·{" "}
                        {p.method || "—"}
                        {ref ? ` · ${ref}` : ""}
                      </span>
                      <span className="text-foreground/40">
                        {formatDateTime(p.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* ── Payment Proof Upload (Awaiting Payment status) ── */}
          {/* Phase 17.3: Only show upload UI for GCash and Bank Transfer methods */}
          {status === "Awaiting Payment" && PROOF_REQUIRED_METHODS.includes(booking.paymentMethod) && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-warning">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-semibold">Payment Proof Required</span>
              </div>
              <p className="text-xs text-foreground/70">
                Upload proof of payment by <span className="font-medium">{deadlineStr}</span> or this booking will be automatically cancelled.
              </p>
              
              <form onSubmit={handlePaymentProofUpload} className="space-y-3">
                {/* Payment Method Display (read-only - locked from booking time) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-foreground/70">Payment Method</label>
                  <div className="text-sm font-medium">{booking.paymentMethod}</div>
                </div>

                {/* Payment Instructions */}
                <div className="rounded-md border border-border bg-background p-3 space-y-2">
                  <div className="text-xs font-semibold">Payment Instructions</div>
                  <div className="space-y-1.5 text-xs">
                    <p>
                      Please send <span className="font-semibold">
                        ₱{(booking.paymentType === "Partial" ? calculatePartialPayment(total) : total).toLocaleString()}
                      </span> via {booking.paymentMethod}:
                    </p>
                    {(() => {
                      const details = getPaymentDetails(booking.paymentMethod);
                      return (
                        <div className="space-y-1.5">
                          {details.number && (
                            <div className="flex items-center gap-2 bg-surface-hover p-1.5 rounded">
                              <span className="font-mono font-semibold text-sm">{details.number}</span>
                            </div>
                          )}
                          {details.bankName && (
                            <div className="space-y-0.5">
                              <div className="font-medium">{details.bankName}</div>
                              <div className="font-mono text-sm">{details.accountNumber}</div>
                              <div className="text-foreground/60">{details.accountName}</div>
                            </div>
                          )}
                          <p className="text-foreground/60">{details.instructions}</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Payment Type Display (read-only - locked from booking time) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-foreground/70">Payment Type</label>
                  <div className="text-sm font-medium">
                    {booking.paymentType || "Full"} Payment (₱{(booking.paymentType === "Partial" ? calculatePartialPayment(total) : total).toLocaleString()})
                  </div>
                </div>

                {/* File Input */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-foreground/70">Proof Image</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setPaymentFile(e.target.files?.[0] || null)}
                      className="w-full text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                      disabled={uploadingProof}
                    />
                  </div>
                  {paymentFile && (
                    <p className="text-xs text-foreground/60">
                      Selected: {paymentFile.name}
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  size="sm"
                  disabled={uploadingProof || !paymentFile}
                  className="w-full sm:w-auto"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadingProof ? "Uploading..." : "Upload Payment Proof"}
                </Button>
              </form>
            </div>
          )}

          {/* ── Payment Proof Uploaded (Pending status) ── */}
          {status === "Pending" && booking.paymentProofUrl && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-semibold">Payment Proof Submitted</span>
              </div>
              <p className="text-xs text-foreground/70">
                Your payment proof has been uploaded and is awaiting Front Office verification.
              </p>
              {booking.paymentType && (
                <p className="text-xs text-foreground/60">
                  Payment Type: <span className="font-medium">{booking.paymentType}</span>
                </p>
              )}
              {booking.proofUploadedAt && (
                <p className="text-xs text-foreground/50">
                  Uploaded: {formatDateTime(booking.proofUploadedAt)}
                </p>
              )}
            </div>
          )}

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
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
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

      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
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
                      <label className="text-xs font-semibold uppercase text-foreground/70">
                        Cancellation Reason *
                      </label>
                      <textarea 
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
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)} disabled={cancelling}>
              Keep Booking
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={cancelling}>
              {cancelling ? "Cancelling..." : "Yes, Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const QUICK_FILTERS = [
  "All",
  "Active",
  "Awaiting Payment",
  "Past",
];

const FILTER_STATUSES = [
  "Awaiting Payment",
  "Pending",
  "Approved",
  "Cancellation Requested",
  "Checked In",
  "Checked Out",
  "Cancelled",
];

export default function MyBookingsPage() {
  const { user, profile, trainingMode } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("All");
  const [dropdownStatus, setDropdownStatus] = useState("All");
  const [showPastBookings, setShowPastBookings] = useState(false);

  function handleTabChange(tab) {
    setActiveTab(tab);
    setDropdownStatus("All");
    setShowPastBookings(false);
  }

  async function refreshBookings() {
    if (!user?.uid) return;
    try {
      const bookingData = await listBookingsForUser(user.uid, { trainingMode });
      setBookings(sortBookings(bookingData));
    } catch (e) {
      setError(e?.message || "Failed to refresh bookings.");
    }
  }

  useEffect(() => {
    if (!user?.uid) {
      setBookings([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Check for stale bookings (lazy-expiry)
        try {
          await checkAndExpireStaleBookings({ trainingMode });
        } catch (e) {
          console.error("Failed to check stale bookings:", e);
        }

        const [bookingData, roomData] = await Promise.all([
          listBookingsForUser(user.uid, { trainingMode }),
          listRooms({ trainingMode }),
        ]);

        if (!isMounted) return;

        setBookings(sortBookings(bookingData));

        const map = {};
        for (const r of roomData) {
          map[r.id] = r;
        }
        setRoomsMap(map);
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load your bookings.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [user?.uid, trainingMode]);

  useEffect(() => {
    setDropdownStatus("All");
    setShowPastBookings(false);
  }, [activeTab]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = bookings;

    if (activeTab === "Active") {
      result = bookings.filter((b) => ACTIVE_STATUSES.has(b.status));
    } else if (activeTab === "Past") {
      result = bookings.filter((b) => !ACTIVE_STATUSES.has(b.status));
    } else if (activeTab !== "All") {
      result = bookings.filter((b) => b.status === activeTab);
    }

    if (activeTab === "All" && dropdownStatus !== "All") {
      result = result.filter((b) => b.status === dropdownStatus);
    }

    return result;
  }, [bookings, activeTab, dropdownStatus]);

  const activeBookings = useMemo(
    () => filtered.filter((b) => ACTIVE_STATUSES.has(b.status)),
    [filtered],
  );
  const pastBookings = useMemo(
    () => filtered.filter((b) => !ACTIVE_STATUSES.has(b.status)),
    [filtered],
  );

  function countForTab(tab) {
    if (tab === "All") return bookings.length;
    if (tab === "Active") return bookings.filter((b) => ACTIVE_STATUSES.has(b.status)).length;
    if (tab === "Past") return bookings.filter((b) => !ACTIVE_STATUSES.has(b.status)).length;
    return bookings.filter((b) => b.status === tab).length;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">My Bookings</h1>
        <p className="text-foreground/80">
          Your full reservation history — click any booking to view details.
        </p>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      {/* Loading */}
      {loading ? (
        <div className="rounded-xl border border-border bg-background p-8 text-center text-sm text-foreground/50 animate-pulse">
          Loading your bookings…
        </div>
      ) : bookings.length === 0 ? (
        /* Empty state */
        <div className="rounded-xl border border-border bg-background p-10 flex flex-col items-center gap-4 text-center">
          <BedDouble className="h-10 w-10 text-foreground/20" />
          <p className="text-foreground/60 text-sm">
            You haven&apos;t made any bookings yet.
          </p>
          <Button asChild variant="default" size="sm">
            <NavLink to="/rooms">Browse Rooms</NavLink>
          </Button>
        </div>
      ) : (
        <>
          {/* Filter controls */}
          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            {/* Status filter dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{dropdownStatus === "All" ? "All Statuses" : dropdownStatus}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-1 bg-background" align="start">
                {/* All Statuses option */}
                <button
                  type="button"
                  onClick={() => {
                    setDropdownStatus("All");
                    setActiveTab("All");
                  }}
                  className={`w-full text-left rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    dropdownStatus === "All"
                      ? "bg-primary/15 text-foreground font-medium"
                      : "text-foreground/70 hover:bg-surface-hover"
                  }`}
                >
                  All Statuses
                </button>

                <div className="h-px bg-border/60 my-1" />

                {/* Active statuses */}
                <div className="px-2.5 py-1">
                  <span className="text-[10px] font-semibold text-foreground/30 uppercase tracking-wider">Active</span>
                </div>
                {FILTER_STATUSES.filter(s => ACTIVE_STATUSES.has(s)).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setDropdownStatus(status);
                      setActiveTab("All");
                    }}
                    className={`w-full text-left rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                      dropdownStatus === status
                        ? "bg-primary/15 text-foreground font-medium"
                        : "text-foreground/70 hover:bg-surface-hover"
                    }`}
                  >
                    {status}
                  </button>
                ))}

                <div className="h-px bg-border/60 my-1" />

                {/* Past statuses */}
                <div className="px-2.5 py-1">
                  <span className="text-[10px] font-semibold text-foreground/30 uppercase tracking-wider">Past</span>
                </div>
                {FILTER_STATUSES.filter(s => !ACTIVE_STATUSES.has(s)).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setDropdownStatus(status);
                      setActiveTab("All");
                    }}
                    className={`w-full text-left rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                      dropdownStatus === status
                        ? "bg-primary/15 text-foreground font-medium"
                        : "text-foreground/70 hover:bg-surface-hover"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Quick filter tabs */}
            {QUICK_FILTERS.map((tab) => {
              const count = countForTab(tab);
              const isActive = activeTab === tab && (tab !== "All" || dropdownStatus === "All");
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabChange(tab)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
                  }`}
                >
                  {tab}
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs leading-none ${
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted/20 text-foreground/50"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Booking list */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-background p-8 text-center text-sm text-foreground/50">
              No {activeTab.toLowerCase()} bookings found.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Bookings */}
              {activeBookings.length > 0 && (
                <div className="space-y-3">
                  {activeTab === "All" && (
                    <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">
                      Active
                    </h2>
                  )}
                  {activeBookings.map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      room={roomsMap[b.roomId] || { id: b.roomId, isActive: false }}
                      trainingMode={trainingMode}
                      userProfile={profile}
                      onCancelled={refreshBookings}
                    />
                  ))}
                </div>
              )}

              {/* Past Bookings — collapsed by default when viewing All */}
              {pastBookings.length > 0 && activeTab === "All" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border/60" />
                    <button
                      type="button"
                      onClick={() => setShowPastBookings(!showPastBookings)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/40 uppercase tracking-wider hover:text-foreground/60 transition-colors"
                    >
                      Past Bookings ({pastBookings.length})
                      <ChevronDown className={`h-3 w-3 transition-transform ${showPastBookings ? "rotate-180" : ""}`} />
                    </button>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                  {showPastBookings && pastBookings.map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      room={roomsMap[b.roomId] || { id: b.roomId, isActive: false }}
                      trainingMode={trainingMode}
                      userProfile={profile}
                      onCancelled={refreshBookings}
                    />
                  ))}
                </div>
              )}

              {/* Past Bookings — shown directly when filtering to Past status */}
              {pastBookings.length > 0 && activeTab !== "All" && (
                <div className="space-y-3">
                  {pastBookings.map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      room={roomsMap[b.roomId] || { id: b.roomId, isActive: false }}
                      trainingMode={trainingMode}
                      userProfile={profile}
                      onCancelled={refreshBookings}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Browse CTA at bottom */}
          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <NavLink to="/rooms">Browse More Rooms</NavLink>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
