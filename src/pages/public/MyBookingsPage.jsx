import { useEffect, useMemo, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { listBookingsForUser, subscribeToUserBookings } from "@/services/bookingsService";
import { mapFirebaseError } from "@/lib/errors";
import { subscribeToRooms } from "@/services/roomsService";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import BookingCard from "@/components/bookings/BookingCard";
import PastBookingRow from "@/components/bookings/PastBookingRow";
import CancelBookingDialog from "@/components/bookings/CancelBookingDialog";
import { ChevronDown, BedDouble, SlidersHorizontal } from "lucide-react";

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
  const { user, profile} = useAuth();
  const [searchParams] = useSearchParams();
  const deepBookingId = searchParams.get("bookingId");

  const [bookings, setBookings] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("All");
  const [dropdownStatus, setDropdownStatus] = useState("All");
  const [showPastBookings, setShowPastBookings] = useState(false);
  const [dismissedDeepLinkId, setDismissedDeepLinkId] = useState(null);
  // Page-level cancel flow — owns the dialog so the refund step survives the
  // cancelled booking moving Active → Past (which unmounts its card).
  const [cancelTarget, setCancelTarget] = useState(null);

  // Derive the deep-link filter from loaded booking data; user-selected tabs
  // dismiss its override without effect-driven state updates.
  const deepLinkTarget = bookings.find((booking) => booking.id === deepBookingId);
  const deepLinkPast =
    !loading &&
    deepLinkTarget &&
    !ACTIVE_STATUSES.has(deepLinkTarget.status) &&
    dismissedDeepLinkId !== deepBookingId;
  const visibleActiveTab = deepLinkPast ? "Past" : activeTab;
  const visibleShowPastBookings = deepLinkPast || showPastBookings;

  useEffect(() => {
    if (!deepBookingId || loading) return;
    const t = setTimeout(() => {
      document.getElementById(`booking-${deepBookingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [deepBookingId, loading, bookings, showPastBookings]);

  function handleTabChange(tab) {
    if (deepBookingId) setDismissedDeepLinkId(deepBookingId);
    setActiveTab(tab);
    setDropdownStatus("All");
    setShowPastBookings(false);
  }

  function handleStatusSelect(status) {
    if (deepBookingId) setDismissedDeepLinkId(deepBookingId);
    setDropdownStatus(status);
    setActiveTab("All");
    setShowPastBookings(false);
  }

  async function refreshBookings() {
    if (!user?.uid) return;
    try {
      const bookingData = await listBookingsForUser(user.uid);
      setBookings(sortBookings(bookingData));
    } catch (e) {
      setError(mapFirebaseError(e) || "Failed to refresh bookings.");
    }
  }

  useEffect(() => {
    let isMounted = true;
    let unsubBookings = null;
    let unsubRooms = null;

    async function init() {
      if (!user?.uid) {
        setBookings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      // Lazy-expiry is done by FO/admin (global sweep). Guests can't run it
      // (rules limit guests to their own bookings), so nothing to do here.

      // Live subscription so statuses (Pending → Approved → Checked In …)
      // update immediately without manual refresh.
      unsubBookings = subscribeToUserBookings(
        user.uid,
        (data) => {
          if (!isMounted) return;
          setBookings(sortBookings(data));
          setLoading(false);
        });

      unsubRooms = subscribeToRooms(
        (roomData) => {
          if (!isMounted) return;
          const map = {};
          for (const r of roomData) {
            map[r.id] = r;
          }
          setRoomsMap(map);
        });
    }

    init();

    return () => {
      isMounted = false;
      if (unsubBookings) unsubBookings();
      if (unsubRooms) unsubRooms();
    };
  }, [user?.uid]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = bookings;

    if (visibleActiveTab === "Active") {
      result = bookings.filter((b) => ACTIVE_STATUSES.has(b.status));
    } else if (visibleActiveTab === "Past") {
      result = bookings.filter((b) => !ACTIVE_STATUSES.has(b.status));
    } else if (visibleActiveTab !== "All") {
      result = bookings.filter((b) => b.status === visibleActiveTab);
    }

    if (visibleActiveTab === "All" && dropdownStatus !== "All") {
      result = result.filter((b) => b.status === dropdownStatus);
    }

    return result;
  }, [bookings, visibleActiveTab, dropdownStatus]);

  const activeBookings = useMemo(
    () => filtered.filter((b) => ACTIVE_STATUSES.has(b.status)),
    [filtered]);
  const pastBookings = useMemo(
    () => filtered.filter((b) => !ACTIVE_STATUSES.has(b.status)),
    [filtered]);

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
        <SkeletonList rows={4} />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>{dropdownStatus === "All" ? "All Statuses" : dropdownStatus}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52" align="start">
                <DropdownMenuGroup>
                  <DropdownMenuItem active={dropdownStatus === "All"} onClick={() => handleStatusSelect("All")}>
                    All Statuses
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Active</DropdownMenuLabel>
                  {FILTER_STATUSES.filter(s => ACTIVE_STATUSES.has(s)).map((status) => (
                    <DropdownMenuItem key={status} active={dropdownStatus === status} onClick={() => handleStatusSelect(status)}>
                      {status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Past</DropdownMenuLabel>
                  {FILTER_STATUSES.filter(s => !ACTIVE_STATUSES.has(s)).map((status) => (
                    <DropdownMenuItem key={status} active={dropdownStatus === status} onClick={() => handleStatusSelect(status)}>
                      {status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Quick filter tabs */}
            {QUICK_FILTERS.map((tab) => {
              const count = countForTab(tab);
              const isActive = visibleActiveTab === tab && (tab !== "All" || dropdownStatus === "All");
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
              No {visibleActiveTab.toLowerCase()} bookings found.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Bookings */}
              {activeBookings.length > 0 && (
                <div className="space-y-3">
                  {visibleActiveTab === "All" && (
                    <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider">
                      Active
                    </h2>
                  )}
                  {activeBookings.map((b) => (
                    <div key={b.id} id={`booking-${b.id}`} className="scroll-mt-24">
                      <BookingCard
                        booking={b}
                        room={roomsMap[b.roomId] || { id: b.roomId, isActive: false }}
                        userProfile={profile}
                        onCancelled={refreshBookings}
                        onRequestCancel={setCancelTarget}
                        autoExpand={b.id === deepBookingId}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Past Bookings — collapsed by default when viewing All */}
              {pastBookings.length > 0 && visibleActiveTab === "All" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border/60" />
                    <button
                      type="button"
                      onClick={() => setShowPastBookings(!visibleShowPastBookings)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/40 uppercase tracking-wider hover:text-foreground/60 transition-colors"
                    >
                      Past Bookings ({pastBookings.length})
                      <ChevronDown className={`h-3 w-3 transition-transform ${visibleShowPastBookings ? "rotate-180" : ""}`} />
                    </button>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                  {visibleShowPastBookings && pastBookings.map((b) => (
                    <div key={b.id} id={`booking-${b.id}`} className="scroll-mt-24">
                      <PastBookingRow
                        booking={b}
                        room={roomsMap[b.roomId] || { id: b.roomId, isActive: false }}
                        userProfile={profile}
                        autoExpand={b.id === deepBookingId}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Past Bookings — shown directly when filtering to Past status */}
              {pastBookings.length > 0 && visibleActiveTab !== "All" && (
                <div className="space-y-2">
                  {pastBookings.map((b) => (
                    <div key={b.id} id={`booking-${b.id}`} className="scroll-mt-24">
                      <PastBookingRow
                        booking={b}
                        room={roomsMap[b.roomId] || { id: b.roomId, isActive: false }}
                        userProfile={profile}
                        autoExpand={b.id === deepBookingId}
                      />
                    </div>
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

      {/* Cancel flow: reason → refund notice, both steps in this one dialog. */}
      <CancelBookingDialog
        open={!!cancelTarget}
        onOpenChange={(next) => {
          if (!next) setCancelTarget(null);
        }}
        booking={cancelTarget}
        room={cancelTarget ? roomsMap[cancelTarget.roomId] : null}
        status={cancelTarget?.status}
        userProfile={profile}
        onCancelled={refreshBookings}
      />
    </div>
  );
}
