import { useEffect, useMemo, useState, memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NavLink } from "react-router-dom";
import { subscribeToRooms } from "@/services/roomsService";
import { toggleFavorite, subscribeToFavorites } from "@/services/favoritesService";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Heart, Calendar as CalendarIcon, Search, X, CheckCircle2, XCircle, Sparkles, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAvailableRooms, checkAndExpireStaleBookings } from "@/services/bookingsService";

const MASONRY_IMAGE_HEIGHTS = ["h-52", "h-64", "h-48"];

const ROOM_TYPES = [
  "All Types",
  "Single Room",
  "Suite Room",
  "Presidential Room",
];

function formatRate(rate) {
  if (rate == null || rate === "") return null;
  const num = Number(rate);
  if (isNaN(num)) return null;
  return num.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

function RoomCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-white overflow-hidden flex flex-col shadow-[0_2px_16px_rgba(28,28,30,0.06)]">
      <div className="h-56 md:h-full w-full bg-muted/20 animate-pulse" />
      <div className="flex flex-col flex-1 gap-3 p-5">
        <div className="space-y-2">
          <div className="h-5 w-3/4 rounded bg-muted/30 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-muted/20 animate-pulse" />
        </div>
        <div className="h-7 w-1/3 rounded bg-muted/25 animate-pulse" />
        <div className="h-3 w-full rounded bg-muted/20 animate-pulse" />
        <div className="flex-1" />
        <div className="flex gap-3 pt-2">
          <div className="h-10 flex-1 rounded-md bg-muted/25 animate-pulse" />
          <div className="h-10 flex-1 rounded-md bg-muted/30 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function RoomsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
      {[...Array(6)].map((_, i) => (
        <div key={i}>
          <RoomCardSkeleton />
        </div>
      ))}
    </div>
  );
}

