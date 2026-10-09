import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

// Demo fork of the RoomsPage inline RoomCard: same layout skeleton and
// classes (prod CSS flows through), user/favorites via props, no useAuth,
// no services. "View" links to the real detail page in preview mode
// (read-only for anon) so visitors feel the actual UI.
function formatRate(rate) {
  if (rate == null || rate === "") return null;
  const num = Number(rate);
  if (isNaN(num)) return null;
  return num.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

export default function DemoRoomCard({
  room,
  animationIndex = 0,
  isFavorite = false,
  onToggleFavorite = () => {},
}) {
  const photos = Array.isArray(room.photos) ? room.photos : [];
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

  return (
    <div
      className="room-card-enter group/card rounded-2xl border border-border/60 bg-white overflow-hidden shadow-[0_2px_16px_rgba(28,28,30,0.06)] hover:shadow-[0_8px_32px_rgba(28,28,30,0.12)] transition-[box-shadow,transform] duration-300 will-change-[box-shadow,transform] flex flex-col"
      style={{ animationDelay: `${Math.min(animationIndex, 11) * 55}ms` }}
    >
      <div className="relative overflow-hidden w-full h-52">
        {photos.length > 0 ? (
          <img
            src={photos[0]}
            alt={room.name || "Room photo"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-52 w-full items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 text-sm text-foreground/30">
            No photo
          </div>
        )}
        <button
          type="button"
          onClick={() => onToggleFavorite(room.id)}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-100 transition-all duration-200 hover:bg-white active:scale-[0.96]"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={`h-4.5 w-4.5 transition-colors ${
              isFavorite ? "fill-red-500 text-red-500" : "text-foreground/60"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="space-y-3">
          <div className="min-w-0">
            <h3 className="font-playfair font-semibold leading-tight text-foreground text-lg text-wrap-balance">
              {room.name || "Unnamed Room"}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-foreground/55">{subtitle}</p>
            )}
          </div>
          {formattedRate ? (
            <div className="flex items-baseline gap-1">
              <span className="font-playfair font-bold text-foreground text-2xl tabular-nums">
                PHP {formattedRate}
              </span>
              <span className="text-sm text-foreground/50">/ night</span>
            </div>
          ) : null}
          {descriptionSnippet && (
            <p className="text-sm leading-relaxed text-foreground/65 line-clamp-2">
              {descriptionSnippet}
            </p>
          )}
        </div>
        <div className="flex gap-3 pt-1 mt-auto">
          <Button asChild variant="default" className="flex-1 active:scale-[0.96]">
            <NavLink to={`/rooms/${room.id}?demo=1`}>
              View Details &amp; Book
            </NavLink>
          </Button>
        </div>
      </div>
    </div>
  );
}
