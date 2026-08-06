import { useEffect, useState, memo, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NavLink, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getRoom, isRoomActive } from "@/services/roomsService";
import { getRoomCapacity } from "@/lib/roomCapacity";
import { mapFirebaseError } from "@/lib/errors";
import { toggleFavorite, subscribeToFavorites } from "@/services/favoritesService";
import {
  listReviewsForRoom,
  createReview,
  hasUserReviewedRoom,
} from "@/services/reviewsService";
import { listBookingsForUser, getAvailableRooms } from "@/services/bookingsService";
import { useAuth } from "@/contexts/AuthContext";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryTransform";
import {
  Wifi,
  Wind,
  Tv,
  Bath,
  Users,
  Wine,
  UtensilsCrossed,
  Car,
  Waves,
  Dumbbell,
  Coffee,
  Lock,
  Building2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Heart,
  Calendar as CalendarIcon,
  Clock,
  ShieldCheck,
  Star,
  AlertTriangle,
  XCircle,
  SlidersHorizontal,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateLike) {
  try {
    const d = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
    if (!d || isNaN(d)) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function formatRate(rate) {
  if (rate == null || rate === "") return null;
  const num = Number(rate);
  if (isNaN(num)) return null;
  return num.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

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

const StarDisplay = memo(function StarDisplay({ rating, max = 5 }) {
  return (
    <span aria-label={`${rating} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) =>
        i < rating ? (
          <span key={i} className="text-primary text-base leading-none">
            ★
          </span>
        ) : (
          <span key={i} className="text-foreground/40 text-base leading-none">
            ☆
          </span>
        ),
      )}
    </span>
  );
});

const StarSelector = memo(function StarSelector({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;
  return (
    <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1;
        return (
          <span
            key={star}
            role="button"
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
            tabIndex={0}
            className={`text-2xl leading-none cursor-pointer select-none transition-colors duration-150 ${
              star <= display ? "text-primary" : "text-foreground/40"
            }`}
            onMouseEnter={() => setHovered(star)}
            onClick={() => onChange(star)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onChange(star);
            }}
          >
            {star <= display ? "★" : "☆"}
          </span>
        );
      })}
    </div>
  );
});

function PhotoCarousel({ photos, roomName, isFavorite, onToggleFavorite, user, role }) {
  const [current, setCurrent] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-background flex items-center justify-center h-80 text-foreground/40 text-sm">
        No photos available for this room.
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-border/40 shadow-[0_4px_24px_rgba(28,28,30,0.06)]">
        <img
          src={optimizeCloudinaryUrl(photos[0], { width: 1200 })}
          alt={`${roomName || "Room"} photo`}
          className="h-80 w-full object-cover"
          loading="lazy"
        />
        {user && role === "guest" && (
          <button
            type="button"
            onClick={onToggleFavorite}
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white transition-colors"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={`h-5 w-5 transition-colors ${isFavorite ? "fill-red-500 text-red-500" : "text-foreground/60"}`} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-border/40 shadow-[0_4px_24px_rgba(28,28,30,0.06)] bg-white">
      {/* Main image */}
      <div className="relative h-80 md:h-[420px] select-none">
        <img
          src={optimizeCloudinaryUrl(photos[current], { width: 1200 })}
          alt={`${roomName || "Room"} photo ${current + 1} of ${photos.length}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />

        {/* Counter */}
        <div className="absolute right-4 top-4 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white backdrop-blur-sm">
          {current + 1} / {photos.length}
        </div>

        {/* Favorite */}
        {user && role === "guest" && (
          <button
            type="button"
            onClick={onToggleFavorite}
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white transition-colors"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={`h-5 w-5 transition-colors ${isFavorite ? "fill-red-500 text-red-500" : "text-foreground/60"}`} />
          </button>
        )}

        {/* Arrows */}
        <button
          onClick={() => setCurrent((i) => (i === 0 ? photos.length - 1 : i - 1))}
          aria-label="Previous photo"
          className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 active:scale-95 transition-all backdrop-blur-sm"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => setCurrent((i) => (i === photos.length - 1 ? 0 : i + 1))}
          aria-label="Next photo"
          className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 active:scale-95 transition-all backdrop-blur-sm"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto p-3">
        {photos.map((url, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
              idx === current
                ? "border-primary shadow-[0_0_0_2px_rgba(245,197,24,0.2)]"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            <img
              src={optimizeCloudinaryUrl(url, { width: 200 })}
              alt={`Thumbnail ${idx + 1}`}
              className="h-14 w-20 object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RoomDetailPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role, profile, trainingMode } = useAuth();

  // --- date state (initialised from URL params set by RENO-1) ---
  const todayStr = useMemo(() => getLocalDateString(), []);
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") || "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") || "");

  const minCheckOutStr = checkIn || todayStr;
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

  // --- form state ---
  const [formRating, setFormRating] = useState(0);
  const [formFeedback, setFormFeedback] = useState("");
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // --- favorites state ---
  const [favorites, setFavorites] = useState([]);
  const [isFavorite, setIsFavorite] = useState(false);

  // --- policies expand state ---
  const [policiesExpanded, setPoliciesExpanded] = useState(false);

  // --- book now state ---
  const [bookNowLoading, setBookNowLoading] = useState(false);
  const [bookNowError, setBookNowError] = useState(null);

  // --- reviews overlay state ---
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState("all");

  // ---- fetch room ----
  useEffect(() => {
    let isMounted = true;
    async function loadRoom() {
      try {
        setLoading(true);
        setError(null);
        const data = await getRoom(roomId);
        if (!isMounted) return;
        setRoom(data);
        setCurrentPhotoIndex(0);
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
  async function loadReviews() {
    setReviewsLoading(true);
    setReviewsError(null);
    try {
      const data = await listReviewsForRoom(roomId, { trainingMode });
      setReviews(data);
    } catch (e) {
      setReviewsError(mapFirebaseError(e) || "Failed to load reviews.");
    } finally {
      setReviewsLoading(false);
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
          listBookingsForUser(user.uid, { trainingMode }),
          hasUserReviewedRoom(user.uid, roomId, { trainingMode }),
        ]);

        if (!isMounted) return;

        if (alreadyReviewed) {
          setCanReview(false);
          setEligibilityChecked(true);
          return;
        }

        const checkedOut = bookings.find(
          (b) => b.roomId === roomId && b.status === "Checked Out",
        );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  async function handleSubmitReview(e) {
    e.preventDefault();
    setSubmitError(null);

    if (!formRating || formRating < 1) {
      setSubmitError("Please select a star rating.");
      return;
    }
    if (!formFeedback.trim()) {
      setSubmitError("Please enter your feedback.");
      return;
    }

    setSubmitting(true);
    try {
      await createReview({
        roomId,
        bookingId: eligibleBookingId ?? "",
        guestId: user.uid,
        guestName: profile?.fullName || user.displayName || user.email || "Guest",
        rating: formRating,
        feedback: formFeedback.trim(),
        trainingMode,
      });
      setFormRating(0);
      setFormFeedback("");
      setCanReview(false);
      await loadReviews();
    } catch (e) {
      setSubmitError(
        mapFirebaseError(e) || "Failed to submit review. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ---- RENO-2: defensive Book Now — re-validates availability before navigating ----
  const handleBookNow = useCallback(async () => {
    if (!datesSelected || !room) return;
    setBookNowLoading(true);
    setBookNowError(null);
    try {
      const available = await getAvailableRooms(checkIn, checkOut, { trainingMode });
      const isStillAvailable = available.some((r) => r.id === roomId);
      if (!isStillAvailable) {
        setBookNowError(
          "This room is no longer available for your selected dates. It may have just been booked. Please choose different dates.",
        );
        return;
      }
      const dateParams = `?checkIn=${checkIn}&checkOut=${checkOut}`;
      navigate(`/booking/${roomId}${dateParams}`);
    } catch (e) {
      setBookNowError(mapFirebaseError(e) || "Could not verify availability. Please try again.");
    } finally {
      setBookNowLoading(false);
    }
  }, [datesSelected, room, checkIn, checkOut, trainingMode, roomId, navigate]);

  // ---- derived ----
  const roomActive = isRoomActive(room);
  const photos = Array.isArray(room?.photos) ? room.photos : [];
  const amenities = Array.isArray(room?.amenities) ? room.amenities : [];
  const facilities = Array.isArray(room?.facilities) ? room.facilities : [];
  const formattedRate = useMemo(() => formatRate(room?.ratePerNight), [room?.ratePerNight]);
  const totalCost = useMemo(() => {
    if (!formattedRate || !nights) return null;
    const total = Number(room?.ratePerNight ?? 0) * nights;
    return total.toLocaleString("en-PH", { minimumFractionDigits: 0 });
  }, [room?.ratePerNight, nights, formattedRate]);

  // Average rating
  const avgRating = useMemo(() => {
    if (!reviews.length) return null;
    const sum = reviews.reduce((acc, r) => acc + Number(r.rating ?? 0), 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  // Filtered reviews for overlay
  const filteredReviews = useMemo(() => {
    if (reviewFilter === "all") return reviews;
    const star = Number(reviewFilter);
    return reviews.filter((r) => Number(r.rating ?? 0) === star);
  }, [reviews, reviewFilter]);

  const reviewCounts = useMemo(() => {
    const counts = { all: reviews.length };
    for (let i = 1; i <= 5; i++) {
      counts[i] = reviews.filter((r) => Number(r.rating ?? 0) === i).length;
    }
    return counts;
  }, [reviews]);

  const showReviewCount = 3;
  const hasMoreReviews = reviews.length > showReviewCount;
  const visibleReviews = reviews.slice(0, showReviewCount);

  // ---- render ----
  return (
    <>
      {/* Main scrollable content */}
      <div className="space-y-6 pb-32">

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
              <div className="h-80 md:h-[420px] rounded-2xl bg-muted/20 animate-pulse" />
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

              {/* ── LEFT COLUMN: Photo Carousel (sticky) ── */}
              <div className="lg:col-span-5">
                <div className="lg:sticky lg:top-24">
                  <PhotoCarousel
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
                  {avgRating && (
                    <div className="flex items-center gap-1.5">
                      <Star className="h-4 w-4 fill-primary text-primary" />
                      <span className="text-sm font-semibold text-foreground">{avgRating}</span>
                      <span className="text-xs text-foreground/50">
                        ({reviews.length} review{reviews.length !== 1 ? "s" : ""})
                      </span>
                    </div>
                  )}
                </div>

                {/* Guest Capacity Badge */}
                {(() => {
                  const cap = getRoomCapacity(room);
                  return (
                    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-white p-3.5 shadow-[0_1px_3px_rgba(28,28,30,0.04)]">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 text-sm">
                        <span className="font-semibold text-foreground">Guest Capacity:</span>{" "}
                        <span className="text-foreground/85 font-medium">Up to {cap.maxPax} guests</span>{" "}
                        <span className="text-foreground/50 text-xs font-normal">({cap.basePax} included in rate{cap.extraPaxFee > 0 ? `, +₱${cap.extraPaxFee.toLocaleString()}/night per extra guest` : ""})</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Description */}
                {room.description && (
                  <div className="space-y-3">
                    <h2 className="font-playfair text-lg font-semibold text-foreground">About this room</h2>
                    <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-line">
                      {room.description}
                    </p>
                  </div>
                )}

                {/* Check-in / Check-out — Minimal */}
                {(room.checkInTime || room.checkOutTime) && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-xl border border-border/50 bg-white px-4 py-3 text-center shadow-[0_1px_3px_rgba(28,28,30,0.04)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40 mb-1">Check-in</p>
                      <p className="text-sm font-medium text-foreground">{room.checkInTime || "—"}</p>
                    </div>
                    <div className="flex items-center justify-center">
                      <div className="h-px w-6 bg-border" />
                      <ChevronRight className="h-3.5 w-3.5 text-foreground/25 -mx-0.5" />
                      <div className="h-px w-6 bg-border" />
                    </div>
                    <div className="flex-1 rounded-xl border border-border/50 bg-white px-4 py-3 text-center shadow-[0_1px_3px_rgba(28,28,30,0.04)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/40 mb-1">Check-out</p>
                      <p className="text-sm font-medium text-foreground">{room.checkOutTime || "—"}</p>
                    </div>
                  </div>
                )}

                {/* Amenities — Unique Grid */}
                {amenities.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="font-playfair text-lg font-semibold text-foreground">Room Amenities</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {amenities.map((amenity, idx) => {
                        const Icon = amenityIcon(amenity);
                        return (
                          <div
                            key={idx}
                            className="flex flex-col items-center gap-2.5 rounded-xl border border-border/40 bg-white px-3 py-4 text-center shadow-[0_1px_3px_rgba(28,28,30,0.04)]"
                          >
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/15 transition-colors">
                              <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                            </div>
                            <span className="text-xs font-medium text-foreground/70 leading-tight">{amenity}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Hotel Facilities — Pill Tags */}
                {facilities.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="font-playfair text-lg font-semibold text-foreground">Hotel Facilities</h2>
                    <div className="flex flex-wrap gap-2">
                      {facilities.map((facility, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3.5 py-1.5 text-xs font-medium text-foreground/70"
                        >
                          <CheckCircle className="h-3 w-3 text-primary" />
                          {facility}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <Separator className="bg-border/50" />

                {/* Guest Reviews — List + Show More */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-playfair text-lg font-semibold text-foreground">Guest Reviews</h2>
                    {avgRating && (
                      <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
                        <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                        <span className="text-sm font-semibold text-foreground">{avgRating}</span>
                      </div>
                    )}
                  </div>

                  {reviewsLoading && (
                    <p className="text-sm text-foreground/50">Loading reviews…</p>
                  )}
                  {reviewsError && !reviewsLoading && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
                      {reviewsError}
                    </div>
                  )}

                  {!reviewsLoading && !reviewsError && (
                    <>
                      {reviews.length === 0 ? (
                        <p className="text-sm text-foreground/50">No reviews yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {visibleReviews.map((review) => (
                            <div
                              key={review.id}
                              className="rounded-xl border border-border/40 bg-white p-4 space-y-2.5 shadow-[0_1px_3px_rgba(28,28,30,0.04)]"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {review.guestName || "Guest"}
                                </span>
                                <span className="text-xs text-foreground/40">
                                  {formatDate(review.createdAt)}
                                </span>
                              </div>
                              <StarDisplay rating={Number(review.rating ?? 0)} />
                              {review.feedback && (
                                <p className="text-sm text-foreground/65 leading-relaxed">
                                  {review.feedback}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {hasMoreReviews && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full bg-white/80 backdrop-blur-sm"
                          onClick={() => {
                            setReviewFilter("all");
                            setReviewsOpen(true);
                          }}
                        >
                          Show All Reviews ({reviews.length})
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Review submission form */}
                {eligibilityChecked && canReview && (
                  <div className="rounded-xl border border-border/40 bg-white p-5 space-y-4 shadow-[0_1px_3px_rgba(28,28,30,0.04)]">
                    <h3 className="font-playfair text-base font-semibold text-foreground">Leave a Review</h3>
                    <form onSubmit={handleSubmitReview} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground/50 uppercase tracking-wider">
                          Your Rating<RequiredIndicator />
                        </label>
                        <StarSelector value={formRating} onChange={setFormRating} />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="review-feedback"
                          className="text-xs font-medium text-foreground/50 uppercase tracking-wider"
                        >
                          Your Feedback<RequiredIndicator />
                        </label>
                        <textarea
                          id="review-feedback"
                          value={formFeedback}
                          onChange={(e) => setFormFeedback(e.target.value)}
                          rows={4}
                          placeholder="Share your experience with this room…"
                          className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/35 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none transition-colors"
                          disabled={submitting}
                        />
                      </div>
                      {submitError && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
                          {submitError}
                        </div>
                      )}
                      <Button
                        type="submit"
                        variant="default"
                        disabled={submitting}
                        className="w-full sm:w-auto"
                      >
                        {submitting ? "Submitting…" : "Submit Review"}
                      </Button>
                    </form>
                  </div>
                )}

              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── REVIEWS OVERLAY (Dialog) ── */}
      <Dialog open={reviewsOpen} onOpenChange={setReviewsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-playfair text-xl">All Guest Reviews</DialogTitle>
            <DialogDescription>
              {reviews.length} review{reviews.length !== 1 ? "s" : ""} for this room
            </DialogDescription>
          </DialogHeader>

          {/* Filter bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
            {["all", "5", "4", "3", "2", "1"].map((f) => (
              <button
                key={f}
                onClick={() => setReviewFilter(f)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  reviewFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/20 text-foreground/60 hover:bg-muted/30"
                }`}
              >
                {f === "all" ? `All (${reviewCounts.all})` : `${f} ★ (${reviewCounts[Number(f)] || 0})`}
              </button>
            ))}
          </div>

          {/* Reviews list */}
          <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
            {filteredReviews.length === 0 ? (
              <p className="text-sm text-foreground/50 text-center py-8">No reviews match this filter.</p>
            ) : (
              filteredReviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-xl border border-border/40 bg-background p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {review.guestName || "Guest"}
                    </span>
                    <span className="text-xs text-foreground/40">
                      {formatDate(review.createdAt)}
                    </span>
                  </div>
                  <StarDisplay rating={Number(review.rating ?? 0)} />
                  {review.feedback && (
                    <p className="text-sm text-foreground/65 leading-relaxed">
                      {review.feedback}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── POLICIES OVERLAY (Dialog) ── */}
      {room?.policies && (
        <Dialog open={policiesExpanded} onOpenChange={setPoliciesExpanded}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-playfair text-xl flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                Cancel Policy
              </DialogTitle>
              <DialogDescription>
                Please review the cancellation terms for this room
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-border/40 bg-background p-4">
              <p className="text-sm text-foreground/75 leading-relaxed whitespace-pre-line">
                {room.policies}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── STICKY BOTTOM BAR ── */}
      {!loading && room && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-primary/20 bg-background/95 backdrop-blur-sm shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">

              {/* Price block */}
              <div className="flex items-baseline gap-1.5 shrink-0">
                {formattedRate ? (
                  <>
                    <span className="font-playfair text-2xl font-bold text-foreground">
                      PHP {formattedRate}
                    </span>
                    <span className="text-sm text-foreground/50">/ night</span>
                    {datesSelected && totalCost && (
                      <span className="ml-2 text-xs text-foreground/50">
                        · PHP {totalCost} total ({nights} night{nights !== 1 ? "s" : ""})
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-foreground/50">Rate not set</span>
                )}
              </div>

              {/* Date pickers — shown in bar if dates not yet selected */}
              {!datesSelected && (
                <div className="flex flex-1 items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Input
                      type="date"
                      value={checkIn}
                      min={todayStr}
                      onChange={(e) => handleCheckInChange(e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onFocus={(e) => e.target.blur()}
                      className="pr-9 border-border text-sm [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer w-40"
                      placeholder="Check-in"
                    />
                    <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40 pointer-events-none" />
                  </div>
                  <span className="text-foreground/30 text-sm">→</span>
                  <div className="relative">
                    <Input
                      type="date"
                      value={checkOut}
                      min={minCheckOutStr}
                      disabled={!checkIn}
                      onChange={(e) => handleCheckOutChange(e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onFocus={(e) => e.target.blur()}
                      className="pr-9 border-border text-sm [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer disabled:cursor-not-allowed w-40"
                      placeholder="Check-out"
                    />
                    <CalendarIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Dates summary pill when dates are selected */}
              {datesSelected && (
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs text-foreground/70">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {checkIn} → {checkOut}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setCheckIn(""); setCheckOut(""); setBookNowError(null); }}
                    className="text-xs text-foreground/45 hover:text-foreground underline underline-offset-2"
                  >
                    Change dates
                  </button>
                </div>
              )}

              {/* Book Now button */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                {!roomActive ? (
                  <Button variant="default" disabled className="min-w-36">
                    No Longer Available
                  </Button>
                ) : !datesSelected ? (
                  <Button variant="default" disabled className="min-w-36">
                    Select Dates to Book
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    onClick={handleBookNow}
                    disabled={bookNowLoading}
                    className="min-w-36"
                  >
                    {bookNowLoading ? "Checking…" : "Book Now"}
                  </Button>
                )}
                {bookNowError && (
                  <p className="text-xs text-destructive max-w-xs text-right">{bookNowError}</p>
                )}
                {room.policies && (
                  <button
                    type="button"
                    onClick={() => setPoliciesExpanded(true)}
                    className="text-xs text-foreground/45 hover:text-foreground/70 underline underline-offset-2 transition-colors"
                  >
                    Cancel Policy
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
