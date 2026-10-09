import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { NavLink } from "react-router-dom";
import { subscribeToFavorites, removeFavorite } from "@/services/favoritesService";
import { getRoom } from "@/services/roomsService";
import { getRoomAvailabilityCards } from "@/services/availabilityService";
import { useAuth } from "@/contexts/AuthContext";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Heart, Trash2, Clock } from "lucide-react";

function formatRate(rate) {
  if (rate == null || rate === "") return null;
  const num = Number(rate);
  if (isNaN(num)) return null;
  return num.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

function getLocalDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split("T")[0];
}

function formatFreeDate(dateStr) {
  if (!dateStr) return "";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"});
}

function timeAgo(date) {
  if (!date) return null;
  const now = new Date();
  const then = date?.toDate ? date.toDate() : new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function FavoriteRoomCard({ room, favorite, onRemove, hint }) {
  const photos = Array.isArray(room.photos) ? room.photos : [];
  const firstPhoto = photos.length > 0 ? photos[0] : null;
  const saved = timeAgo(favorite?.createdAt);

  return (
    <div className="group rounded-2xl border border-border/60 bg-white overflow-hidden shadow-[0_2px_16px_rgba(28,28,30,0.06)] hover:shadow-[0_8px_32px_rgba(28,28,30,0.12)] transition-all duration-300 ease-out flex flex-col">
      {/* Photo */}
      <div className="relative h-52 w-full overflow-hidden">
        {firstPhoto ? (
          <img
            src={firstPhoto}
            alt={room.name || "Room photo"}
            className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/20 text-sm text-foreground/40">
            No photo
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="space-y-3">
          {/* Name + Type */}
          <div>
            <h3 className="font-playfair text-base font-semibold leading-tight text-foreground">
              {room.name || "Unnamed Room"}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-foreground/50">
              {room.roomNumber && <span>#{room.roomNumber}</span>}
              {room.roomNumber && room.type && <span>·</span>}
              {room.type && <span>{room.type}</span>}
            </div>
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

          {/* Saved date */}
          {saved && (
            <div className="flex items-center gap-1.5 text-xs text-foreground/40">
              <Clock className="h-3 w-3" />
              <span>Saved {saved}</span>
            </div>
          )}

          {/* Availability hint — first night free within the next 30 days */}
          {hint && (
            <div
              className={`flex items-center gap-1.5 text-xs font-medium ${
                hint.none ? "text-foreground/40" : "text-success"
              }`}
            >
              {hint.none ? (
                <span>Booked out next 30 days</span>
              ) : (
                <span>Free from {formatFreeDate(hint.freeFrom)}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <Button
            asChild
            variant="default"
            size="sm"
            className="flex-1"
          >
            <NavLink to={`/rooms/${room.id}`}>
              View Details &amp; Book
            </NavLink>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRemove(room.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function FavoritesPage() {
  const { user, role} = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  // roomId -> { freeFrom: "YYYY-MM-DD" } | { none: true } — computed once per room
  const [hints, setHints] = useState({});

  useEffect(() => {
    if (!user || role !== "guest") {
      setFavorites([]);
      setRooms([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToFavorites(
      user.uid,
      (data) => {
        setFavorites(data);
      });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user, role]);

  useEffect(() => {
    let isMounted = true;
    async function loadRooms() {
      if (favorites.length === 0) {
        if (isMounted) {
          setRooms([]);
          setLoading(false);
        }
        return;
      }

      if (isMounted) setLoading(true);
      try {
        const roomPromises = favorites.map((fav) => getRoom(fav.roomId));
        const roomData = await Promise.all(roomPromises);
        if (!isMounted) return;
        // Archived rooms are hidden — their only signal used to be the
        // availability chip, which is gone; they can't be booked anyway.
        setRooms(roomData.filter((r) => r !== null && r.isActive !== false));
      } catch (e) {
        console.error("Failed to load favorite rooms:", e);
        if (isMounted) setRooms([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadRooms();
    return () => { isMounted = false; };
  }, [favorites]);

  async function handleRemoveFavorite(roomId) {
    if (!user || role !== "guest") return;
    try {
      await removeFavorite(user.uid, roomId);
    } catch (e) {
      console.error("Failed to remove favorite:", e);
    }
  }

  // Find the first free night within the next 30 days for each favorite room.
  // Markers exist in both modes (training_availability mirrors prod).
  useEffect(() => {
    let isMounted = true;
    async function computeHints() {
      const next = {};
      const start = new Date();
      start.setDate(start.getDate() + 1); // scan from tomorrow
      for (const room of rooms) {
        try {
          const cards = await getRoomAvailabilityCards(room.id);
          const blocked = new Set(cards.map((c) => c.date));
          const d = new Date(start);
          let freeFrom = null;
          for (let i = 0; i < 30; i++) {
            const key = getLocalDateString(d);
            if (!blocked.has(key)) {
              freeFrom = key;
              break;
            }
            d.setDate(d.getDate() + 1);
          }
          next[room.id] = freeFrom ? { freeFrom } : { none: true };
        } catch (e) {
          console.error("Failed to compute availability hint:", e);
        }
      }
      if (isMounted) setHints(next);
    }
    if (rooms.length > 0) computeHints();
    return () => {
      isMounted = false;
    };
  }, [rooms]);

  const roomsWithFavorites = useMemo(() => {
    const favMap = {};
    for (const fav of favorites) {
      favMap[fav.roomId] = fav;
    }
    return rooms.map((r) => ({ room: r, favorite: favMap[r.id] || null }));
  }, [rooms, favorites]);

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
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold tracking-tight text-foreground">
          My Favorites
        </h1>
        <p className="text-foreground/70">
          {rooms.length} room{rooms.length !== 1 ? "s" : ""} saved
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && rooms.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-background p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500">
            <Heart className="h-6 w-6 fill-red-500/20" />
          </span>
          <p className="text-foreground/60 text-sm">No favorites yet.</p>
          <p className="text-xs text-foreground/45">
            Tap the heart on any room to save it here for quick access.
          </p>
          <Button asChild variant="default" size="sm">
            <NavLink to="/rooms">Browse Rooms</NavLink>
          </Button>
        </div>
      )}

      {/* Room Grid */}
      {!loading && rooms.length > 0 && (
        <div className="columns-1 gap-6 space-y-6 sm:columns-2 lg:columns-3">
          {roomsWithFavorites.map(({ room, favorite }) => (
            <div key={room.id} className="mb-6 break-inside-avoid">
              <FavoriteRoomCard
                room={room}
                favorite={favorite}
                onRemove={handleRemoveFavorite}
                hint={hints[room.id]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
