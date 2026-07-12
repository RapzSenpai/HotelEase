import { useEffect, useMemo, useState, memo } from "react";
import { Select } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NavLink } from "react-router-dom";
import { subscribeToRooms } from "@/services/roomsService";
import { toggleFavorite, subscribeToFavorites } from "@/services/favoritesService";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import { Heart, Calendar as CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAvailableRoomIds } from "@/services/bookingsService";

const MASONRY_IMAGE_HEIGHTS = ["h-52", "h-64", "h-48"];
const MASONRY_DESC_LINES = ["line-clamp-2", "line-clamp-3", "line-clamp-2"];

const ROOM_TYPES = [
  "All Types",
  "Single Room",
  "Suite Room",
  "Presidential Room",
];

const AVAILABILITY_STATUSES = [
  "All",
  "Available",
  "Reserved",
  "Occupied",
  "Being Cleaned",
  "Pending Approval",
  "Out of Order",
  "Dirty / Needs Cleaning",
];

const SELECT_TRIGGER_CLASS =
  "flex h-10 w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30";
const SELECT_CONTENT_CLASS =
  "z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md";
const SELECT_ITEM_CLASS =
  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground";

function formatRate(rate) {
  if (rate == null || rate === "") return null;
  const num = Number(rate);
  if (isNaN(num)) return null;
  return num.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

function RoomCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-white overflow-hidden flex flex-col shadow-[0_2px_16px_rgba(28,28,30,0.06)]">
      <div className="h-56 w-full bg-muted/20 animate-pulse" />
      <div className="flex flex-col flex-1 gap-4 p-6">
        <div className="space-y-2">
          <div className="h-5 w-3/4 rounded bg-muted/30 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-muted/20 animate-pulse" />
        </div>
        <div className="h-7 w-1/3 rounded bg-muted/25 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-muted/20 animate-pulse" />
          <div className="h-3 w-4/5 rounded bg-muted/20 animate-pulse" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="h-6 w-16 rounded-full bg-muted/20 animate-pulse" />
          <div className="h-6 w-20 rounded-full bg-muted/20 animate-pulse" />
          <div className="h-6 w-14 rounded-full bg-muted/20 animate-pulse" />
        </div>
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
    <div className="columns-1 gap-6 space-y-6 sm:columns-2 lg:columns-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mb-6 break-inside-avoid">
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

const RoomCard = memo(function RoomCard({
  room,
  animationIndex,
  layoutVariant,
  isFavorite,
  onToggleFavorite,
}) {
  const photos = Array.isArray(room.photos) ? room.photos : [];
  const firstPhoto = photos.length > 0 ? photos[0] : null;
  const isAvailable = room.status === "Available";
  const imageHeightClass = MASONRY_IMAGE_HEIGHTS[layoutVariant % 3];
  const descLineClass = MASONRY_DESC_LINES[layoutVariant % 3];
  const { user, role } = useAuth();

  const descriptionSnippet =
    room.description && room.description.length > 0
      ? room.description.length > 100
        ? room.description.slice(0, 100) + "…"
        : room.description
      : null;

  const allAmenities = useMemo(
    () => (Array.isArray(room.amenities) ? room.amenities : []),
    [room.amenities],
  );
  const previewAmenities = allAmenities.slice(0, 4);
  const extraCount = allAmenities.length - previewAmenities.length;

  const formattedRate = useMemo(
    () => formatRate(room.ratePerNight ?? room.rate ?? room.price),
    [room.ratePerNight, room.rate, room.price],
  );

  return (
    <div
      className="room-card-enter group/card rounded-2xl border border-border/60 bg-white overflow-hidden flex flex-col shadow-[0_2px_16px_rgba(28,28,30,0.06)] hover:shadow-[0_8px_32px_rgba(28,28,30,0.12)] transition-[box-shadow,transform] duration-300 will-change-[box-shadow,transform]"
      style={{ animationDelay: `${Math.min(animationIndex, 11) * 55}ms` }}
    >
      {/* Photo / Placeholder */}
      <div className={`relative w-full overflow-hidden ${imageHeightClass}`}>
        {firstPhoto ? (
          <RoomPhotoGallery
            photos={photos}
            alt={room.name || "Room photo"}
            imageHeightClass={imageHeightClass}
          />
        ) : (
          <div className={`flex w-full items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 text-sm text-foreground/30 ${imageHeightClass}`}>
            No photo
          </div>
        )}
        {user && role === "guest" && (
          <button
            type="button"
            onClick={() => onToggleFavorite(room.id)}
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-all duration-200 hover:bg-white group-hover/card:opacity-100 focus:opacity-100"
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
      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Name + Number + Status Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-playfair text-lg font-semibold leading-tight text-foreground">
              {room.name || "Unnamed Room"}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              {room.roomNumber && (
                <span className="text-xs font-medium text-foreground/50">
                  #{room.roomNumber}
                </span>
              )}
              {room.roomNumber && room.type && (
                <span className="text-foreground/20">•</span>
              )}
              {room.type && (
                <span className="text-xs text-foreground/60">{room.type}</span>
              )}
            </div>
          </div>
          <RoomStatusBadge status={room.status} />
        </div>

        {/* Rate */}
        {formattedRate ? (
          <div className="flex items-baseline gap-1">
            <span className="font-playfair text-2xl font-bold text-foreground">
              PHP {formattedRate}
            </span>
            <span className="text-sm text-foreground/50">/ night</span>
          </div>
        ) : null}

        {/* Description snippet */}
        {descriptionSnippet && (
          <p className={`text-sm leading-relaxed text-foreground/70 ${descLineClass}`}>
            {descriptionSnippet}
          </p>
        )}

        {/* Amenities preview */}
        {previewAmenities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previewAmenities.map((amenity, idx) => (
              <span
                key={idx}
                className="rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-xs text-foreground/70"
              >
                {amenity}
              </span>
            ))}
            {extraCount > 0 && (
              <span className="rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-xs text-foreground/50">
                +{extraCount} more
              </span>
            )}
          </div>
        )}

        {/* Spacer to push buttons to bottom */}
        <div className="flex-1" />

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            asChild
            variant="outline"
            className="flex-1"
          >
            <NavLink to={`/rooms/${room.id}`}>
              View Full Details
            </NavLink>
          </Button>
          <Button
            asChild
            variant="default"
            className="flex-1"
            disabled={!isAvailable}
          >
            <NavLink
              to={`/booking/${room.id}`}
              tabIndex={!isAvailable ? -1 : undefined}
              onClick={!isAvailable ? (e) => e.preventDefault() : undefined}
              aria-disabled={!isAvailable}
              className={!isAvailable ? "pointer-events-none opacity-50" : ""}
            >
              Book Now
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
  const [selectedAvailability, setSelectedAvailability] = useState("All");
  const [priceSort, setPriceSort] = useState("Default");

  // Date-range filters
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [conflictingRoomIds, setConflictingRoomIds] = useState(new Set());

  const todayStr = useMemo(() => getLocalDateString(), []);

  const minCheckOutStr = useMemo(() => {
    if (!checkIn) return todayStr;
    return checkIn;
  }, [checkIn, todayStr]);

  const handleCheckInChange = (val) => {
    setCheckIn(val);
    if (checkOut && val && new Date(`${checkOut}T00:00:00`) <= new Date(`${val}T00:00:00`)) {
      setCheckOut("");
    }
  };

  const filterKey = `${selectedType}|${selectedAvailability}|${priceSort}|${checkIn}|${checkOut}`;

  useEffect(() => {
    let settled = false;
    setLoading(true);

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
  }, [trainingMode]);

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

  // Fetch conflicting room IDs based on selected check-in/check-out dates
  useEffect(() => {
    let isMounted = true;
    async function fetchAvailability() {
      if (!checkIn || !checkOut) {
        setConflictingRoomIds(new Set());
        return;
      }
      const checkInDate = new Date(`${checkIn}T00:00:00`);
      const checkOutDate = new Date(`${checkOut}T00:00:00`);
      if (checkOutDate <= checkInDate) {
        setConflictingRoomIds(new Set());
        return;
      }

      try {
        const ids = await getAvailableRoomIds(checkIn, checkOut, { trainingMode });
        if (isMounted) {
          setConflictingRoomIds(ids);
        }
      } catch (e) {
        console.error("Failed to check room availability:", e);
      }
    }
    fetchAvailability();
    return () => {
      isMounted = false;
    };
  }, [checkIn, checkOut, trainingMode]);

  const filteredRooms = useMemo(() => {
    let result = activeRooms.filter((r) => {
      const typeMatch = selectedType === "All Types" || r.type === selectedType;
      const availabilityMatch =
        selectedAvailability === "All" || r.status === selectedAvailability;

      const isConflicting = conflictingRoomIds.has(r.id);
      const datesMatch = !checkIn || !checkOut || !isConflicting;

      return typeMatch && availabilityMatch && datesMatch;
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
  }, [activeRooms, selectedType, selectedAvailability, priceSort, conflictingRoomIds, checkIn, checkOut]);

  function clearFilters() {
    setSelectedType("All Types");
    setSelectedAvailability("All");
    setPriceSort("Default");
    setCheckIn("");
    setCheckOut("");
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
    selectedAvailability === "All" &&
    priceSort === "Default" &&
    !checkIn &&
    !checkOut;

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

      {/* Filters */}
      <div className="space-y-5 rounded-2xl border border-border/60 bg-white/50 p-6 shadow-[0_2px_12px_rgba(28,28,30,0.04)] backdrop-blur-sm">
        {/* Date range picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-border/50">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground/50 flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-primary" /> Check-In Date
            </label>
            <div className="relative group">
              <Input
                type="date"
                value={checkIn}
                min={todayStr}
                onChange={(e) => handleCheckInChange(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onFocus={(e) => e.target.blur()}
                className="pr-10 border-border text-sm block [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer"
              />
              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground/50 flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-primary" /> Check-Out Date
            </label>
            <div className="relative group">
              <Input
                type="date"
                value={checkOut}
                min={minCheckOutStr}
                disabled={!checkIn}
                onChange={(e) => setCheckOut(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onFocus={(e) => e.target.blur()}
                className="pr-10 border-border text-sm block [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer disabled:cursor-not-allowed"
              />
              <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          {/* Room Type */}
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Room Type
            </label>
            <Select.Root value={selectedType} onValueChange={setSelectedType}>
              <Select.Trigger className={SELECT_TRIGGER_CLASS}>
                <Select.Value placeholder="Room Type" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className={SELECT_CONTENT_CLASS}>
                  <Select.Viewport>
                    {ROOM_TYPES.map((t) => (
                      <Select.Item key={t} value={t} className={SELECT_ITEM_CLASS}>
                        <Select.ItemText>{t}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          {/* Availability */}
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Availability
            </label>
            <Select.Root
              value={selectedAvailability}
              onValueChange={setSelectedAvailability}
            >
              <Select.Trigger className={SELECT_TRIGGER_CLASS}>
                <Select.Value placeholder="Availability" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className={SELECT_CONTENT_CLASS}>
                  <Select.Viewport>
                    {AVAILABILITY_STATUSES.map((s) => (
                      <Select.Item key={s} value={s} className={SELECT_ITEM_CLASS}>
                        <Select.ItemText>{s}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          {/* Price Sort */}
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
              Price
            </label>
            <Select.Root value={priceSort} onValueChange={setPriceSort}>
              <Select.Trigger className={SELECT_TRIGGER_CLASS}>
                <Select.Value placeholder="Price" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className={SELECT_CONTENT_CLASS}>
                  <Select.Viewport>
                    <Select.Item value="Default" className={SELECT_ITEM_CLASS}>
                      <Select.ItemText>Default Order</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="Low to High" className={SELECT_ITEM_CLASS}>
                      <Select.ItemText>Price: Low to High</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="High to Low" className={SELECT_ITEM_CLASS}>
                      <Select.ItemText>Price: High to Low</Select.ItemText>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
        </div>

        {/* Result count + clear */}
        {!loading && !error && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-foreground/50">
              Showing {filteredRooms.length} of {activeRooms.length} room
              {activeRooms.length !== 1 ? "s" : ""}
            </p>
            {!filtersAreDefault && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="h-8 px-3 text-xs"
              >
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
            No rooms match your filters.
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
        <div key={filterKey} className="columns-1 gap-6 space-y-6 sm:columns-2 lg:columns-3">
          {filteredRooms.map((room, index) => (
            <div key={room.id} className="mb-6 break-inside-avoid">
              <RoomCard
                room={room}
                animationIndex={index}
                layoutVariant={index}
                isFavorite={favoriteRoomIds.has(room.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
