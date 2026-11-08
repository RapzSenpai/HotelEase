import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import TermsDialog from "@/components/common/TermsDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription} from "@/components/ui/dialog";
import { NavLink, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getRoom, isRoomActive } from "@/services/roomsService";
import { getRoomCapacity } from "@/lib/roomCapacity";
import { mapFirebaseError } from "@/lib/errors";
import { toggleFavorite, subscribeToFavorites } from "@/services/favoritesService";
import ChatbotWidget from "@/components/chatbot/ChatbotWidget";
import {
  listReviewsForRoom,
  createReview,
  hasUserReviewedRoom} from "@/services/reviewsService";
import { listBookingsForUser, getAvailableRooms } from "@/services/bookingsService";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent, GA_EVENTS } from "@/services/gaService";
import RoomReviewsDialog from "@/components/rooms/RoomReviewsDialog";
import RoomPhotoStack from "@/components/rooms/RoomPhotoStack";
import RoomReviewsSection from "@/components/rooms/RoomReviewsSection";
import RoomBookingBar from "@/components/rooms/RoomBookingBar";
import RoomReviewFormDialog from "@/components/rooms/RoomReviewFormDialog";
import {
  Wifi,
  Wind,
  Tv,
  Bath,
  Wine,
  UtensilsCrossed,
  Car,
  Waves,
  Dumbbell,
  Coffee,
  Lock,
  Building2,
  CheckCircle,
  Check,
  ChevronLeft,
  ShieldCheck,
  AlertTriangle} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function calcNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const ms =
    new Date(`${checkOut}T00:00:00`).getTime() -
    new Date(`${checkIn}T00:00:00`).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

const getLocalDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split("T")[0];
};

