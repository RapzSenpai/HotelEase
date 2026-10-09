import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDate, formatCurrency } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import {
  BOOKINGS_PAGE_SIZE,
  getBooking,
  subscribeToBookingsPage,
  approveCancellation,
  rejectCancellation} from "@/services/bookingsService";
import {
  REFUND_METHODS,
  approveRefund,
  canMarkRefundPaid,
  computeRefund,
  defaultRefundMethod,
  markRefundPaid,
  refundMethodCopy,
  refundMethodNeedsReference,
  rejectRefund,
  requestRefund,
  subscribeToRefunds,
  validateRefundReference} from "@/services/refundsService";
import { listPaymentsForBooking } from "@/services/paymentsService";
// Policy inputs shared with the guest cancel dialog — one rule, both screens.
import { deadlineFor, oneNightFor } from "@/lib/refund-policy";
import { listRooms } from "@/services/roomsService";
import { getUserDoc } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// A refund only carries a reason when the amount needed explaining — the
// non-refundable override. "Guest cancellation refund" was a constant every
// auto-created refund repeated, and older records stored an auto-written
// "Cancel refund (suggested …)" line whose amount is already on the card, so
// both render as no reason box at all.
function refundReason(reason) {
  const text = String(reason ?? "").trim();
  if (!text) return null;
  return /^cancel refund \(suggested/i.test(text) ? null : text;
}

// ─── Cancellation Request Card ────────────────────────────────────────────────

function CancellationCard({
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
  onSubmitReject}) {
  return (
    <div className="rounded-xl border border-border bg-background px-5 py-3.5">
      {/* ── Top row: details left · status right ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">{guestName || booking.guestName || booking.guestId || "—"}</p>
          <p className="mt-0.5 text-[13px] tabular-nums text-foreground/60">
            {roomLabel} · {formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)} · {formatCurrency(booking.totalCost)}
          </p>
        </div>
        <Badge variant="warning" className="shrink-0">
          {booking.status}
        </Badge>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
        {(booking.leadGuestEmail || booking.leadGuestPhone) ? (
          <p className="text-xs text-foreground/50">
            {[booking.leadGuestEmail, booking.leadGuestPhone].filter(Boolean).join(" · ")}
          </p>
        ) : <span />}
        <p className="text-xs tabular-nums text-foreground/55">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/50">Requested At:</span>{" "}
          {formatDate(booking.cancellationRequestedAt)}
        </p>
      </div>

      {/* ── Cancellation Reason ── */}
      {booking.cancellationReason && (
        <div className="mt-2 rounded-md border border-warning/20 bg-warning/5 px-3 py-1.5 text-[13px] text-foreground/80">
          <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            Cancellation Reason
          </p>
          <p>{booking.cancellationReason}</p>
        </div>
      )}

      {/* ── Actions (bottom right) ── */}
      {!isRejectingThis && (
        <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
          <Button
            size="sm"
            disabled={isActing}
            onClick={onApprove}
            className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
          >
            <Check className="h-3 w-3" />
            {isActing ? "Approving…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isActing}
            onClick={onOpenReject}
            className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
          >
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      )}

      {/* ── Inline Reject Form ── */}
      {isRejectingThis && (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          <p className="text-[13px] font-medium text-foreground">
            Rejection Reason{" "}
            <span className="text-xs font-normal text-foreground/50">(required)</span>
          </p>
          <textarea
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-foreground/45 focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/10"
            rows={2}
            placeholder="Please provide a brief reason for rejecting this cancellation..."
            value={rejectReason}
            onChange={(e) => onRejectReasonChange(e.target.value)}
            disabled={isActing}
          />
          <div className="flex items-center gap-1.5 justify-end">
            <Button
              size="sm"
              variant="ghost"
              disabled={isActing}
              onClick={onCancelReject}
              className="h-7 px-2.5 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isActing || !rejectReason.trim()}
              onClick={onSubmitReject}
              className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
            >
              <X className="h-3 w-3" />
              {isActing ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Module-level id-keyed cache so re-renders never refetch.
const refundBookingCache = new Map();

function RefundIdentity({ refund, roomsMap, guestsMap}) {
  const [booking, setBooking] = useState(null);
  useEffect(() => {
    if (!refund?.bookingId) return;
    const key = `live:${refund.bookingId}`;
    if (refundBookingCache.has(key)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cache sync on id/mode change, mirrors FoBookingsPage history load
      setBooking(refundBookingCache.get(key));
      return;
    }
    let cancelled = false;
    getBooking(refund.bookingId)
      .then((b) => {
        refundBookingCache.set(key, b || null);
        if (!cancelled) setBooking(b || null);
      })
      .catch(() => {
        if (!cancelled) setBooking(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refund?.bookingId]);

  if (!booking) {
    return (
      <span className="block truncate text-[13px] font-medium text-foreground" title={refund?.bookingId || ""}>
        Booking: {refund?.bookingId || "—"}
      </span>
    );
  }
  const guest = guestsMap?.[booking.guestId] || booking.guestName || null;
  const room = roomLabelFrom(roomsMap, booking.roomId, "");
  const label = [guest, room].filter(Boolean).join(" · ");
  return (
    <span className="block truncate text-[13px] font-medium text-foreground" title={refund?.bookingId || ""}>
      {label || `Booking: ${refund?.bookingId || "—"}`}
    </span>
  );
}

function RefundHistoryRow({ refund, roomsMap, guestsMap}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide refund details" : "Show refund details"}
        >
          <Badge variant={refund.status === "Paid" ? "success" : "destructive"} className="shrink-0">
            {refund.status}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            <RefundIdentity refund={refund} roomsMap={roomsMap} guestsMap={guestsMap} />
          </span>
        </button>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(refund.amount)}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-foreground/50 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>
      {expanded && (
        <div className="space-y-1.5 border-t border-dashed border-border/60 px-3 py-3 text-sm">
          {refundReason(refund.reason) ? (
            <p className="text-xs text-foreground/60">
              {refundReason(refund.reason)}
              {refund.createdAt ? ` · ${formatDate(refund.createdAt)}` : ""}
            </p>
          ) : null}
          <p className="text-xs tabular-nums text-foreground/60">
            {refund.method || "GCash"} · Fee: {formatCurrency(refund.fee ?? 0)}
            {refund.referenceNumber ? ` · Ref: ${refund.referenceNumber}` : ""}
            {!refund.referenceNumber && refund.referenceNote ? ` · Note: ${refund.referenceNote}` : ""}
          </p>
          {refund.rejectReason ? (
            <p className="text-xs text-destructive">Rejected: {refund.rejectReason}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RefundCard({
  refund,
  roomsMap,
  guestsMap,
  refValue,
  onRefChange,
  noteValue,
  onNoteChange,
  rejectOpen,
  rejectReason,
  onRejectReasonChange,
  isActing,
  onApprove,
  onMarkPaid,
  onOpenReject,
  onCancelReject,
  onSubmitReject}) {
  return (
    <div className="rounded-xl border border-border bg-background px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <RefundIdentity refund={refund} roomsMap={roomsMap} guestsMap={guestsMap} />
          <p className="mt-0.5 text-[13px] tabular-nums text-foreground/60">{formatCurrency(refund.amount)} · {refund.method || "GCash"} · Fee: {formatCurrency(refund.fee ?? 0)}{refund.referenceNumber ? ` · Ref: ${refund.referenceNumber}` : refund.referenceNote ? ` · Note: ${refund.referenceNote}` : ""}</p>
        </div>
        <Badge variant={refund.status === "Paid" ? "default" : refund.status === "Rejected" ? "destructive" : "warning"} className="shrink-0">
          {refund.status}
        </Badge>
      </div>
      {refundReason(refund.reason) ? (
        <div className="mt-2 rounded-md border border-warning/20 bg-warning/5 px-3 py-1.5 text-[13px] text-foreground/80">
          <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            Refund Reason
          </p>
          <p>{refundReason(refund.reason)}{refund.createdAt ? <span className="text-foreground/55"> · {formatDate(refund.createdAt)}</span> : null}</p>
        </div>
      ) : null}
      {refund.rejectReason ? (
        <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[13px]">
          <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            Rejection Reason
          </p>
          <p className="text-destructive">{refund.rejectReason}</p>
        </div>
      ) : null}
      {refund.status === "Approved" && !rejectOpen && (
        <div className="mt-2 rounded-md border border-border bg-background px-3 py-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            {refundMethodNeedsReference(refund.method) ? "Transfer Reference" : "Refund Record (optional reference)"}
          </p>
          <input
            className="h-7 w-full rounded-lg border border-border bg-background px-3 text-[13px] tabular-nums"
            placeholder={refundMethodNeedsReference(refund.method)
              ? `${refund.method || "GCash"} ref no. (required)`
              : "OR no. / bank ref (optional)"}
            value={refValue}
            onChange={(e) => onRefChange(e.target.value)}
            disabled={isActing}
          />
          {!refundMethodNeedsReference(refund.method) && (
            <input
              className="mt-1.5 h-7 w-full rounded-lg border border-border bg-background px-3 text-[13px]"
              placeholder="Note — e.g. OR #1234, received by A. Cruz (required without a ref)"
              value={noteValue}
              onChange={(e) => onNoteChange(e.target.value)}
              disabled={isActing}
            />
          )}
        </div>
      )}
      {(refund.status === "Pending" || refund.status === "Approved") && !rejectOpen && (
        <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
          {refund.status === "Pending" ? (
            <Button size="sm" disabled={isActing} onClick={onApprove} className="h-7 gap-1.5 px-2.5 text-xs shadow-sm">
              <Check className="h-3 w-3" />
              {isActing ? "Approving…" : "Approve"}
            </Button>
          ) : (
            <Button size="sm" disabled={!canMarkRefundPaid({
              isActing,
              method: refund.method,
              referenceNumber: refValue,
              note: noteValue})} onClick={onMarkPaid} className="h-7 px-2.5 text-xs shadow-sm">
              {isActing ? "Marking…" : "Mark Paid"}
            </Button>
          )}
          <Button size="sm" variant="destructive" disabled={isActing} onClick={onOpenReject} className="h-7 gap-1.5 px-2.5 text-xs shadow-sm">
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      )}
      {rejectOpen && (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          <p className="text-[13px] font-medium">Reject reason (required)</p>
          <textarea
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
            rows={2}
            value={rejectReason}
            onChange={(e) => onRejectReasonChange(e.target.value)}
            disabled={isActing}
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" disabled={isActing} onClick={onCancelReject} className="h-7 px-2.5 text-xs">Cancel</Button>
            <Button size="sm" variant="destructive" disabled={isActing || !rejectReason.trim()} onClick={onSubmitReject} className="h-7 px-2.5 text-xs shadow-sm">
              {isActing ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FoCancellationsPage() {
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState("requests");
  const [searchParams] = useSearchParams();
  const deepTab = searchParams.get("tab");
  const deepBookingId = searchParams.get("bookingId");
  const deepLinkAppliedRef = useRef(null);
  const [bookings, setBookings] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [guestsMap, setGuestsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [showPastRefunds, setShowPastRefunds] = useState(false);
  const [rejecting, setRejecting] = useState(null); // { bookingId, reason }
  const [actionLoading, setActionLoading] = useState(null); // bookingId currently acting on
  const [suggestions, setSuggestions] = useState([]);
  const [creatingRefund, setCreatingRefund] = useState(null);
  const [refundActionLoading, setRefundActionLoading] = useState(null);
  const [refundRejecting, setRefundRejecting] = useState(null); // { refundId, reason }
  const [refundRefs, setRefundRefs] = useState({});
  // Cash/OTC refunds have no transfer reference — the audit trail is a note
  // (OR number, who handed the money over) instead of a fabricated ref.
  const [refundNotes, setRefundNotes] = useState({});
  // P2 scalability: bounded status-scoped window (queue is inherently small).
  const [pageSize, setPageSize] = useState(BOOKINGS_PAGE_SIZE);
  // Guest-name cache mirror: on-demand getUserDoc per visible guest, "" resolved.
  const guestsMapRef = useRef({});

  // ── Fetch rooms for name mapping (rooms are tens, not thousands) ──
  useEffect(() => {
    let isMounted = true;
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
        console.error("[FoCancellationsPage] Failed to load resources:", err);
      }
    }
    loadResources();
    return () => { isMounted = false; };
  }, []);

  // Resolve display names for guests visible in the current window.
  async function ensureGuestNames(list) {
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
    entries.forEach(([id, name]) => {
      guestsMapRef.current[id] = name;
    });
    setGuestsMap({ ...guestsMapRef.current });
  }

  // Guest-name cache clears only on training-mode switch — "Show more" must
  // reuse already-resolved names instead of refetching them.
  useEffect(() => {
    guestsMapRef.current = {};
    setGuestsMap({});
  }, []);

  // Bell deep-link (?tab=requests|refunds&bookingId=): switch to the right
  // tab one-shot, expand past refunds if the target sits there, scroll to
  // the card. The highlight persists while the param is present.
  useEffect(() => {
    if (loading) return;
    if (deepTab !== "requests" && deepTab !== "refunds") return;
    const key = `${deepTab}:${deepBookingId ?? ""}`;
    if (deepLinkAppliedRef.current === key) return;
    deepLinkAppliedRef.current = key;
    setActiveTab(deepTab);
    if (deepTab === "refunds" && deepBookingId) {
      const inPast = refunds.some(
        (r) => r.bookingId === deepBookingId && r.status !== "Pending" && r.status !== "Approved");
      if (inPast) setShowPastRefunds(true);
    }
    if (deepBookingId) {
      const t = setTimeout(() => {
        document.getElementById(`fo-cancel-${deepBookingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
      return () => clearTimeout(t);
    }
  }, [deepTab, deepBookingId, loading, bookings, refunds]);

  // ── Real-time subscription: cancellation queue only ──
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToBookingsPage(
      { status: "Cancellation Requested", pageSize},
      (data) => {
        setBookings(data);
        setLoading(false);
        ensureGuestNames(data);
      });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ pageSize]);

  useEffect(() => {
    const unsub = subscribeToRefunds((data) => setRefunds(data));
    return () => unsub();
  }, []);

  // ── Filtered list (server already scoped; client filter is a backstop) ──
  const filtered = bookings.filter((b) => b.status === "Cancellation Requested");
  const pendingRefundCount = refunds.filter((r) => r.status === "Pending").length;

  // ── Action handlers ──
  async function handleApprove(booking) {
    const bookingId = typeof booking === "string" ? booking : booking?.id;
    setActionLoading(bookingId);
    try {
      await approveCancellation(bookingId);
      toast.success("Cancellation request approved! No auto-refund — create one below if due.");
      // Suggest a Pending refund (manual two-step, never auto-created).
      try {
        const full = typeof booking === "string"
          ? bookings.find((b) => b.id === bookingId)
          : booking;
        const recs = await listPaymentsForBooking(bookingId);
        const paid = recs.reduce((s, p) => s + Number(p.amount ?? 0), 0);
        const rateType = full?.rateType || "Standard";
        const { fee, refund, reason } = computeRefund({
          paid,
          rateType,
          cancelTime: full?.cancellationRequestedAt || new Date(),
          deadline: deadlineFor(full),
          oneNightRate: oneNightFor(full)});
        setSuggestions((prev) => [
          {
            bookingId,
            paid,
            fee,
            refund,
            reason,
            rateType,
            amount: refund,
            overrideReason: "",
            paymentMethod: full?.paymentMethod || null,
            refundMethod: defaultRefundMethod(recs.map((r) => r.method))},
          ...prev.filter((s) => s.bookingId !== bookingId),
        ]);
      } catch (e) {
        console.error("[FoCancellationsPage] refund suggestion failed:", e);
      }
    } catch (err) {
      toast.error(err?.message || "Failed to approve cancellation.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateRefund(s) {
    const amount = Number(s.amount ?? s.refund ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Refund amount must be positive.");
      return;
    }
    if (s.rateType === "NonRefundable" && !String(s.overrideReason ?? "").trim()) {
      toast.error("Override reason is required for non-refundable rate.");
      return;
    }
    setCreatingRefund(s.bookingId);
    try {
      const res = await requestRefund({
        bookingId: s.bookingId,
        amount,
        fee: s.fee ?? 0,
        method: s.refundMethod || defaultRefundMethod([]),
        // No placeholder reason for the normal path — the queue only shows a
        // reason box when the amount was overridden on a non-refundable rate.
        reason: s.rateType === "NonRefundable" ? `Override: ${s.overrideReason}` : ""});
      if (res?.notified === false) {
        toast.warning("Pending refund created, but the guest notification failed — check console.");
      } else {
        toast.success("Pending refund created. Guest notified.");
      }
      setSuggestions((prev) => prev.filter((x) => x.bookingId !== s.bookingId));
      setActiveTab("refunds");
    } catch (err) {
      toast.error(err?.message || "Failed to create refund.");
    } finally {
      setCreatingRefund(null);
    }
  }

  async function handleApproveRefund(refundId) {
    setRefundActionLoading(refundId);
    try {
      const res = await approveRefund(refundId, { processedBy: profile?.email || profile?.fullName || null});
      if (res?.notified === false) {
        toast.warning("Refund approved, but the guest notification failed — check console.");
      } else {
        toast.success("Refund approved. Guest notified — mark paid once the money is sent.");
      }
    } catch (err) {
      toast.error(err?.message || "Failed to approve refund.");
    } finally {
      setRefundActionLoading(null);
    }
  }

  async function handleMarkPaidRefund(refundId) {
    const refund = refunds.find((r) => r.id === refundId);
    const check = validateRefundReference({
      method: refund?.method,
      referenceNumber: refundRefs[refundId],
      note: refundNotes[refundId]});
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setRefundActionLoading(refundId);
    try {
      const res = await markRefundPaid(refundId, {
        referenceNumber: check.referenceNumber,
        note: check.note,
        processedBy: profile?.email || profile?.fullName || null});
      if (res?.notified === false) {
        toast.warning("Refund marked paid, but the guest notification failed — check console.");
      } else {
        toast.success("Refund marked paid. Guest notified.");
      }
      setRefundRefs((prev) => ({ ...prev, [refundId]: "" }));
      setRefundNotes((prev) => ({ ...prev, [refundId]: "" }));
    } catch (err) {
      toast.error(err?.message || "Failed to mark refund paid.");
    } finally {
      setRefundActionLoading(null);
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
    if (!reason.trim()) {
        toast.error("Rejection reason is required.");
        return;
    }
    setActionLoading(bookingId);
    try {
      await rejectCancellation(bookingId, reason);
      toast.success("Cancellation request rejected.");
      setRejecting(null);
    } catch (err) {
      toast.error(err?.message || "Failed to reject cancellation.");
    } finally {
      setActionLoading(null);
    }
  }

  function handleOpenRefundReject(refundId) {
    setRefundRejecting({ refundId, reason: "" });
  }

  async function handleSubmitRefundReject() {
    if (!refundRejecting) return;
    const { refundId, reason } = refundRejecting;
    if (!reason.trim()) {
      toast.error("Rejection reason is required.");
      return;
    }
    setRefundActionLoading(refundId);
    try {
      const res = await rejectRefund(refundId, reason, {
        processedBy: profile?.email || profile?.fullName || null});
      if (res?.notified === false) {
        toast.warning("Refund rejected, but the guest notification failed — check console.");
      } else {
        toast.success("Refund rejected. Guest notified.");
      }
      setRefundRejecting(null);
    } catch (err) {
      toast.error(err?.message || "Failed to reject refund.");
    } finally {
      setRefundActionLoading(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="font-playfair text-3xl font-semibold">Cancellations</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Review guest requests to cancel approved bookings.
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "requests"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
          }`}
        >
          Cancellation Requests
          {filtered.length > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("refunds")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "refunds"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
          }`}
        >
          Refunds
          {pendingRefundCount > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          )}
        </button>
      </div>

      {/* ── Post-approve suggestions (manual two-step, never auto-refund) ── */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s) => (
            <div key={s.bookingId} className="rounded-xl border border-border bg-background px-4 py-3 text-[13px] shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">
                    Refund suggested {formatCurrency(s.refund)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-foreground/55">
                    Paid {formatCurrency(s.paid)} − cancellation fee {formatCurrency(s.fee)}
                  </p>
                  {s.reason ? (
                    <p className="mt-0.5 text-xs text-foreground/55">{s.reason}</p>
                  ) : null}
                </div>
                {s.refund <= 0 ? (
                  <p className="text-foreground/60">
                    {(s.paymentMethod === "Over-the-Counter" || s.paymentMethod === "Credit/Debit Card") && !(s.paid > 0)
                      ? `No recorded payments (${s.paymentMethod} — collected at arrival). Nothing to refund.`
                      : "No refund due."}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max={s.paid}
                      aria-label="Refund amount"
                      className="h-7 w-28 rounded-lg border border-border bg-background px-2 text-[13px] tabular-nums"
                      value={s.amount}
                      onChange={(e) => setSuggestions((prev) => prev.map((x) => x.bookingId === s.bookingId ? { ...x, amount: e.target.value } : x))}
                    />
                    <select
                      aria-label="Refund method"
                      className="h-7 rounded-lg border border-border bg-background px-2 text-[13px]"
                      value={s.refundMethod}
                      onChange={(e) => setSuggestions((prev) => prev.map((x) => x.bookingId === s.bookingId ? { ...x, refundMethod: e.target.value } : x))}
                    >
                      {REFUND_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <Button size="sm" disabled={creatingRefund === s.bookingId} onClick={() => handleCreateRefund(s)} className="h-7 px-2.5 text-xs shadow-sm">
                      {creatingRefund === s.bookingId ? "Creating…" : "Create"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSuggestions((prev) => prev.filter((x) => x.bookingId !== s.bookingId))} className="h-7 px-2.5 text-xs">
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
              {s.refund > 0 && (
                <p className="mt-1.5 text-xs text-foreground/45">
                  Refunds are sent manually {refundMethodCopy(s.refundMethod)}. Default follows how
                  the guest paid ({s.paymentMethod || "—"}) — change it if they asked for something else.
                  {refundMethodNeedsReference(s.refundMethod)
                    ? " A reference number is required when you mark it paid."
                    : " No reference is required; log an OR number or note when you mark it paid."}
                </p>
              )}
              {s.refund > 0 && s.rateType === "NonRefundable" && (
                <input
                  className="mt-2 h-7 w-full rounded-lg border border-border bg-background px-2 text-[13px]"
                  placeholder="Override reason (required)"
                  value={s.overrideReason}
                  onChange={(e) => setSuggestions((prev) => prev.map((x) => x.bookingId === s.bookingId ? { ...x, overrideReason: e.target.value } : x))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {activeTab === "requests" ? (
        loading ? (
          <div className="py-20 text-center text-sm text-foreground/50">
            Loading cancellation requests…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-background p-12 text-center text-sm text-foreground/50">
            No pending cancellation requests found.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((booking) => {
              const roomName = roomLabelFrom(roomsMap, booking.roomId);
              const isActing = actionLoading === booking.id;
              const isRejectingThis = rejecting?.bookingId === booking.id;

              return (
                <div
                  key={booking.id}
                  id={`fo-cancel-${booking.id}`}
                  className={`scroll-mt-24 rounded-xl transition-shadow ${deepBookingId === booking.id ? "ring-2 ring-primary/50" : ""}`}
                >
                <CancellationCard
                  booking={booking}
                  roomLabel={roomName}
                  guestName={guestsMap[booking.guestId]}
                  isActing={isActing}
                  isRejectingThis={isRejectingThis}
                  rejectReason={isRejectingThis ? rejecting.reason : ""}
                  onApprove={() => handleApprove(booking)}
                  onOpenReject={() => handleOpenReject(booking.id)}
                  onCancelReject={handleCancelReject}
                  onRejectReasonChange={handleRejectReasonChange}
                  onSubmitReject={handleSubmitReject}
                />
                </div>
              );
            })}
            {bookings.length >= pageSize && (
              <div className="flex justify-center pt-1">
                <Button variant="outline" size="sm" onClick={() => setPageSize((n) => n + BOOKINGS_PAGE_SIZE)}>
                  Show more (+{BOOKINGS_PAGE_SIZE})
                </Button>
              </div>
            )}
          </div>
        )
      ) : refunds.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center text-sm text-foreground/50">
          No refunds yet.
        </div>
      ) : (
        <div className="space-y-3">
          {refunds
            .filter((r) => r.status === "Pending" || r.status === "Approved")
            .map((refund) => (
              <div
                key={refund.id}
                id={`fo-cancel-${refund.bookingId}`}
                className={`scroll-mt-24 rounded-xl transition-shadow ${deepBookingId && deepBookingId === refund.bookingId ? "ring-2 ring-primary/50" : ""}`}
              >
              <RefundCard
                refund={refund}
                roomsMap={roomsMap}
                guestsMap={guestsMap}
                refValue={refundRefs[refund.id] ?? ""}
              onRefChange={(v) => setRefundRefs((prev) => ({ ...prev, [refund.id]: v }))}
              noteValue={refundNotes[refund.id] ?? ""}
              onNoteChange={(v) => setRefundNotes((prev) => ({ ...prev, [refund.id]: v }))}
              rejectOpen={refundRejecting?.refundId === refund.id}
              rejectReason={refundRejecting?.refundId === refund.id ? refundRejecting.reason : ""}
              onRejectReasonChange={(v) => setRefundRejecting((prev) => (prev ? { ...prev, reason: v } : prev))}
              isActing={refundActionLoading === refund.id}
              onApprove={() => handleApproveRefund(refund.id)}
              onMarkPaid={() => handleMarkPaidRefund(refund.id)}
              onOpenReject={() => handleOpenRefundReject(refund.id)}
              onCancelReject={() => setRefundRejecting(null)}
              onSubmitReject={handleSubmitRefundReject}
            />
              </div>
          ))}
          {refunds.some((r) => r.status !== "Pending" && r.status !== "Approved") && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border/60" />
                <button
                  type="button"
                  onClick={() => setShowPastRefunds((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/40 uppercase tracking-wider hover:text-foreground/60 transition-colors"
                >
                  Past Refunds ({refunds.filter((r) => r.status !== "Pending" && r.status !== "Approved").length})
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${
                      showPastRefunds ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              {showPastRefunds && (
                <div className="space-y-2">
                  {refunds
                    .filter((r) => r.status !== "Pending" && r.status !== "Approved")
                    .map((refund) => (
                      <div
                        key={refund.id}
                        id={`fo-cancel-${refund.bookingId}`}
                        className={`scroll-mt-24 rounded-xl transition-shadow ${deepBookingId && deepBookingId === refund.bookingId ? "ring-2 ring-primary/50" : ""}`}
                      >
                      <RefundHistoryRow
                        refund={refund}
                        roomsMap={roomsMap}
                        guestsMap={guestsMap}
                      />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
