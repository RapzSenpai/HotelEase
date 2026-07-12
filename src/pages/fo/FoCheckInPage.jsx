import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  checkInBooking,
  approveBooking,
  listBookingsByStatuses,
} from "@/services/bookingsService";
import { listRooms } from "@/services/roomsService";
import { listUsers } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarDays, Users, BedDouble, CheckCircle2 } from "lucide-react";

function formatDate(tsLike) {
  try {
    const d = tsLike?.toDate ? tsLike.toDate() : tsLike;
    if (!d) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ["Pending", "Approved", "Checked In"];

function StepIndicator({ currentStatus }) {
  const activeIndex = STEPS.indexOf(currentStatus);

  return (
    <div className="flex items-start">
      {STEPS.map((step, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        const isLast = i === STEPS.length - 1;

        return (
          <div key={step} className="flex items-start flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                  isDone
                    ? "border-success bg-success text-white"
                    : isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground/30"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-[11px] font-bold">{i + 1}</span>
                )}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isActive
                    ? "text-primary"
                    : isDone
                      ? "text-success"
                      : "text-foreground/35"
                }`}
              >
                {step}
              </span>
            </div>
            {!isLast && (
              <div
                className={`h-0.5 flex-1 mt-3.5 mx-1.5 transition-colors ${
                  i < activeIndex ? "bg-success" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FoCheckInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomIdParam = searchParams.get("roomId");
  const { trainingMode } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [guestsMap, setGuestsMap] = useState({});
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [roomData, bookingData, userData] = await Promise.all([
          listRooms(),
          listBookingsByStatuses(["Pending", "Approved"], { trainingMode }),
          listUsers({ trainingMode }),
        ]);

        if (!isMounted) return;
        setRooms(roomData);

        const gMap = {};
        userData.forEach((u) => {
          gMap[u.id || u.uid] = u.fullName || u.email || u.id;
        });
        setGuestsMap(gMap);

        const filtered = roomIdParam
          ? bookingData.filter((b) => b.roomId === roomIdParam)
          : bookingData;
        setBookings(filtered);

        // Auto-select first booking when arriving from dashboard via ?roomId=
        if (roomIdParam && filtered.length > 0) {
          setSelectedBookingId(filtered[0].id);
        }
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load check-in data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [roomIdParam, trainingMode]);

  const roomById = useMemo(() => {
    const map = new Map();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  const selectedBooking = useMemo(
    () =>
      selectedBookingId
        ? (bookings.find((b) => b.id === selectedBookingId) ?? null)
        : null,
    [selectedBookingId, bookings],
  );

  async function onApprove(bookingId) {
    try {
      setSubmitting(true);
      setError(null);
      await approveBooking(bookingId, { trainingMode });
      const data = await listBookingsByStatuses(["Pending", "Approved"], {
        trainingMode,
      });
      const filtered = roomIdParam
        ? data.filter((b) => b.roomId === roomIdParam)
        : data;
      setBookings(filtered);
      // Keep the same booking selected — it is now Approved
    } catch (e) {
      setError(e?.message || "Failed to approve booking.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCheckIn(bookingId) {
    try {
      setSubmitting(true);
      setError(null);
      await checkInBooking(bookingId, { trainingMode });
      navigate(`/fo/check-out?roomId=${roomIdParam || ""}`);
    } catch (e) {
      setError(e?.message || "Check-in failed.");
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Check-In</h1>
        <p className="text-foreground/80">
          Approve pending reservations and check in arriving guests.
        </p>
      </div>

      {/* Error banner */}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">
          Loading bookings...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Left panel: booking list ── */}
          <div className="lg:col-span-2 space-y-3">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="font-semibold">Arriving bookings</div>
              <div className="mt-1 text-sm text-foreground/70">
                {roomIdParam ? "Filtered by room." : "All rooms."}
              </div>
            </div>

            {bookings.length === 0 ? (
              <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                No bookings to check in.
              </div>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => {
                  const room = roomById.get(b.roomId);
                  const isActive = selectedBookingId === b.id;
                  const guestName =
                    guestsMap[b.guestId] || b.guestName || "Guest";
                  const roomName = room?.name || room?.type || b.roomId;

                  return (
                    <div
                      key={b.id}
                      className={`rounded-xl border border-border bg-background p-3 space-y-2 transition-shadow ${
                        isActive ? "ring-2 ring-primary/40 shadow-sm" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-semibold text-sm truncate">
                            {guestName}
                          </div>
                          <div className="text-xs text-foreground/55 truncate">
                            {roomName}
                          </div>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            b.status === "Approved"
                              ? "bg-success/10 text-success border-success/20"
                              : "bg-warning/10 text-warning border-warning/20"
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <Button
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSelectedBookingId(b.id);
                          setError(null);
                        }}
                      >
                        {isActive ? "Selected" : "Review"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right panel: booking detail + actions ── */}
          <div className="lg:col-span-3 space-y-4">
            {selectedBooking ? (
              (() => {
                const room = roomById.get(selectedBooking.roomId);
                const guestName =
                  guestsMap[selectedBooking.guestId] ||
                  selectedBooking.guestName ||
                  "Guest";

                return (
                  <>
                    {/* Step indicator */}
                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="text-sm font-semibold mb-4">
                        Booking Progress
                      </div>
                      <StepIndicator currentStatus={selectedBooking.status} />
                    </div>

                    {/* Booking summary */}
                    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                      <div className="font-semibold">Booking Summary</div>

                      {/* Room info row */}
                      <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <BedDouble className="h-4 w-4 text-foreground/40 mt-0.5 shrink-0" />
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-semibold text-sm">
                            {room?.name || room?.type || selectedBooking.roomId}
                            {room?.roomNumber ? ` · #${room.roomNumber}` : ""}
                          </div>
                          <div className="text-xs text-foreground/50">
                            {room?.type ? `${room.type} · ` : ""}Floor{" "}
                            {room?.floor || "—"}
                          </div>
                        </div>
                        <div className="ml-auto shrink-0">
                          <Badge
                            variant="warning"
                            className="text-xs font-semibold"
                          >
                            PHP{" "}
                            {Number(
                              room?.ratePerNight ?? 0,
                            ).toLocaleString()}
                            <span className="font-normal text-[10px] ml-1 opacity-70">
                              /night
                            </span>
                          </Badge>
                        </div>
                      </div>

                      {/* Guest + dates grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
                          <Users className="h-4 w-4 text-foreground/40 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wide text-foreground/40 mb-0.5">
                              Guest
                            </div>
                            <div className="text-sm font-semibold truncate">
                              {guestName}
                            </div>
                            {selectedBooking.paxCount ? (
                              <div className="text-xs text-foreground/50 mt-0.5">
                                {selectedBooking.paxCount} pax
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
                          <CalendarDays className="h-4 w-4 text-foreground/40 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wide text-foreground/40 mb-0.5">
                              Stay
                            </div>
                            <div className="text-xs font-semibold">
                              {formatDate(selectedBooking.checkInDate)}
                            </div>
                            <div className="text-[10px] text-foreground/40">
                              → {formatDate(selectedBooking.checkOutDate)}
                            </div>
                            {selectedBooking.nights ? (
                              <div className="text-[10px] text-foreground/50 mt-0.5">
                                {selectedBooking.nights} night
                                {selectedBooking.nights !== 1 ? "s" : ""}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Total cost */}
                      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                        <span className="text-sm text-foreground/60">
                          Total booking cost
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          PHP{" "}
                          {Number(
                            selectedBooking.totalCost ?? 0,
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Action section */}
                    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                      <div className="font-semibold">
                        {selectedBooking.status === "Pending"
                          ? "Approve Reservation"
                          : "Confirm Check-In"}
                      </div>
                      <p className="text-sm text-foreground/60">
                        {selectedBooking.status === "Pending"
                          ? "Verify the reservation details above before approving."
                          : "Guest identity confirmed — proceed with check-in."}
                      </p>

                      {selectedBooking.status === "Pending" ? (
                        <Button
                          className="w-full"
                          onClick={() => onApprove(selectedBooking.id)}
                          disabled={submitting}
                        >
                          {submitting ? "Approving..." : "Approve Reservation"}
                        </Button>
                      ) : selectedBooking.status === "Approved" ? (
                        <Button
                          className="w-full"
                          onClick={() => onCheckIn(selectedBooking.id)}
                          disabled={submitting}
                        >
                          {submitting ? "Checking in..." : "Check In Guest"}
                        </Button>
                      ) : (
                        <Button variant="outline" disabled className="w-full">
                          {selectedBooking.status}
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => navigate("/fo")}
                        disabled={submitting}
                      >
                        Back to Dashboard
                      </Button>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="rounded-xl border border-border bg-background p-8 text-center text-sm text-foreground/50">
                Select an arriving booking from the left to review details and
                take action.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
