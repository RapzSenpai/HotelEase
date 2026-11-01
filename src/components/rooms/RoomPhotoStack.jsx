import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, ChevronRight } from "lucide-react";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryTransform";
import { nextOrder } from "@/components/rooms/roomPhotoHelpers";

// The top card drags away or the stack sits still; smaller offsets snap back.
const DRAG_PAST_X = 60;
const DRAG_FLING = 400;

// Top card full size, peeking card slightly smaller behind it.
const SLOTS = [
  { y: 0, scale: 1, rotate: 0 },
  { y: 16, scale: 0.95, rotate: 2.5 },
];

const SPRING = { type: "spring", stiffness: 240, damping: 26 };

/**
 * The room photo gallery as a stacked deck: the top photo is fully visible,
 * the second peeks behind it, and dragging the top card away cycles through
 * every photo without dropping any.
 */
export default function RoomPhotoStack({
  photos = [],
  roomName,
  isFavorite,
  onToggleFavorite,
  user,
  role,
}) {
  const [order, setOrder] = useState(() => photos.map((_, i) => i));

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-background flex items-center justify-center h-80 md:h-[480px] text-foreground/40 text-sm">
        No photos available for this room.
      </div>
    );
  }

  const handleDragEnd = (_event, info) => {
    if (
      Math.abs(info.offset.x) > DRAG_PAST_X ||
      Math.abs(info.velocity.x) > DRAG_FLING
    ) {
      setOrder(nextOrder);
    }
  };

  const top = order[0];
  const canDrag = photos.length > 1;
  const showFavorite = Boolean(user) && role === "guest";

  return (
    <div className="relative h-80 md:h-[480px] select-none">
      {order.slice(0, Math.min(2, photos.length)).map((photoIndex, slot) => {
        const { y, scale, rotate } = SLOTS[slot];
        const isTop = slot === 0;
        return (
          <motion.div
            key={photoIndex}
            drag={isTop && canDrag ? "x" : false}
            dragSnapToOrigin
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.7}
            onDragEnd={isTop ? handleDragEnd : undefined}
            animate={{ y, scale, rotate }}
            transition={SPRING}
            className={`absolute inset-x-0 top-0 h-full overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_rgba(28,28,30,0.06)] ${isTop ? "" : "pointer-events-none"}`}
            style={{ zIndex: 50 - slot }}
          >
            <img
              src={optimizeCloudinaryUrl(photos[photoIndex], { width: 1200 })}
              alt={`${roomName || "Room"} photo ${photoIndex + 1} of ${photos.length}`}
              draggable={false}
              className="h-full w-full object-cover"
              loading={isTop ? "eager" : "lazy"}
            />

            {isTop && (
              <>
                {/* Counter */}
                <div className="absolute right-4 top-4 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white backdrop-blur-sm">
                  {top + 1} / {photos.length}
                </div>

                {/* Favorite */}
                {showFavorite && (
                  <button
                    type="button"
                    onClick={onToggleFavorite}
                    className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-white transition-colors"
                    aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Heart className={`h-5 w-5 transition-colors ${isFavorite ? "fill-red-500 text-red-500" : "text-foreground/60"}`} />
                  </button>
                )}

              </>
            )}
          </motion.div>
        );
      })}

      {/* Advance control lives outside the keyed cards so keyboard focus
          survives each rotation of the deck. */}
      {canDrag && (
        <button
          type="button"
          onClick={() => setOrder(nextOrder)}
          className="absolute bottom-3 right-3 z-[60] flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 active:scale-95 transition-all backdrop-blur-sm"
          aria-label="Next photo"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
