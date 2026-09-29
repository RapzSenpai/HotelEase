import { useEffect, useRef, useState } from "react";
import { formatDate, formatCurrency } from "@/lib/format";
import {
  BOOKINGS_PAGE_SIZE,
  subscribeToBookingsPage,
  approveCancellation,
  rejectCancellation,
} from "@/services/bookingsService";
import { listRooms } from "@/services/roomsService";
import { getUserDoc } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────



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
    <div className="rounded-lg border border-border bg-background p-3">
      {/* ── Top row ── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{guestName || booking.guestName || booking.guestId || "—"}</p>
        </div>
        <Badge variant="warning">
          {booking.status}
        </Badge>
      </div>

      {/* ── Details grid ── */}
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
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
        <div className="mt-2 rounded-md border border-warning/20 bg-warning/5 px-3 py-1.5 text-sm text-foreground/80">
          <p className="text-[10px] font-medium text-foreground/50 uppercase tracking-wide mb-0.5">
            Cancellation Reason
          </p>
          <p>{booking.cancellationReason}</p>
        </div>
      )}

      {/* ── Requested Date ── */}
      <p className="mt-1.5 text-xs text-foreground/55">
        <span className="font-medium text-foreground/70">Requested At:</span>{" "}
        {formatDate(booking.cancellationRequestedAt)}
      </p>

      {/* ── Pending Actions ── */}
      {!isRejectingThis && (
        <div className="mt-2.5 flex flex-wrap gap-2">
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
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-all duration-200">
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
  // P2 scalability: bounded status-scoped window (queue is inherently small).
  const [pageSize, setPageSize] = useState(BOOKINGS_PAGE_SIZE);
  // Guest-name cache mirror: on-demand getUserDoc per visible guest, "" resolved.
  const guestsMapRef = useRef({});

  // ── Fetch rooms for name mapping (rooms are tens, not thousands) ──
  useEffect(() => {
    let isMounted = true;
    async function loadResources() {
      try {
        const rooms = await listRooms({ trainingMode });

        if (!isMounted) return;
        const rMap = {};
        rooms.forEach((r) => {
          rMap[r.id] = r.name || r.roomNumber || r.id;
        });
        setRoomsMap(rMap);
      } catch (err) {
        console.error("[FoCancellationsPage] Failed to load resources:", err);
      }
    }
    loadResources();
    return () => { isMounted = false; };
  }, [trainingMode]);

  // Resolve display names for guests visible in the current window.
  async function ensureGuestNames(list) {
    const missing = [...new Set(list.map((b) => b.guestId).filter(Boolean))]
      .filter((id) => !(id in guestsMapRef.current));
    if (missing.length === 0) return;
    const entries = await Promise.all(
      missing.map(async (id) => {
        try {
          const d = await getUserDoc(id, { preferTraining: trainingMode });
          return [id, d?.fullName || d?.email || ""];
        } catch {
          return [id, ""];
        }
      }),
    );
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
  }, [trainingMode]);

  // ── Real-time subscription: cancellation queue only ──
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToBookingsPage(
      { status: "Cancellation Requested", pageSize, trainingMode },
      (data) => {
        setBookings(data);
        setLoading(false);
        ensureGuestNames(data);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingMode, pageSize]);

  // ── Filtered list (server already scoped; client filter is a backstop) ──
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
          {bookings.length >= pageSize && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={() => setPageSize((n) => n + BOOKINGS_PAGE_SIZE)}>
                Show more (+{BOOKINGS_PAGE_SIZE})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
