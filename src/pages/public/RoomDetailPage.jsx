import { useEffect, useState, memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { NavLink, useParams } from "react-router-dom";
import { getRoom, isRoomActive, isRoomBookable } from "@/services/roomsService";
import { toggleFavorite, subscribeToFavorites } from "@/services/favoritesService";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import {
  listReviewsForRoom,
  createReview,
  hasUserReviewedRoom,
} from "@/services/reviewsService";
import { listBookingsForUser } from "@/services/bookingsService";
import { useAuth } from "@/contexts/AuthContext";
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
  ChevronLeft,
  ChevronRight,
  Heart,
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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function RoomDetailPage() {
  const { roomId } = useParams();
  const { user, role, profile, trainingMode } = useAuth();

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
        setError(e?.message || "Failed to load room.");
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
      setReviewsError(e?.message || "Failed to load reviews.");
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
        e?.message || "Failed to submit review. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ---- derived ----
  const status = room?.status || "Available";
  const roomActive = isRoomActive(room);
  const bookable = isRoomBookable(room);
  const photos = Array.isArray(room?.photos) ? room.photos : [];
  const amenities = Array.isArray(room?.amenities) ? room.amenities : [];

  // ---- render ----
  return (
    <div className="space-y-6 pb-10">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Room Details</h1>
        {room && (
          <p className="text-foreground/60 text-sm">
            {room.type ?? ""}
            {room.type && room.roomNumber ? " · " : ""}
            {room.roomNumber ? `Room ${room.roomNumber}` : ""}
            {room.floor ? ` · Floor ${room.floor}` : ""}
          </p>
        )}
      </div>

      {/* Room fetch error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">
          Loading room…
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
        <div className="space-y-6">
          {!roomActive && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground/90">
              <p className="font-medium">This room is no longer available</p>
              <p className="mt-1 text-foreground/70">
                This room has been removed from our inventory and cannot accept
                new bookings. You can still view its details from your booking
                history.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <NavLink to="/rooms">Browse Available Rooms</NavLink>
              </Button>
            </div>
          )}

          {/* Header card */}
          <div className="rounded-xl border border-border bg-background p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="text-xl font-semibold">
                  {room.name || room.type || "Room"}
                </div>
                <RoomStatusBadge status={status} />
              </div>
              <div className="flex items-center gap-3">
                {user && role === "guest" && (
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background hover:bg-muted transition-colors"
                    aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Heart
                      className={`h-5 w-5 transition-colors ${
                        isFavorite ? "fill-red-500 text-red-500" : "text-foreground/60"
                      }`}
                    />
                  </button>
                )}
                <div className="rounded-lg bg-primary/20 px-4 py-2 text-sm font-semibold whitespace-nowrap">
                  PHP {Number(room.ratePerNight ?? 0).toLocaleString()} / night
                </div>
              </div>
            </div>
          </div>

          {/* Photos */}
          {photos.length > 0 ? (
            <div className="rounded-xl border border-border bg-background overflow-hidden">
              {photos.length === 1 ? (
                <img
                  src={photos[0]}
                  alt={`${room.name || "Room"} photo`}
                  className="h-64 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="space-y-0">
                  {/* Main photo with controls */}
                  <div className="relative h-64 w-full select-none">
                    <img
                      src={photos[currentPhotoIndex]}
                      alt={`${room.name || "Room"} photo ${currentPhotoIndex + 1} of ${photos.length}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {/* Counter */}
                    <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white">
                      {currentPhotoIndex + 1} / {photos.length}
                    </div>
                    {/* Left arrow */}
                    <button
                      onClick={() =>
                        setCurrentPhotoIndex((i) =>
                          i === 0 ? photos.length - 1 : i - 1,
                        )
                      }
                      aria-label="Previous photo"
                      className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white transition-all duration-200 hover:bg-black/60 active:scale-95"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    {/* Right arrow */}
                    <button
                      onClick={() =>
                        setCurrentPhotoIndex((i) =>
                          i === photos.length - 1 ? 0 : i + 1,
                        )
                      }
                      aria-label="Next photo"
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white transition-all duration-200 hover:bg-black/60 active:scale-95"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                  {/* Dot indicators */}
                  <div className="flex items-center justify-center gap-1.5 py-3 bg-background">
                    {photos.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentPhotoIndex(idx)}
                        aria-label={`Go to photo ${idx + 1}`}
                        className={`h-2 w-2 rounded-full transition-colors ${
                          idx === currentPhotoIndex
                            ? "bg-primary"
                            : "bg-border hover:bg-foreground/15"
                        }`}
                      />
                    ))}
                  </div>
                  {/* Thumbnail strip */}
                  <div className="flex gap-2 overflow-x-auto p-3 pt-0">
                    {photos.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentPhotoIndex(idx)}
                        className={`flex-shrink-0 rounded-md overflow-hidden border-2 transition ${
                          idx === currentPhotoIndex
                            ? "border-primary"
                            : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={url}
                          alt={`Thumbnail ${idx + 1}`}
                          className="h-14 w-20 object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background flex items-center justify-center h-48 text-foreground/40 text-sm">
              No photos available for this room.
            </div>
          )}

          {/* Description */}
          {room.description && (
            <div className="rounded-xl border border-border bg-background p-5 space-y-2">
              <h2 className="font-semibold text-base">Description</h2>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                {room.description}
              </p>
            </div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div className="rounded-xl border border-border bg-background p-5 space-y-3">
              <h2 className="font-semibold text-base">Amenities</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {amenities.map((amenity, idx) => {
                  const Icon = amenityIcon(amenity);
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm"
                    >
                      <Icon
                        className="h-4 w-4 flex-shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="text-foreground/80 leading-tight">
                        {amenity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reviews */}
          <div className="rounded-xl border border-border bg-background p-5 space-y-4">
            <h2 className="font-semibold text-base">Guest Reviews</h2>

            {/* Reviews loading / error */}
            {reviewsLoading && (
              <p className="text-sm text-foreground/60">Loading reviews…</p>
            )}
            {reviewsError && !reviewsLoading && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
                {reviewsError}
              </div>
            )}

            {/* Reviews list */}
            {!reviewsLoading && !reviewsError && (
              <>
                {reviews.length === 0 ? (
                  <p className="text-sm text-foreground/50">No reviews yet.</p>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div
                        key={review.id}
                        className="rounded-lg border border-border bg-background/50 p-4 space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {review.guestName || "Guest"}
                          </span>
                          <span className="text-xs text-foreground/50">
                            {formatDate(review.createdAt)}
                          </span>
                        </div>
                        <StarDisplay rating={Number(review.rating ?? 0)} />
                        {review.feedback && (
                          <p className="text-sm text-foreground/75 leading-relaxed pt-1">
                            {review.feedback}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Review submission form */}
            {eligibilityChecked && canReview && (
              <div className="mt-4 rounded-lg border border-border bg-background/50 p-4 space-y-4">
                <h3 className="text-sm font-semibold">Leave a Review</h3>
                <form onSubmit={handleSubmitReview} className="space-y-4">
                  {/* Star selector */}
                  <div className="space-y-1">
                    <label className="text-xs text-foreground/60 uppercase tracking-wide">
                      Your Rating
                    </label>
                    <StarSelector value={formRating} onChange={setFormRating} />
                  </div>

                  {/* Feedback textarea */}
                  <div className="space-y-1">
                    <label
                      htmlFor="review-feedback"
                      className="text-xs text-foreground/60 uppercase tracking-wide"
                    >
                      Your Feedback
                    </label>
                    <textarea
                      id="review-feedback"
                      value={formFeedback}
                      onChange={(e) => setFormFeedback(e.target.value)}
                      rows={4}
                      placeholder="Share your experience with this room…"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      disabled={submitting}
                    />
                  </div>

                  {/* Inline error */}
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

          {/* Book Now */}
          <div>
            {!roomActive ? (
              <Button variant="default" className="w-full md:w-auto" disabled>
                Book Now (No Longer Available)
              </Button>
            ) : bookable ? (
              <Button asChild variant="default" className="w-full md:w-auto">
                <NavLink to={`/booking/${room.id}`}>Book Now</NavLink>
              </Button>
            ) : (
              <Button variant="default" className="w-full md:w-auto" disabled>
                Book Now (Unavailable)
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