function amenityIcon(label) {
  const key = (label ?? "").toLowerCase().trim();
  if (key === "wifi" || key === "wi-fi") return Wifi;
  if (key === "ac" || key === "air conditioning") return Wind;
  if (key === "tv" || key === "television") return Tv;
  if (key === "bathroom" || key === "private bathroom") return Bath;
  if (key === "minibar") return Wine;
  if (key === "room service") return UtensilsCrossed;
  if (key === "parking") return Car;
  if (key === "pool" || key === "swimming pool") return Waves;
  if (key === "gym" || key === "fitness center") return Dumbbell;
  if (key === "breakfast") return Coffee;
  if (key === "safe" || key === "in-room safe") return Lock;
  if (key === "balcony") return Building2;
  return CheckCircle;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RoomDetailPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role, profile} = useAuth();

  // --- date state (initialised from URL params set by RENO-1) ---
  const todayStr = useMemo(() => getLocalDateString(), []);
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") || "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") || "");

  // Sync when navigating in place with new ?checkIn&checkOut (RoomsPage links).
  useEffect(() => {
    setCheckIn(searchParams.get("checkIn") || "");
    setCheckOut(searchParams.get("checkOut") || "");
    setBookNowError(null);
  }, [searchParams]);

  // Check-out must be at least one day after check-in; otherwise the Book-Now
  // availability re-check silently fails and misreports the room as taken.
  const minCheckOutStr = (() => {
    if (!checkIn) return todayStr;
    const d = new Date(`${checkIn}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  })();
  const nights = useMemo(() => calcNights(checkIn, checkOut), [checkIn, checkOut]);
  const datesSelected = Boolean(checkIn && checkOut && nights > 0);

  const handleCheckInChange = (val) => {
    setCheckIn(val);
    if (checkOut && val && new Date(`${checkOut}T00:00:00`) <= new Date(`${val}T00:00:00`)) {
      setCheckOut("");
    }
    setBookNowError(null);
  };
  const handleCheckOutChange = (val) => {
    setCheckOut(val);
    setBookNowError(null);
  };
  const handleClearDates = () => {
    setCheckIn("");
    setCheckOut("");
    setBookNowError(null);
  };

  // --- room state ---
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- reviews state ---
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);

  // --- eligibility state ---
  const [canReview, setCanReview] = useState(false);
  const [eligibleBookingId, setEligibleBookingId] = useState(null);
  const [eligibilityChecked, setEligibilityChecked] = useState(false);

  // --- favorites state ---
  const [favorites, setFavorites] = useState([]);
  const [isFavorite, setIsFavorite] = useState(false);

  // --- policies expand state ---
  const [policiesExpanded, setPoliciesExpanded] = useState(false);

  // --- login prompt overlay state ---
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);

  // --- book now state ---
  const [bookNowLoading, setBookNowLoading] = useState(false);
  const [bookNowError, setBookNowError] = useState(null);

  // --- reviews overlay state ---
  const [reviewsOpen, setReviewsOpen] = useState(false);

  // --- review form dialog state ---
  const [reviewFormOpen, setReviewFormOpen] = useState(false);

  // ---- fetch room ----
  // ponytail: roomViewTrackedRef dedupes StrictMode double-effect in dev.
  const roomViewTrackedRef = useRef(null);
  useEffect(() => {
    let isMounted = true;
    async function loadRoom() {
      try {
        setLoading(true);
        setError(null);
        setRoom(null);
        const data = await getRoom(roomId);
        if (!isMounted) return;
        setRoom(data);
        if (roomViewTrackedRef.current !== `live:${roomId}`) {
          roomViewTrackedRef.current = `live:${roomId}`;
          trackEvent(GA_EVENTS.ROOM_VIEW, {
            item_id: roomId,
            item_name: data?.name || data?.roomNumber || "",
            item_category: data?.type || "",
            price: data?.ratePerNight ?? 0});
        }
      } catch (e) {
        if (!isMounted) return;
        setError(mapFirebaseError(e) || "Failed to load room.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadRoom();
    return () => {
      isMounted = false;
    };
  }, [roomId]);

  // ---- fetch reviews ----
  // ponytail: sequence guard so slow room A can't overwrite fast room B.
  const reviewsSeqRef = useRef(0);
  async function loadReviews() {
    const seq = ++reviewsSeqRef.current;
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const data = await listReviewsForRoom(roomId);
      if (reviewsSeqRef.current !== seq) return;
      setReviews(data);
    } catch (e) {
      if (reviewsSeqRef.current !== seq) return;
      setReviewsError(mapFirebaseError(e) || "Failed to load reviews.");
    } finally {
      if (reviewsSeqRef.current === seq) setReviewsLoading(false);
    }
  }

  useEffect(() => {
    if (!roomId) return;
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ---- check review eligibility ----
  useEffect(() => {
    if (!user || role !== "guest" || !roomId) {
      setCanReview(false);
      setEligibilityChecked(true);
      return;
    }

    let isMounted = true;
    async function checkEligibility() {
      try {
        const [bookings, alreadyReviewed] = await Promise.all([
          listBookingsForUser(user.uid),
          hasUserReviewedRoom(user.uid, roomId),
        ]);

        if (!isMounted) return;

        if (alreadyReviewed) {
          setCanReview(false);
          setEligibilityChecked(true);
          return;
        }

        const checkedOut = bookings.find(
          (b) => b.roomId === roomId && b.status === "Checked Out");

        setCanReview(Boolean(checkedOut));
        setEligibleBookingId(checkedOut?.id ?? null);
      } catch {
        if (isMounted) setCanReview(false);
      } finally {
        if (isMounted) setEligibilityChecked(true);
      }
    }

    checkEligibility();
    return () => {
      isMounted = false;
    };
  }, [user, role, roomId]);

  // ---- subscribe to favorites ----
  useEffect(() => {
    if (!user || role !== "guest") {
      setFavorites([]);
      setIsFavorite(false);
      return;
    }

    const unsubscribe = subscribeToFavorites(user.uid, (data) => {
      setFavorites(data);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user, role]);

  // ---- update isFavorite when favorites or roomId changes ----
  useEffect(() => {
    const favoriteIds = new Set(favorites.map((f) => f.roomId));
    setIsFavorite(favoriteIds.has(roomId));
  }, [favorites, roomId]);

  // ---- toggle favorite ----
  async function handleToggleFavorite() {
    if (!user || role !== "guest") return;
    try {
      await toggleFavorite(user.uid, roomId);
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
    }
  }

  // ---- submit review ----
  // Validation and the error box live in RoomReviewFormDialog; this stays the
  // write, and must reject so the dialog can report the failure.
  async function handleSubmitReview({ rating, feedback }) {
    await createReview({
      roomId,
      bookingId: eligibleBookingId ?? "",
      guestId: user.uid,
      guestName: profile?.fullName || user.displayName || user.email || "Guest",
      rating,
      feedback});
    await loadReviews();
    setCanReview(false);
    setEligibleBookingId(null);
    setReviewFormOpen(false);
  }

  // ---- RENO-2: defensive Book Now — re-validates availability before navigating ----
  const handleBookNow = useCallback(async () => {
    if (!datesSelected || !room) return;

    // Guests must be signed in to book. Show a login prompt overlay instead of
    // letting the availability query hit Firestore (which would surface a raw
    // permission error) or growing the floating bar with inline text/links.
    if (!user?.uid) {
      setLoginPromptOpen(true);
      return;
    }

    setBookNowLoading(true);
    setBookNowError(null);
    try {
      const available = await getAvailableRooms(checkIn, checkOut);
      const isStillAvailable = available.some((r) => r.id === roomId);
      if (!isStillAvailable) {
        setBookNowError(
          "This room is no longer available for your selected dates. It may have just been booked. Please choose different dates.");
        return;
      }
      const dateParams = `?checkIn=${checkIn}&checkOut=${checkOut}`;
      navigate(`/booking/${roomId}${dateParams}`);
    } catch (e) {
      setBookNowError(mapFirebaseError(e) || "Could not verify availability. Please try again.");
    } finally {
      setBookNowLoading(false);
    }
  }, [datesSelected, room, checkIn, checkOut, roomId, navigate, user?.uid]);

  // ---- derived ----
  const roomActive = isRoomActive(room);
  const photos = Array.isArray(room?.photos) ? room.photos : [];
  const amenities = Array.isArray(room?.amenities) ? room.amenities : [];
  const facilities = Array.isArray(room?.facilities) ? room.facilities : [];
  const capacity = getRoomCapacity(room);

  // ---- render ----
  return (
    <>
      {/* Main scrollable content — mobile bar maxes ~136px incl. the error
          row, so pad past it */}
      <div className="space-y-6 pb-36">

        {/* Breadcrumb / back link */}
        <div>
          <NavLink
            to="/rooms"
            className="inline-flex items-center gap-1.5 text-sm text-foreground/55 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Rooms
          </NavLink>
        </div>

        {/* Room fetch error */}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5">
              <div className="h-80 md:h-[480px] rounded-2xl bg-muted/20 animate-pulse" />
            </div>
            <div className="lg:col-span-7 space-y-4">
              <div className="h-10 w-2/3 rounded bg-muted/20 animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-muted/15 animate-pulse" />
              <div className="h-20 w-full rounded bg-muted/15 animate-pulse" />
            </div>
          </div>
        )}

        {/* Room not found */}
        {!loading && !room && !error && (
          <div className="rounded-xl border border-border bg-background p-5 text-sm text-foreground/70">
            Room not found.
          </div>
        )}

        {/* Main content */}
        {!loading && room && (
          <div className="space-y-8">

            {/* ── ARCHIVED ROOM BANNER ── */}
            {!roomActive && (
              <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-foreground/90">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">This room is no longer available</p>
                    <p className="text-foreground/70">
                      This room has been removed from our inventory and cannot accept
                      new bookings. You can still view its details from your booking
                      history.
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-2">
                      <NavLink to="/rooms">Browse Available Rooms</NavLink>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TWO-COLUMN LAYOUT ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">

              {/* ── LEFT COLUMN: Photo Stack (sticky) ── */}
              <div className="lg:col-span-5">
                <div className="lg:sticky lg:top-24">
                  <RoomPhotoStack
                    key={roomId}
                    photos={photos}
                    roomName={room.name || room.type}
                    isFavorite={isFavorite}
                    onToggleFavorite={handleToggleFavorite}
                    user={user}
                    role={role}
                  />
                </div>
              </div>

              {/* ── RIGHT COLUMN: Content ── */}
              <div className="lg:col-span-7 space-y-8">

                {/* Room Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50 uppercase tracking-[0.15em] font-medium">
                        {room.type && <span>{room.type}</span>}
                        {room.type && room.roomNumber && <span className="text-foreground/25">·</span>}
                        {room.roomNumber && <span>Room #{room.roomNumber}</span>}
                        {room.floor && <span className="text-foreground/25">·</span>}
                        {room.floor && <span>Floor {room.floor}</span>}
                      </div>
                      <h1 className="font-playfair text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                        {room.name || room.type || "Room"}
                      </h1>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPoliciesExpanded(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-foreground/45 hover:text-foreground/80 underline underline-offset-2 transition-colors shrink-0"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-foreground/50" />
                      Terms &amp; Conditions
                    </button>
                  </div>
                </div>

                {/* Stay details — one strip, no cards */}
                {(() => {
                  const showTimes = Boolean(room.checkInTime || room.checkOutTime);
                  return (
                    <div
                      className={`grid grid-cols-1 divide-y divide-border/60 border-y border-border/60 sm:divide-y-0 ${
                        showTimes ? "sm:grid-cols-3 sm:divide-x" : ""
                      }`}
                    >
                      <div className="py-3 sm:pr-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40">Sleeps</p>
                        <p className="mt-1 text-sm font-medium text-foreground">Up to {capacity.maxPax} guests</p>
                        <p className="mt-0.5 text-xs text-foreground/50">
                          {capacity.basePax} included
                          {capacity.extraPaxFee > 0
                            ? ` · +₱${capacity.extraPaxFee.toLocaleString()}/night per extra guest`
                            : ""}
                        </p>
                      </div>
                      {showTimes && (
                        <>
                          <div className="py-3 sm:px-5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40">Check-in</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{room.checkInTime || "—"}</p>
                          </div>
                          <div className="py-3 sm:pl-5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40">Check-out</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{room.checkOutTime || "—"}</p>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Description */}
                {room.description && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40">The stay</p>
                      <h2 className="font-playfair text-xl font-semibold text-foreground">About this room</h2>
                    </div>
                    <p className="text-[15px] text-foreground/70 leading-7 whitespace-pre-line">
                      {room.description}
                    </p>
                  </div>
                )}

                {/* Amenities — flat checklist */}
                {amenities.length > 0 && (
                  <div className="border-t border-border/50 pt-8 space-y-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40">In your room</p>
                      <h2 className="font-playfair text-xl font-semibold text-foreground">Room Amenities</h2>
                    </div>
                    <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
                      {amenities.map((amenity, idx) => {
                        const Icon = amenityIcon(amenity);
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2.5 text-sm text-foreground/70"
                          >
                            <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                            <span>{amenity}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Hotel Facilities — flat checklist */}
                {facilities.length > 0 && (
                  <div className="border-t border-border/50 pt-8 space-y-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40">Around the hotel</p>
                      <h2 className="font-playfair text-xl font-semibold text-foreground">Hotel Facilities</h2>
                    </div>
                    <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
                      {facilities.map((facility, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2.5 text-sm text-foreground/70"
                        >
                          <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                          <span>{facility}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Guest Reviews — List + Show More */}
                <div className="border-t border-border/50 pt-8">
                  <RoomReviewsSection
                    reviews={reviews}
                    reviewsLoading={reviewsLoading}
                    reviewsError={reviewsError}
                    eligibilityChecked={eligibilityChecked}
                    canReview={canReview}
                    onWriteReview={() => setReviewFormOpen(true)}
                    onShowAllReviews={() => setReviewsOpen(true)}
                  />
                </div>

              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── REVIEWS OVERLAY (Dialog) ── */}
      <RoomReviewsDialog
        open={reviewsOpen}
        onOpenChange={setReviewsOpen}
        reviews={reviews}
      />

      {/* ── REVIEW FORM DIALOG ── */}
      <RoomReviewFormDialog
        open={reviewFormOpen}
        onOpenChange={setReviewFormOpen}
        onSubmit={handleSubmitReview}
      />

      {/* ── LOGIN PROMPT OVERLAY (Dialog) ── */}
      <Dialog open={loginPromptOpen} onOpenChange={setLoginPromptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-playfair text-xl text-center">
              Log in to book this room
            </DialogTitle>
            <DialogDescription className="text-center">
              You need an account to complete a booking. Log in or create one to
              continue with your selected dates.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button asChild variant="default" className="w-full">
              <NavLink to="/login">Log In</NavLink>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <NavLink to="/register">Create Account</NavLink>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

            {/* ── TERMS & CONDITIONS OVERLAY (shared Dialog) ── */}
      <TermsDialog
        open={policiesExpanded}
        onOpenChange={setPoliciesExpanded}
        extraPolicy={room?.policies}
      />

      {/* ── STICKY BOTTOM BAR ── */}
      {!loading && room && (
        <RoomBookingBar
          room={room}
          dates={{ checkIn, checkOut, todayStr, minCheckOutStr, nights, datesSelected }}
          availability={{ active: roomActive, loading: bookNowLoading, error: bookNowError }}
          onChangeCheckIn={handleCheckInChange}
          onChangeCheckOut={handleCheckOutChange}
          onClearDates={handleClearDates}
          onBookNow={handleBookNow}
        />
      )}
      <ChatbotWidget
        positionClass="bottom-28 right-6"
        roomContext={room ? { roomId, name: room.name || room.type || "" } : null}
      />
    </>
  );
}
