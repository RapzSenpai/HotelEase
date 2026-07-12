import { useEffect, useState, useRef } from "react";
import {
  subscribeToAllBookings,
  approveBooking,
  rejectBooking,
} from "@/services/bookingsService";
import { listRooms } from "@/services/roomsService";
import { listUsers } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  "All",
  "Pending",
  "Approved",
  "Checked In",
  "Checked Out",
  "Cancelled",
];

const STATUS_VARIANT = {
  Pending: "warning",
  Approved: "info",
  "Checked In": "success",
  "Checked Out": "muted",
  Cancelled: "danger",
};

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

// ─── Booking Card ─────────────────────────────────────────────────────────────

function BookingCard({
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
  const guestLabel = booking.guestName || booking.guestId || "—";

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* ── Top row ── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{guestName || booking.guestName || booking.guestId || "—"}</p>
        </div>
        <Badge variant={STATUS_VARIANT[booking.status] || "default"}>
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

      {/* ── Extra info ── */}
      {(booking.nights != null ||
        booking.paxCount != null ||
        booking.bookingType) && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-foreground/55">
          {booking.nights != null && (
            <span>
              <span className="font-medium text-foreground/70">Nights:</span>{" "}
              {booking.nights}
            </span>
          )}
          {booking.paxCount != null && (
            <span>
              <span className="font-medium text-foreground/70">Pax:</span>{" "}
              {booking.paxCount}
            </span>
          )}
          {booking.bookingType && (
            <span>
              <span className="font-medium text-foreground/70">Type:</span>{" "}
              {booking.bookingType}
            </span>
          )}
        </div>
      )}

      {/* ── Special requests ── */}
      {booking.specialRequests && (
        <p className="mt-2 text-xs text-foreground/55">
          <span className="font-medium text-foreground/70">Requests:</span>{" "}
          {booking.specialRequests}
        </p>
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

      {/* ── Pending Actions ── */}
      {booking.status === "Pending" && !isRejectingThis && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={isActing}
            onClick={onApprove}
            className="flex items-center gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            {isActing ? "Approving…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isActing}
            onClick={onOpenReject}
            className="flex items-center gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      )}

      {/* ── Inline Reject Form ── */}
      {isRejectingThis && (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-all duration-200">
          <p className="text-sm font-medium text-foreground">
            Rejection Reason{" "}
            <span className="text-xs font-normal text-foreground/50">(optional)</span>
          </p>
          <textarea
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/45 shadow-sm transition-colors focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/10"
            rows={3}
            placeholder="Please provide a brief reason for rejecting this booking..."
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
              disabled={isActing}
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

export default function FoBookingsPage() {
  const { trainingMode } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [guestsMap, setGuestsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
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
        console.error("[FoBookingsPage] Failed to load resources:", err);
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
  const filtered =
    activeTab === "All"
      ? bookings
      : bookings.filter((b) => b.status === activeTab);

  // ── Tab badge counts ──
  function countForTab(tab) {
    if (tab === "All") return bookings.length;
    return bookings.filter((b) => b.status === tab).length;
  }

  // ── Action handlers ──
  async function handleApprove(bookingId) {
    setActionLoading(bookingId);
    try {
      await approveBooking(bookingId, { trainingMode });
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
      await rejectBooking(bookingId, reason, { trainingMode });
      toast.success("Booking rejected.");
      setRejecting(null);
    } catch (err) {
      toast.error(err?.message || "Failed to reject booking.");
    } finally {
      setActionLoading(null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="font-playfair text-3xl font-semibold">Bookings</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Manage and respond to guest booking requests in real-time.
        </p>
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((tab) => {
          const count = countForTab(tab);
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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

      {/* ── Content ── */}
      {loading ? (
        <div className="py-20 text-center text-sm text-foreground/50">
          Loading bookings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center text-sm text-foreground/50">
          No bookings found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((booking) => {
            const roomLabel = roomsMap[booking.roomId] || booking.roomId || "—";
            const isActing = actionLoading === booking.id;
            const isRejectingThis = rejecting?.bookingId === booking.id;

            return (
              <BookingCard
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
