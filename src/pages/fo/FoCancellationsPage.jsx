import { useEffect, useState } from "react";
import {
  subscribeToAllBookings,
  approveCancellation,
  rejectCancellation,
} from "@/services/bookingsService";
import { listRooms } from "@/services/roomsService";
import { listUsers } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateLike) {
  try {
    const d = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
    if (!d || isNaN(d)) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function formatCurrency(amount) {
  if (amount == null || isNaN(Number(amount))) return "—";
  return `PHP ${Number(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  onSubmitReject,
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* ── Top row ── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{guestName || booking.guestName || booking.guestId || "—"}</p>
        </div>
        <Badge variant="warning">
          {booking.status}
        </Badge>
      </div>

      {/* ── Details grid ── */}
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-foreground/50">Room</p>
          <p className="font-medium text-foreground">{roomLabel}</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">Check-in</p>
          <p className="font-medium text-foreground">
            {formatDate(booking.checkInDate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">Check-out</p>
          <p className="font-medium text-foreground">
            {formatDate(booking.checkOutDate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">Total</p>
          <p className="font-medium text-foreground">
            {formatCurrency(booking.totalCost)}
          </p>
        </div>
      </div>

      {/* ── Cancellation Reason ── */}
      {booking.cancellationReason && (
        <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-sm text-foreground/80">
          <p className="text-xs font-medium text-foreground/50 uppercase tracking-wide mb-1">
            Cancellation Reason
          </p>
          <p>{booking.cancellationReason}</p>
        </div>
      )}

      {/* ── Requested Date ── */}
      <p className="mt-2 text-xs text-foreground/55">
        <span className="font-medium text-foreground/70">Requested At:</span>{" "}
        {formatDate(booking.cancellationRequestedAt)}
      </p>

      {/* ── Pending Actions ── */}
      {!isRejectingThis && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={isActing}
            onClick={onApprove}
            className="flex items-center gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            {isActing ? "Approving…" : "Approve Cancellation"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isActing}
            onClick={onOpenReject}
            className="flex items-center gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Reject Cancellation
          </Button>
        </div>
      )}

      {/* ── Inline Reject Form ── */}
      {isRejectingThis && (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-all duration-200">
          <p className="text-sm font-medium text-foreground">
            Rejection Reason{" "}
            <span className="text-xs font-normal text-foreground/50">(required)</span>
          </p>
          <textarea
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/45 shadow-sm transition-colors focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/10"
            rows={3}
            placeholder="Please provide a brief reason for rejecting this cancellation..."
            value={rejectReason}
            onChange={(e) => onRejectReasonChange(e.target.value)}
            disabled={isActing}
          />
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={isActing}
              onClick={onCancelReject}
              className="hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isActing || !rejectReason.trim()}
              onClick={onSubmitReject}
              className="flex items-center gap-1.5 shadow-sm"
            >
              <X className="h-3.5 w-3.5" />
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
  const { trainingMode } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [guestsMap, setGuestsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null); // { bookingId, reason }
  const [actionLoading, setActionLoading] = useState(null); // bookingId currently acting on

  // ── Fetch rooms and guests for name mapping ──
  useEffect(() => {
    async function loadResources() {
      try {
        const [rooms, users] = await Promise.all([
          listRooms({ trainingMode }),
          listUsers({ trainingMode }),
        ]);

        const rMap = {};
        rooms.forEach((r) => {
          rMap[r.id] = r.name || r.roomNumber || r.id;
        });
        setRoomsMap(rMap);

        const gMap = {};
        users.forEach((u) => {
          gMap[u.id || u.uid] = u.fullName || u.email || u.id;
        });
        setGuestsMap(gMap);
      } catch (err) {
        console.error("[FoCancellationsPage] Failed to load resources:", err);
      }
    }
    loadResources();
  }, [trainingMode]);

  // ── Real-time bookings subscription ──
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAllBookings(
      (data) => {
        setBookings(data);
        setLoading(false);
      },
      { trainingMode },
    );
    return () => unsub();
  }, [trainingMode]);

  // ── Filtered list ──
  const filtered = bookings.filter((b) => b.status === "Cancellation Requested");

  // ── Action handlers ──
  async function handleApprove(bookingId) {
    setActionLoading(bookingId);
    try {
      await approveCancellation(bookingId, { trainingMode });
      toast.success("Cancellation request approved!");
    } catch (err) {
      toast.error(err?.message || "Failed to approve cancellation.");
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
    if (!reason.trim()) {
        toast.error("Rejection reason is required.");
        return;
    }
    setActionLoading(bookingId);
    try {
      await rejectCancellation(bookingId, reason, { trainingMode });
      toast.success("Cancellation request rejected.");
      setRejecting(null);
    } catch (err) {
      toast.error(err?.message || "Failed to reject cancellation.");
    } finally {
      setActionLoading(null);
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

      {/* ── Content ── */}
      {loading ? (
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
            const roomLabel = roomsMap[booking.roomId] || booking.roomId || "—";
            const isActing = actionLoading === booking.id;
            const isRejectingThis = rejecting?.bookingId === booking.id;

            return (
              <CancellationCard
                key={booking.id}
                booking={booking}
                roomLabel={roomLabel}
                guestName={guestsMap[booking.guestId]}
                isActing={isActing}
                isRejectingThis={isRejectingThis}
                rejectReason={isRejectingThis ? rejecting.reason : ""}
                onApprove={() => handleApprove(booking.id)}
                onOpenReject={() => handleOpenReject(booking.id)}
                onCancelReject={handleCancelReject}
                onRejectReasonChange={handleRejectReasonChange}
                onSubmitReject={handleSubmitReject}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
