import { useState } from "react";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryTransform";

/**
 * The room photo carousel: one image, a counter, favorite toggle, arrows and a
 * thumbnail strip. Lifted from RoomDetailPage verbatim — it was already a leaf
 * component (only `useState` for the current index), so nothing but the imports
 * moved with it. Index keys on the thumbnail strip are intentional: the images
 * carry no state of their own, so a reorder cannot alias anything.
 */
export default function RoomPhotoCarousel({
  photos = [],
  roomName,
  isFavorite,
  onToggleFavorite,
  user,
  role,
}) {
  const [current, setCurrent] = useState(0);
  const safeCurrent = Math.min(current, photos.length - 1);

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-background flex items-center justify-center h-80 md:h-[480px] text-foreground/40 text-sm">
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
          className="h-80 md:h-[480px] w-full object-cover"
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
      <div className="relative h-80 md:h-[480px] select-none">
        <img
          src={optimizeCloudinaryUrl(photos[safeCurrent], { width: 1200 })}
          alt={`${roomName || "Room"} photo ${safeCurrent + 1} of ${photos.length}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />

        {/* Counter */}
        <div className="absolute right-4 top-4 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white backdrop-blur-sm">
          {safeCurrent + 1} / {photos.length}
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
          onClick={() => setCurrent(safeCurrent === 0 ? photos.length - 1 : safeCurrent - 1)}
          aria-label="Previous photo"
          className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 active:scale-95 transition-all backdrop-blur-sm"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => setCurrent(safeCurrent === photos.length - 1 ? 0 : safeCurrent + 1)}
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
              idx === safeCurrent
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
