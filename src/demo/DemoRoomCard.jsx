import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Heart, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

// Demo fork of the RoomsPage inline RoomCard: same layout skeleton and
// classes (prod CSS flows through), favorites via props, no useAuth, no
// services. Booking stays inside the demo tree — linking to the real
// /rooms/:id asked Firestore for a room that does not exist there.
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
  className,
}) {
  const photos = Array.isArray(room.photos) ? room.photos : [];
  const formattedRate = useMemo(
    () => formatRate(room.ratePerNight ?? room.rate ?? room.price),
    [room.ratePerNight, room.rate, room.price],
  );
  const subtitle = room.type || null;
  const amenities = (Array.isArray(room.amenities) ? room.amenities : []).slice(0, 3);
  const descriptionSnippet =
    room.description && room.description.length > 0
      ? room.description.length > 90
        ? room.description.slice(0, 90) + "…"
        : room.description
      : null;

  return (
    <div
      className={cn(
        "room-card-enter group/card flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-[0_2px_16px_rgba(28,28,30,0.06)] transition-[box-shadow,transform] duration-300 will-change-[box-shadow,transform] hover:shadow-[0_8px_32px_rgba(28,28,30,0.12)]",
        className,
      )}
      style={{ animationDelay: `${Math.min(animationIndex, 11) * 55}ms` }}
    >
      <div className="relative h-44 w-full overflow-hidden sm:h-52">
        {photos.length > 0 ? (
          <img
            src={photos[0]}
            alt={room.name || "Room photo"}
            className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 text-sm text-foreground/30">
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

      <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
        <div className="min-w-0">
          <h3 className="font-playfair text-lg font-semibold leading-tight text-foreground text-wrap-balance">
            {room.name || "Unnamed Room"}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-foreground/55">{subtitle}</p>}
        </div>
        {formattedRate ? (
          <div className="flex items-baseline gap-1">
            <span className="font-playfair text-xl font-bold tabular-nums text-foreground sm:text-2xl">
              {formatCurrency(room.ratePerNight ?? room.rate ?? room.price)}
            </span>
            <span className="text-sm text-foreground/50">/ night</span>
          </div>
        ) : null}
        {descriptionSnippet && (
          <p className="line-clamp-2 text-sm leading-relaxed text-foreground/65">
            {descriptionSnippet}
          </p>
        )}
        {amenities.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {amenities.map((amenity) => (
              <li
                key={amenity}
                className="rounded-full bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/60"
              >
                {amenity}
              </li>
            ))}
          </ul>
        )}
        {room.maxPax ? (
          <p className="flex items-center gap-1.5 text-xs text-foreground/55">
            <Users className="h-3.5 w-3.5" />
            Sleeps up to {room.maxPax}
            {room.extraPaxFee > 0 ? ` · +₱${room.extraPaxFee.toLocaleString()}/extra guest` : ""}
          </p>
        ) : null}
        <div className="mt-auto pt-1">
          <Button asChild variant="default" className="w-full active:scale-[0.96]">
            <NavLink to={`/demo/guest/rooms/${room.id}`}>View details &amp; book</NavLink>
          </Button>
        </div>
      </div>
    </div>
  );
}