function RoomPhotoGallery({ photos, alt, imageHeightClass }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const galleryPhotos = photos.slice(0, 4);
  const mainPhoto = galleryPhotos[activeIndex] ?? galleryPhotos[0];

  if (!mainPhoto) return null;

  return (
    <>
      <img
        src={mainPhoto}
        alt={alt}
        className={`w-full object-cover transform-gpu transition-transform duration-700 group-hover/card:scale-105 will-change-transform ${imageHeightClass}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      {galleryPhotos.length > 1 && (
        <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100">
          {galleryPhotos.slice(0, 3).map((photo, idx) => (
            <button
              key={idx}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onFocus={() => setActiveIndex(idx)}
              className={`overflow-hidden rounded-md border-2 transition-all ${
                activeIndex === idx
                  ? "border-white scale-105 shadow-md"
                  : "border-white/50 opacity-80 hover:opacity-100"
              }`}
              aria-label={`Preview photo ${idx + 1}`}
            >
              <img
                src={photo}
                alt=""
                className="h-10 w-12 object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Simplified room card per RENO-1 spec:
 * image · name · type subtitle · price · short description
 * Status badges and full amenity lists removed from card view.
 */
const RoomCard = memo(function RoomCard({
  room,
  animationIndex,
  layoutVariant,
  isFavorite,
  onToggleFavorite,
  /** RENO-1: selected dates to carry forward to detail/booking links */
  checkIn,
  checkOut,
  /** Whether dates have been checked and this room is available */
  checkedAvailable,
  /** Whether availability has been run at all */
  availabilityChecked,
  featured = false,
}) {
  const photos = Array.isArray(room.photos) ? room.photos : [];
  const firstPhoto = photos.length > 0 ? photos[0] : null;
  const imageHeightClass = featured ? "h-full" : MASONRY_IMAGE_HEIGHTS[layoutVariant % 3];
  const { user, role } = useAuth();

  const formattedRate = useMemo(
    () => formatRate(room.ratePerNight ?? room.rate ?? room.price),
    [room.ratePerNight, room.rate, room.price],
  );

  const subtitle = room.type || null;
  const descriptionSnippet =
    room.description && room.description.length > 0
      ? room.description.length > 90
        ? room.description.slice(0, 90) + "…"
        : room.description
      : null;

  const dateParams = checkIn && checkOut
    ? `?checkIn=${checkIn}&checkOut=${checkOut}`
    : "";

  // Determine availability display
  const roomStatus = room.status || "Available";
  const isAvailable = availabilityChecked ? checkedAvailable : roomStatus === "Available";

  // Map raw statuses to guest-friendly labels
  const statusDisplay = useMemo(() => {
    if (availabilityChecked) {
      return isAvailable
        ? { label: "Available", color: "bg-success/90", icon: "check" }
        : { label: "Unavailable", color: "bg-destructive/90", icon: "x" };
    }
    if (roomStatus === "Available") {
      return { label: "Available", color: "bg-success/90", icon: "check" };
    }
    if (roomStatus === "Occupied") {
      return { label: "Occupied", color: "bg-destructive/90", icon: "x" };
    }
    // Being Cleaned, Dirty / Needs Cleaning, Pending Approval → Needs Cleaning
    return { label: "Needs Cleaning", color: "bg-info/90", icon: "sparkle" };
  }, [roomStatus, availabilityChecked, isAvailable]);

  return (
    <div
      className={`room-card-enter group/card rounded-2xl border border-border/60 bg-white overflow-hidden shadow-[0_2px_16px_rgba(28,28,30,0.06)] hover:shadow-[0_8px_32px_rgba(28,28,30,0.12)] transition-[box-shadow,transform] duration-300 will-change-[box-shadow,transform] flex flex-col ${featured ? "md:flex-row md:min-h-[320px]" : ""}`}
      style={{ animationDelay: `${Math.min(animationIndex, 11) * 55}ms` }}
    >
      {/* Photo */}
      <div className={`relative overflow-hidden ${featured ? "md:w-1/2" : `w-full ${imageHeightClass}`}`}>
        {firstPhoto ? (
          <RoomPhotoGallery
            photos={photos}
            alt={room.name || "Room photo"}
            imageHeightClass={featured ? "h-56 md:h-full" : imageHeightClass}
          />
        ) : (
          <div className={`flex w-full items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 text-sm text-foreground/30 ${featured ? "h-56 md:h-full" : imageHeightClass}`}>
            No photo
          </div>
        )}

        {/* Availability chip */}
        <div className="absolute left-3 top-3 z-10">
          <span className={`inline-flex items-center gap-1 rounded-full ${statusDisplay.color} px-2.5 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-sm`}>
            {statusDisplay.icon === "check" && <CheckCircle2 className="h-3 w-3" />}
            {statusDisplay.icon === "x" && <XCircle className="h-3 w-3" />}
            {statusDisplay.icon === "sparkle" && <Sparkles className="h-3 w-3" />}
            {statusDisplay.label}
          </span>
        </div>

        {/* Favorite button */}
        {user && role === "guest" && (
          <button
            type="button"
            onClick={() => onToggleFavorite(room.id)}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-all duration-200 hover:bg-white group-hover/card:opacity-100 focus:opacity-100"
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart
              className={`h-4.5 w-4.5 transition-colors ${
                isFavorite ? "fill-red-500 text-red-500" : "text-foreground/60"
              }`}
            />
          </button>
        )}
      </div>

      {/* Card Body */}
      <div className={`flex flex-1 flex-col gap-3 p-5 ${featured ? "md:w-1/2 md:p-6 md:justify-between" : ""}`}>
        <div className="space-y-3">
          {/* Name + type */}
          <div className="min-w-0">
            <h3 className={`font-playfair font-semibold leading-tight text-foreground ${featured ? "text-xl md:text-2xl" : "text-lg"}`}>
              {room.name || "Unnamed Room"}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-foreground/55">{subtitle}</p>
            )}
          </div>

          {/* Price */}
          {formattedRate ? (
            <div className="flex items-baseline gap-1">
              <span className={`font-playfair font-bold text-foreground ${featured ? "text-2xl" : "text-2xl"}`}>
                PHP {formattedRate}
              </span>
              <span className="text-sm text-foreground/50">/ night</span>
            </div>
          ) : null}

          {/* Amenities preview (featured only) */}
          {featured && room.amenities && room.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {room.amenities.slice(0, 4).map((amenity, idx) => (
                <span
                  key={idx}
                  className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-xs text-foreground/60"
                >
                  {amenity}
                </span>
              ))}
              {room.amenities.length > 4 && (
                <span className="rounded-full border border-border/40 bg-muted/20 px-2 py-0.5 text-xs text-foreground/40">
                  +{room.amenities.length - 4} more
                </span>
              )}
            </div>
          )}

          {/* Short description */}
          {descriptionSnippet && (
            <p className="text-sm leading-relaxed text-foreground/65 line-clamp-2">
              {descriptionSnippet}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-1 mt-auto">
          <Button
            asChild
            variant="default"
            className="flex-1"
          >
            <NavLink to={`/rooms/${room.id}${dateParams}`}>
              View Details &amp; Book
            </NavLink>
          </Button>
        </div>
      </div>
    </div>
  );
});

const getLocalDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split("T")[0];
};

export default function RoomsPage() {
  const { user, role, trainingMode } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState(null);
  const [favorites, setFavorites] = useState([]);

  const [selectedType, setSelectedType] = useState("All Types");
  const [priceSort, setPriceSort] = useState("Default");

  // Date-range state
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  // RENO-1: on-action availability state
  // availabilityChecked = true only after "Check Availability" button is clicked
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [availableRoomIds, setAvailableRoomIds] = useState(new Set()); // IDs of available rooms after check
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(null);

  const todayStr = useMemo(() => getLocalDateString(), []);

  const minCheckOutStr = useMemo(() => {
    if (!checkIn) return todayStr;
    return checkIn;
  }, [checkIn, todayStr]);

  const handleCheckInChange = (val) => {
    setCheckIn(val);
    // Reset availability check when dates change
    setAvailabilityChecked(false);
    setAvailableRoomIds(new Set());
    setAvailabilityError(null);
    if (checkOut && val && new Date(`${checkOut}T00:00:00`) <= new Date(`${val}T00:00:00`)) {
      setCheckOut("");
    }
  };

  const handleCheckOutChange = (val) => {
    setCheckOut(val);
    // Reset availability check when dates change
    setAvailabilityChecked(false);
    setAvailableRoomIds(new Set());
    setAvailabilityError(null);
  };

  // RENO-1: on-action availability check triggered by button click
  const handleCheckAvailability = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      const available = await getAvailableRooms(checkIn, checkOut, { trainingMode });
      const ids = new Set(available.map((r) => r.id));
      setAvailableRoomIds(ids);
      setAvailabilityChecked(true);
    } catch (e) {
      console.error("Availability check failed:", e);
      setAvailabilityError("Could not check availability. Please try again.");
    } finally {
      setAvailabilityLoading(false);
    }
  }, [checkIn, checkOut, trainingMode]);

  const filterKey = `${selectedType}|${priceSort}|${checkIn}|${checkOut}|${availabilityChecked}`;

  useEffect(() => {
    let settled = false;
    setLoading(true);

    // Lazy-expire stale bookings (staff/training only — global sweep reads the
    // whole bookings collection, which guests aren't allowed to do /rooms rules)
    if (role === "fo" || role === "admin" || trainingMode) {
      checkAndExpireStaleBookings({ trainingMode }).catch((e) => {
        console.error("Failed to check stale bookings:", e);
      });
    }

    const unsubscribe = subscribeToRooms(
      (data) => {
        setRooms(data);
        if (!settled) {
          settled = true;
          setLoading(false);
        }
      },
      { trainingMode }
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [trainingMode, role]);

  useEffect(() => {
    if (!user || role !== "guest") {
      setFavorites([]);
      return;
    }

    const unsubscribe = subscribeToFavorites(user.uid, (data) => {
      setFavorites(data);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user, role]);

  const activeRooms = useMemo(
    () => rooms.filter((r) => r.isActive !== false),
    [rooms],
  );

  const filteredRooms = useMemo(() => {
    let result = activeRooms.filter((r) => {
      const typeMatch = selectedType === "All Types" || r.type === selectedType;

      // RENO-1: date filter applies only after "Check Availability" is clicked
      // If not checked → show all; if checked → only rooms in availableRoomIds
      const dateMatch = !availabilityChecked || availableRoomIds.has(r.id);

      return typeMatch && dateMatch;
    });

    if (priceSort === "Low to High")
      result = [...result].sort(
        (a, b) => (Number(a.ratePerNight) || 0) - (Number(b.ratePerNight) || 0),
      );
    if (priceSort === "High to Low")
      result = [...result].sort(
        (a, b) => (Number(b.ratePerNight) || 0) - (Number(a.ratePerNight) || 0),
      );
    return result;
  }, [activeRooms, selectedType, priceSort, availabilityChecked, availableRoomIds]);

  function clearFilters() {
    setSelectedType("All Types");
    setPriceSort("Default");
    setCheckIn("");
    setCheckOut("");
    setAvailabilityChecked(false);
    setAvailableRoomIds(new Set());
    setAvailabilityError(null);
  }

  async function handleToggleFavorite(roomId) {
    if (!user || role !== "guest") return;
    try {
      await toggleFavorite(user.uid, roomId);
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
    }
  }

  const favoriteRoomIds = useMemo(
    () => new Set(favorites.map((f) => f.roomId)),
    [favorites],
  );

  const filtersAreDefault =
    selectedType === "All Types" &&
    priceSort === "Default" &&
    !checkIn &&
    !checkOut;

  const datesReady = checkIn && checkOut;

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="space-y-3">
        <h1 className="font-playfair text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Our Rooms
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-foreground/70">
          Discover your perfect stay. Each room is designed for comfort and elegance.
        </p>
      </div>

      {/* Filters — slim inline bar */}
      <div className="space-y-3">
        {/* Row 1: Date pickers + Search */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[150px]">
            <div className="relative">
              <Input
                type="date"
                value={checkIn}
                min={todayStr}
                placeholder="Check-in"
                onChange={(e) => handleCheckInChange(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onFocus={(e) => e.target.blur()}
                className="pr-10 border-border text-sm h-10 rounded-lg [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer"
              />
              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 min-w-[150px]">
            <div className="relative">
              <Input
                type="date"
                value={checkOut}
                min={minCheckOutStr}
                disabled={!checkIn}
                placeholder="Check-out"
                onChange={(e) => handleCheckOutChange(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onFocus={(e) => e.target.blur()}
                className="pr-10 border-border text-sm h-10 rounded-lg [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer disabled:cursor-not-allowed"
              />
              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
            </div>
          </div>
          {datesReady && (
            <Button
              type="button"
              onClick={handleCheckAvailability}
              disabled={availabilityLoading}
              className="gap-2 h-10 rounded-lg"
            >
              <Search className="h-4 w-4" />
              {availabilityLoading
                ? "Checking…"
                : availabilityChecked
                  ? "Re-check"
                  : "Check Availability"}
            </Button>
          )}
        </div>

        {/* Availability status line */}
        {availabilityChecked && (
          <p className="text-xs text-foreground/50">
            Showing rooms available{" "}
            <span className="font-medium text-foreground">{checkIn} → {checkOut}</span>
            {availabilityError && (
              <span className="ml-2 text-destructive">{availabilityError}</span>
            )}
          </p>
        )}
        {!datesReady && (
          <p className="text-xs text-foreground/40">
            Select dates to check availability — or browse all rooms below.
          </p>
        )}

        {/* Row 2: Room type pills + Price sort */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          {ROOM_TYPES.map((type) => {
            const isActive = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
                }`}
              >
                {type}
              </button>
            );
          })}

          <div className="w-px h-5 bg-border/60 mx-1" />

          {/* Price sort dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
              >
                {priceSort === "Default" ? "Sort by Price" : priceSort}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1 bg-background" align="start">
              {["Default", "Low to High", "High to Low"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPriceSort(opt)}
                  className={`w-full text-left rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    priceSort === opt
                      ? "bg-primary/15 text-foreground font-medium"
                      : "text-foreground/70 hover:bg-surface-hover"
                  }`}
                >
                  {opt === "Default" ? "Default Order" : `Price: ${opt}`}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Row 3: Result count + clear */}
        {!loading && !error && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-foreground/50">
              Showing {filteredRooms.length} of {activeRooms.length} room
              {activeRooms.length !== 1 ? "s" : ""}
              {availabilityChecked ? " · filtered by dates" : ""}
            </p>
            {!filtersAreDefault && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="h-8 px-3 text-xs gap-1.5"
              >
                <X className="h-3 w-3" />
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* States */}
      {loading && <RoomsGridSkeleton />}

      {!loading && error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && filteredRooms.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-background p-10 text-center">
          <p className="text-sm text-foreground/60">
            {availabilityChecked
              ? "No rooms are available for your selected dates."
              : "No rooms match your filters."}
          </p>
          {!filtersAreDefault && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      )}

      {/* Room Grid */}
      {!loading && !error && filteredRooms.length > 0 && (
        <div key={filterKey} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 items-stretch">
          {filteredRooms.map((room, index) => (
            <div key={room.id}>
              <RoomCard
                room={room}
                animationIndex={index}
                layoutVariant={index}
                isFavorite={favoriteRoomIds.has(room.id)}
                onToggleFavorite={handleToggleFavorite}
                checkIn={checkIn}
                checkOut={checkOut}
                checkedAvailable={availabilityChecked ? availableRoomIds.has(room.id) : true}
                availabilityChecked={availabilityChecked}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
