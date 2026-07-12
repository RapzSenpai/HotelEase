import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";
import { subscribeToFavorites, removeFavorite } from "@/services/favoritesService";
import { getRoom } from "@/services/roomsService";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { Heart, Trash2, ArrowRight, X } from "lucide-react";

function formatRate(rate) {
  if (rate == null || rate === "") return null;
  const num = Number(rate);
  if (isNaN(num)) return null;
  return num.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

function FavoriteRoomCard({ room, isFavorite, onRemove, onToggleCompare, isSelectedForCompare }) {
  const photos = Array.isArray(room.photos) ? room.photos : [];
  const firstPhoto = photos.length > 0 ? photos[0] : null;
  const isAvailable = room.status === "Available";

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
      {/* Photo */}
      <div className="relative h-48 w-full overflow-hidden">
        {firstPhoto ? (
          <img
            src={firstPhoto}
            alt={room.name || "Room photo"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/20 text-sm text-foreground/40">
            No photo
          </div>
        )}
        <button
          type="button"
          onClick={() => onRemove(room.id)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity hover:bg-white group-hover:opacity-100"
          aria-label="Remove from favorites"
        >
          <Trash2 className="h-4 w-4 text-foreground/60" />
        </button>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Name + Number + Status Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-playfair text-base font-semibold leading-tight text-foreground">
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
        {formatRate(room.ratePerNight) && (
          <div className="flex items-baseline gap-1">
            <span className="font-playfair text-lg font-bold text-foreground">
              PHP {formatRate(room.ratePerNight)}
            </span>
            <span className="text-xs text-foreground/50">/ night</span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={isSelectedForCompare ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => onToggleCompare(room.id)}
          >
            {isSelectedForCompare ? (
              <>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Remove
              </>
            ) : (
              <>
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                Compare
              </>
            )}
          </Button>
          <Button
            asChild
            variant="default"
            size="sm"
            className="flex-1"
            disabled={!isAvailable}
          >
            <NavLink to={`/booking/${room.id}`}>
              Book
            </NavLink>
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoomComparison({ rooms, onClose }) {
  if (!rooms || rooms.length < 2) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-background p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-playfair text-2xl font-semibold">Room Comparison</h2>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <div key={room.id} className="rounded-xl border border-border bg-background/50 p-4 space-y-4">
              {/* Photo */}
              {room.photos && room.photos.length > 0 && (
                <img
                  src={room.photos[0]}
                  alt={room.name}
                  className="h-40 w-full object-cover rounded-lg"
                />
              )}

              {/* Name */}
              <div>
                <h3 className="font-playfair text-lg font-semibold">{room.name || "Unnamed Room"}</h3>
                <p className="text-sm text-foreground/60">{room.type || ""}</p>
                {room.roomNumber && (
                  <p className="text-xs text-foreground/50">#{room.roomNumber}</p>
                )}
              </div>

              {/* Rate */}
              <div className="rounded-lg bg-primary/10 px-3 py-2">
                <p className="text-xs text-foreground/60">Rate per night</p>
                <p className="font-playfair text-xl font-bold">
                  PHP {formatRate(room.ratePerNight) || "—"}
                </p>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs text-foreground/60 mb-1">Status</p>
                <RoomStatusBadge status={room.status} />
              </div>

              {/* Amenities */}
              {room.amenities && room.amenities.length > 0 && (
                <div>
                  <p className="text-xs text-foreground/60 mb-2">Amenities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {room.amenities.slice(0, 6).map((amenity, idx) => (
                      <span
                        key={idx}
                        className="rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-xs text-foreground/70"
                      >
                        {amenity}
                      </span>
                    ))}
                    {room.amenities.length > 6 && (
                      <span className="rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-xs text-foreground/50">
                        +{room.amenities.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {room.description && (
                <div>
                  <p className="text-xs text-foreground/60 mb-1">Description</p>
                  <p className="text-sm text-foreground/80 line-clamp-3">{room.description}</p>
                </div>
              )}

              {/* Book Button */}
              <Button
                asChild
                variant="default"
                className="w-full"
                disabled={room.status !== "Available"}
              >
                <NavLink to={`/booking/${room.id}`}>Book This Room</NavLink>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FavoritesPage() {
  const { user, role, trainingMode } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedForComparison, setSelectedForComparison] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    if (!user || role !== "guest") {
      setFavorites([]);
      setRooms([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToFavorites(user.uid, (data) => {
      setFavorites(data);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user, role]);

  useEffect(() => {
    async function loadRooms() {
      if (favorites.length === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const roomPromises = favorites.map((fav) => getRoom(fav.roomId, { trainingMode }));
        const roomData = await Promise.all(roomPromises);
        setRooms(roomData.filter((r) => r !== null));
      } catch (e) {
        console.error("Failed to load favorite rooms:", e);
        setRooms([]);
      } finally {
        setLoading(false);
      }
    }

    loadRooms();
  }, [favorites, trainingMode]);

  async function handleRemoveFavorite(roomId) {
    if (!user || role !== "guest") return;
    try {
      await removeFavorite(user.uid, roomId);
      setSelectedForComparison((prev) => prev.filter((id) => id !== roomId));
    } catch (e) {
      console.error("Failed to remove favorite:", e);
    }
  }

  function handleToggleCompare(roomId) {
    setSelectedForComparison((prev) => {
      if (prev.includes(roomId)) {
        return prev.filter((id) => id !== roomId);
      }
      if (prev.length >= 3) {
        return prev; // Max 3 rooms for comparison
      }
      return [...prev, roomId];
    });
  }

  function handleOpenComparison() {
    if (selectedForComparison.length >= 2) {
      setShowComparison(true);
    }
  }

  const comparisonRooms = useMemo(
    () => rooms.filter((r) => selectedForComparison.includes(r.id)),
    [rooms, selectedForComparison],
  );

  if (!user || role !== "guest") {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-background p-10 text-center">
        <p className="text-sm text-foreground/60">Please log in as a guest to view your favorites.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-3xl font-semibold tracking-tight text-foreground">
            My Favorites
          </h1>
          <p className="text-foreground/70">
            {rooms.length} room{rooms.length !== 1 ? "s" : ""} saved
          </p>
        </div>
        {selectedForComparison.length >= 2 && (
          <Button onClick={handleOpenComparison}>
            Compare {selectedForComparison.length} Room{selectedForComparison.length !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">
          Loading favorites…
        </div>
      )}

      {/* Empty state */}
      {!loading && rooms.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-background p-10 text-center">
          <Heart className="h-12 w-12 text-foreground/20" />
          <p className="text-sm text-foreground/60">No favorites yet.</p>
          <Button asChild variant="outline">
            <NavLink to="/rooms">Browse Rooms</NavLink>
          </Button>
        </div>
      )}

      {/* Room Grid */}
      {!loading && rooms.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {rooms.map((room) => (
            <FavoriteRoomCard
              key={room.id}
              room={room}
              isFavorite={true}
              onRemove={handleRemoveFavorite}
              onToggleCompare={handleToggleCompare}
              isSelectedForComparison={selectedForComparison.includes(room.id)}
            />
          ))}
        </div>
      )}

      {/* Comparison Modal */}
      {showComparison && (
        <RoomComparison
          rooms={comparisonRooms}
          onClose={() => setShowComparison(false)}
        />
      )}
    </div>
  );
}
