import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";
import {
  REFUND_METHODS,
  refundMethodNeedsReference,
  refundSuggestion,
  refundableFor,
  validateDemoRefundProof,
} from "./foDemoData";

function guestNameFor(usersById, booking) {
  return usersById[booking?.guestId]?.fullName || booking?.guestName || "Guest";
}

function CancellationCard({
  booking,
  roomLabel,
  guestName,
  rejecting,
  rejectReason,
  onApprove,
  onOpenReject,
  onCancelReject,
  onRejectReasonChange,
  onSubmitReject,
}) {
  return (
    <Card className="px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">{guestName}</p>
          <p className="mt-0.5 text-[13px] tabular-nums text-foreground/60">
            {roomLabel} · {formatDate(booking.checkInDate.toDate())} → {formatDate(booking.checkOutDate.toDate())} · {formatCurrency(booking.totalCost)}
          </p>
        </div>
        <Badge variant="warning" className="shrink-0">
          {booking.status}
        </Badge>
      </div>

      {booking.cancellationReason && (
        <div className="mt-2 rounded-md border border-warning/20 bg-warning/5 px-3 py-1.5 text-[13px] text-foreground/80">
          <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            Cancellation Reason
          </p>
          <p>{booking.cancellationReason}</p>
        </div>
      )}

      {!rejecting && (
        <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
          <Button size="sm" onClick={onApprove} className="h-7 gap-1.5 px-2.5 text-xs shadow-sm">
            <Check className="h-3 w-3" />
            Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={onOpenReject} className="h-7 gap-1.5 px-2.5 text-xs shadow-sm">
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      )}

      {rejecting && (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          <p className="text-[13px] font-medium">
            Rejection Reason <span className="text-xs font-normal text-foreground/50">(required)</span>
          </p>
          <textarea
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-foreground/45 focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/10"
            rows={2}
            placeholder="Brief reason for rejecting this cancellation..."
            value={rejectReason}
            onChange={(e) => onRejectReasonChange(e.target.value)}
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={onCancelReject} className="h-7 px-2.5 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={onSubmitReject}
              className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
            >
              <X className="h-3 w-3" />
              Confirm Reject
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RefundCard({
  refund,
  booking,
  guestName,
  roomLabel,
  reference,
  onReferenceChange,
  note,
  onNoteChange,
  rejecting,
  rejectReason,
  onRejectReasonChange,
  onApprove,
  onMarkPaid,
  onOpenReject,
  onCancelReject,
  onSubmitReject,
}) {
  const needsReference = refundMethodNeedsReference(refund.method);
  const canMarkPaid = validateDemoRefundProof({
    method: refund.method,
    referenceNumber: reference,
    note,
  }).ok;

  return (
    <Card className="px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">
            {guestName} · {roomLabel}
          </p>
          <p className="mt-0.5 text-[13px] tabular-nums text-foreground/60">
            {formatCurrency(refund.amount)} · {refund.method} · Fee: {formatCurrency(refund.fee ?? 0)}
            {refund.referenceNumber ? ` · Ref: ${refund.referenceNumber}` : ""}
            {!refund.referenceNumber && refund.note ? ` · Note: ${refund.note}` : ""}
          </p>
          {booking ? (
            <p className="text-xs tabular-nums text-foreground/45">
              Stay {formatDate(booking.checkInDate.toDate())} → {formatDate(booking.checkOutDate.toDate())}
            </p>
          ) : null}
        </div>
        <Badge
          variant={refund.status === "Paid" ? "success" : refund.status === "Rejected" ? "danger" : "warning"}
          className="shrink-0"
        >
          {refund.status}
        </Badge>
      </div>

      {refund.reason ? (
        <div className="mt-2 rounded-md border border-warning/20 bg-warning/5 px-3 py-1.5 text-[13px] text-foreground/80">
          <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            Refund Reason
          </p>
          <p>
            {refund.reason}
            {refund.createdAt ? <span className="text-foreground/55"> · {formatDate(refund.createdAt.toDate())}</span> : null}
          </p>
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

      {refund.status === "Approved" && !rejecting && (
        <div className="mt-2 rounded-md border border-border bg-background px-3 py-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-foreground/50">
            {needsReference ? "Transfer Reference" : "Refund Record (optional reference)"}
          </p>
          <Input
            className="h-7 rounded-lg px-3 text-[13px] tabular-nums"
            placeholder={needsReference ? `${refund.method} ref no. (required)` : "OR no. / bank ref (optional)"}
            value={reference}
            onChange={(e) => onReferenceChange(e.target.value)}
            aria-label="Refund reference"
          />
          {!needsReference && (
            <Input
              className="mt-1.5 h-7 rounded-lg px-3 text-[13px]"
              placeholder="Note — e.g. OR #1234, received by A. Cruz (required without a ref)"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              aria-label="Refund note"
            />
          )}
        </div>
      )}

      {(refund.status === "Pending" || refund.status === "Approved") && !rejecting && (
        <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
          {refund.status === "Pending" ? (
            <Button size="sm" onClick={onApprove} className="h-7 gap-1.5 px-2.5 text-xs shadow-sm">
              <Check className="h-3 w-3" />
              Approve
            </Button>
          ) : (
            <Button size="sm" disabled={!canMarkPaid} onClick={onMarkPaid} className="h-7 px-2.5 text-xs shadow-sm">
              Mark Paid
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={onOpenReject} className="h-7 gap-1.5 px-2.5 text-xs shadow-sm">
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      )}

      {rejecting && (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          <p className="text-[13px] font-medium">
            Rejection Reason <span className="text-xs font-normal text-foreground/50">(required)</span>
          </p>
          <textarea
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-foreground/45 focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/10"
            rows={2}
            placeholder="Brief reason for rejecting this refund..."
            value={rejectReason}
            onChange={(e) => onRejectReasonChange(e.target.value)}
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={onCancelReject} className="h-7 px-2.5 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={onSubmitReject}
              className="h-7 px-2.5 text-xs shadow-sm"
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RefundHistoryRow({ refund, booking, guestName, roomLabel }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <Badge variant={refund.status === "Paid" ? "success" : "danger"} className="shrink-0">
          {refund.status}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {guestName} · {roomLabel}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatCurrency(refund.amount)}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-foreground/50 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="space-y-1.5 border-t border-dashed border-border/60 px-3 py-3 text-sm">
          {refund.reason ? (
            <p className="text-xs text-foreground/60">
              {refund.reason}
              {refund.createdAt ? ` · ${formatDate(refund.createdAt.toDate())}` : ""}
            </p>
          ) : null}
          <p className="text-xs tabular-nums text-foreground/60">
            {refund.method} · Fee: {formatCurrency(refund.fee ?? 0)}
            {refund.referenceNumber ? ` · Ref: ${refund.referenceNumber}` : ""}
            {!refund.referenceNumber && refund.note ? ` · Note: ${refund.note}` : ""}
          </p>
          {booking ? (
            <p className="text-xs tabular-nums text-foreground/45">
              Stay {formatDate(booking.checkInDate.toDate())} → {formatDate(booking.checkOutDate.toDate())}
            </p>
          ) : null}
          {refund.rejectReason ? (
            <p className="text-xs text-destructive">Rejected: {refund.rejectReason}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function DemoFoCancellations() {
  const { data, fo } = useDemo();
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
  const bookingsById = Object.fromEntries(data.bookings.map((b) => [b.id, b]));
  const usersById = Object.fromEntries(data.users.map((u) => [u.id, u]));

  const [activeTab, setActiveTab] = useState("requests");
  const [suggestions, setSuggestions] = useState([]);
  const [rejecting, setRejecting] = useState(null);
  const [refundRejecting, setRefundRejecting] = useState(null);
  const [refValues, setRefValues] = useState({});
  const [noteValues, setNoteValues] = useState({});
  const [showPast, setShowPast] = useState(false);

  const requests = data.bookings.filter((b) => b.status === "Cancellation Requested");
  const activeRefunds = data.refunds.filter(
    (r) => r.status === "Pending" || r.status === "Approved",
  );
  const pastRefunds = data.refunds.filter(
    (r) => r.status !== "Pending" && r.status !== "Approved",
  );

  function approveCancellation(booking) {
    const suggestion = refundSuggestion(booking, data.payments);
    setSuggestions((prev) => [
      {
        bookingId: booking.id,
        roomLabel: roomLabelFrom(roomsById, booking.roomId),
        ...suggestion,
        amount: String(suggestion.refund),
      },
      ...prev.filter((s) => s.bookingId !== booking.id),
    ]);
    fo.demoApproveCancellation({ bookingId: booking.id });
    toast.success("Demo: cancellation approved. Guest notified.");
  }

  function submitCancellationReject() {
    if (!rejecting) return;
    fo.demoRejectCancellation(rejecting);
    toast.success("Demo: cancellation rejected. Guest notified.");
    setRejecting(null);
  }

  function createRefund(suggestion) {
    const amount = Number(suggestion.amount);
    const max = refundableFor(suggestion.bookingId, data.payments, data.refunds);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Refund amount must be positive.");
      return;
    }
    if (amount > max + 0.01) {
      toast.error(`Refund cannot exceed the refundable balance of ${formatCurrency(max)}.`);
      return;
    }
    fo.demoCreateRefund({
      bookingId: suggestion.bookingId,
      amount,
      fee: suggestion.fee,
      method: suggestion.method,
      reason: suggestion.reason,
    });
    setSuggestions((prev) => prev.filter((s) => s.bookingId !== suggestion.bookingId));
    setActiveTab("refunds");
    toast.success("Demo: pending refund created. Guest notified.");
  }

  function approveRefund(refundId) {
    fo.demoApproveRefund({ refundId });
    toast.success("Demo: refund approved. Mark it paid once the money is sent.");
  }

  function markRefundPaid(refund) {
    const proof = validateDemoRefundProof({
      method: refund.method,
      referenceNumber: refValues[refund.id],
      note: noteValues[refund.id],
    });
    if (!proof.ok) {
      toast.error(proof.error);
      return;
    }
    fo.demoMarkRefundPaid({
      refundId: refund.id,
      referenceNumber: proof.referenceNumber,
      note: proof.note,
    });
    setRefValues((prev) => ({ ...prev, [refund.id]: "" }));
    setNoteValues((prev) => ({ ...prev, [refund.id]: "" }));
    toast.success("Demo: refund marked paid. Guest notified.");
  }

  function submitRefundReject() {
    if (!refundRejecting) return;
    fo.demoRejectRefund(refundRejecting);
    toast.success("Demo: refund rejected. Guest notified.");
    setRefundRejecting(null);
  }

  const tabClass = (tab) =>
    `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      activeTab === tab
        ? "bg-primary text-primary-foreground"
        : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
    }`;

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Cancellations & Refunds"
        role="fo"
        description="Approve cancellation requests, then move the suggested refund through Pending → Approved → Paid. Everything stays in memory."
      />

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button type="button" onClick={() => setActiveTab("requests")} className={tabClass("requests")}>
          Cancellation Requests <span className="tabular-nums opacity-60">({requests.length})</span>
        </button>
        <button type="button" onClick={() => setActiveTab("refunds")} className={tabClass("refunds")}>
          Refunds <span className="tabular-nums opacity-60">({activeRefunds.length})</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s) => (
            <Card key={s.bookingId} className="space-y-2 px-4 py-3 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">
                    {s.roomLabel} · Refund suggested {formatCurrency(s.refund)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-foreground/55">
                    Paid {formatCurrency(s.paid)} − cancellation fee {formatCurrency(s.fee)}
                  </p>
                  {s.reason ? <p className="mt-0.5 text-xs text-foreground/55">{s.reason}</p> : null}
                </div>
                {s.refund <= 0 ? (
                  <div className="flex items-center gap-1.5">
                    <p className="text-foreground/60">No refund due.</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setSuggestions((prev) => prev.filter((x) => x.bookingId !== s.bookingId))}
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      max={s.paid}
                      aria-label="Refund amount"
                      className="h-7 w-28 rounded-lg px-2 text-[13px] tabular-nums"
                      value={s.amount}
                      onChange={(e) =>
                        setSuggestions((prev) =>
                          prev.map((x) => (x.bookingId === s.bookingId ? { ...x, amount: e.target.value } : x)),
                        )
                      }
                    />
                    <select
                      aria-label="Refund method"
                      className="h-7 rounded-lg border border-border bg-background px-2 text-[13px]"
                      value={s.method}
                      onChange={(e) =>
                        setSuggestions((prev) =>
                          prev.map((x) => (x.bookingId === s.bookingId ? { ...x, method: e.target.value } : x)),
                        )
                      }
                    >
                      {REFUND_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <Button size="sm" className="h-7 px-2.5 text-xs shadow-sm" onClick={() => createRefund(s)}>
                      Create
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => setSuggestions((prev) => prev.filter((x) => x.bookingId !== s.bookingId))}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
              {s.refund > 0 && (
                <p className="text-xs text-foreground/45">
                  Refunds are sent manually via {s.method}.
                  {refundMethodNeedsReference(s.method)
                    ? " A reference number is required when you mark it paid."
                    : " No reference is required; log an OR number or note when you mark it paid."}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {activeTab === "requests" ? (
        requests.length === 0 ? (
          <div className="rounded-xl border border-border bg-background p-12 text-center text-sm text-foreground/50">
            No pending cancellation requests in the sample data.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((booking) => {
              const isRejecting = rejecting?.bookingId === booking.id;
              return (
                <CancellationCard
                  key={booking.id}
                  booking={booking}
                  roomLabel={roomLabelFrom(roomsById, booking.roomId)}
                  guestName={guestNameFor(usersById, booking)}
                  rejecting={isRejecting}
                  rejectReason={isRejecting ? rejecting.reason : ""}
                  onApprove={() => approveCancellation(booking)}
                  onOpenReject={() => setRejecting({ bookingId: booking.id, reason: "" })}
                  onCancelReject={() => setRejecting(null)}
                  onRejectReasonChange={(value) =>
                    setRejecting((prev) => (prev ? { ...prev, reason: value } : prev))
                  }
                  onSubmitReject={submitCancellationReject}
                />
              );
            })}
          </div>
        )
      ) : activeRefunds.length === 0 && pastRefunds.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center text-sm text-foreground/50">
          No refunds in the sample data.
        </div>
      ) : (
        <div className="space-y-3">
          {activeRefunds.map((refund) => {
            const booking = bookingsById[refund.bookingId];
            const isRejecting = refundRejecting?.refundId === refund.id;
            return (
              <RefundCard
                key={refund.id}
                refund={refund}
                booking={booking}
                guestName={guestNameFor(usersById, booking)}
                roomLabel={booking ? roomLabelFrom(roomsById, booking.roomId) : "Booking removed"}
                reference={refValues[refund.id] ?? ""}
                onReferenceChange={(v) => setRefValues((prev) => ({ ...prev, [refund.id]: v }))}
                note={noteValues[refund.id] ?? ""}
                onNoteChange={(v) => setNoteValues((prev) => ({ ...prev, [refund.id]: v }))}
                rejecting={isRejecting}
                rejectReason={isRejecting ? refundRejecting.reason : ""}
                onRejectReasonChange={(value) =>
                  setRefundRejecting((prev) => (prev ? { ...prev, reason: value } : prev))
                }
                onApprove={() => approveRefund(refund.id)}
                onMarkPaid={() => markRefundPaid(refund)}
                onOpenReject={() => setRefundRejecting({ refundId: refund.id, reason: "" })}
                onCancelReject={() => setRefundRejecting(null)}
                onSubmitReject={submitRefundReject}
              />
            );
          })}

          {pastRefunds.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                className="inline-flex w-full items-center justify-center gap-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-foreground/40 transition-colors hover:text-foreground/60"
              >
                Past Refunds ({pastRefunds.length})
                <ChevronDown className={`h-3 w-3 ${showPast ? "rotate-180" : ""}`} />
              </button>
              {showPast &&
                pastRefunds.map((refund) => {
                  const booking = bookingsById[refund.bookingId];
                  return (
                    <RefundHistoryRow
                      key={refund.id}
                      refund={refund}
                      booking={booking}
                      guestName={guestNameFor(usersById, booking)}
                      roomLabel={booking ? roomLabelFrom(roomsById, booking.roomId) : "Booking removed"}
                    />
                  );
                })}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-foreground/50">
        Demo only: refunds are simulated in memory. No money moves and no guest is notified outside this browser.
      </p>
    </div>
  );
}
