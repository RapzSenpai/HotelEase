import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavLink } from "react-router-dom";
import { Star } from "lucide-react";
import {
  SectionEyebrow,
  AmbientGlow,
  cleanPanel,
  getRoomHeadline,
  getRoomAmenities,
  amenityIcon,
  formatRatingBadge,
} from "./helpers";

const RoomTile = memo(function RoomTile({ room, rating, onView, onBook, size = "medium", canBook = true }) {
  const firstPhoto = room.photos?.[0] ?? null;
  const rate = Number(room.ratePerNight ?? 0);
  const amenities = getRoomAmenities(room);
  const ratingLabel = formatRatingBadge(rating);

  const sizeClasses = {
    large: "lg:col-span-2 lg:row-span-2",
    medium: "lg:col-span-1 lg:row-span-1",
    wide: "lg:col-span-2 lg:row-span-1",
  };

  const heightClasses = {
    large: "min-h-[400px] lg:min-h-[480px]",
    medium: "min-h-[280px] lg:min-h-[240px]",
    wide: "min-h-[280px] lg:min-h-[240px]",
  };

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-border/40 bg-white shadow-[0_4px_24px_rgba(28,28,30,0.06)] transition-all duration-300 hover:shadow-[0_8px_32px_rgba(28,28,30,0.1)] ${sizeClasses[size]} ${heightClasses[size]}`}>
      <button onClick={onView} className="absolute inset-0 w-full h-full cursor-pointer" aria-label={`View details for ${room.name || room.type}`}>
        {firstPhoto ? (
          <img src={firstPhoto} alt={room.name || room.type} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted/25 to-background text-sm text-foreground/30">No photo available</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      </button>
      {ratingLabel ? (
        <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-primary/20 bg-gradient-to-r from-primary to-primary/90 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(245,197,24,0.3)] backdrop-blur-sm">
          <Star className="h-3.5 w-3.5 fill-white text-white" />
          {ratingLabel}
        </div>
      ) : null}
      <div className={`absolute inset-0 flex flex-col justify-end pointer-events-none ${size === "large" ? "p-5 lg:p-6 lg:pb-4" : "p-5 lg:p-6"}`}>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">{room.type || "Suite"}</p>
          <h3 className={`font-playfair font-semibold leading-[1.1] tracking-tight text-white ${size === "large" ? "text-2xl lg:text-3xl" : "text-lg lg:text-xl"}`}>
            {room.name || getRoomHeadline(room)}
          </h3>
          {size === "large" && <p className="text-sm leading-relaxed text-white/70 line-clamp-2">{getRoomHeadline(room)}</p>}
        </div>
        <div className={`flex items-center justify-between ${size === "large" ? "mt-4 gap-4" : "mt-4 gap-3"}`}>
          <div>
            <p className={`font-playfair font-bold tabular-nums tracking-tight text-white ${size === "large" ? "text-2xl" : "text-xl"}`}>
              PHP {rate.toLocaleString()}
            </p>
            <p className="text-[10px] text-white/60">per night</p>
          </div>
          <Button
            size={size === "large" ? "lg" : "default"}
            variant="default"
            className={`${size === "large" ? "px-8 py-6 text-base" : ""} text-white shadow-lg active:scale-[0.98] pointer-events-auto`}
            onClick={(e) => { e.stopPropagation(); if (canBook) onBook(); else onView(); }}
          >
            {canBook ? "Book Now" : "View Details"}
          </Button>
        </div>
        {size === "large" && amenities.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {amenities.slice(0, 4).map((amenity) => {
              const Icon = amenityIcon(amenity);
              return (
                <div key={amenity} className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                  <Icon className="h-3 w-3 text-white/80" strokeWidth={1.75} />
                  <span className="text-[10px] font-medium text-white/90">{amenity}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

function FeaturedRoomsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 lg:row-span-2 min-h-[400px] lg:min-h-[480px] rounded-2xl bg-muted/15 animate-pulse" />
      <div className="min-h-[280px] lg:min-h-[240px] rounded-2xl bg-muted/15 animate-pulse" />
      <div className="min-h-[280px] lg:min-h-[240px] rounded-2xl bg-muted/15 animate-pulse" />
    </div>
  );
}

export default function RoomShowcaseSection({ showcaseRooms, roomsLoading, roomRatings, canBookRooms, handleViewRoom, handleBookRoom }) {
  return (
    <section className="relative z-10 py-32 md:py-40 bg-[#FDF8F0] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_0%_50%,rgba(245,197,24,0.02),transparent_50%)] pointer-events-none" />
      <AmbientGlow position="bottom-left" size="xl" intensity={0.10} />
      <AmbientGlow position="top-right" size="sm" intensity={0.07} />
      <svg className="absolute inset-0 -z-10 h-full w-full pointer-events-none stroke-primary/10 fill-none opacity-25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M-100,140 C450,230 850,40 1250,180 T2200,140" strokeWidth="0.75" />
        <path d="M-100,170 C450,260 850,70 1250,210 T2200,170" strokeWidth="0.5" strokeDasharray="3 3" />
        <path d="M-100,200 C450,290 850,100 1250,240 T2200,200" strokeWidth="0.5" />
      </svg>
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-14 space-y-4 max-w-2xl">
          <SectionEyebrow>Our Rooms</SectionEyebrow>
          <h2 className="font-playfair text-4xl md:text-5xl font-bold tracking-tight">Featured Accommodations</h2>
          <p className="text-foreground/60 leading-relaxed">Explore our available rooms, each designed for comfort and elegance.</p>
        </div>
        {roomsLoading ? (
          <FeaturedRoomsSkeleton />
        ) : showcaseRooms.length === 0 ? (
          <Card className={`${cleanPanel} p-12 text-center text-foreground/50`}>
            <CardContent className="p-0">No rooms available at the moment.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[240px]">
            <RoomTile
              room={showcaseRooms[0]}
              rating={roomRatings[showcaseRooms[0].id]}
              onView={() => handleViewRoom(showcaseRooms[0].id)}
              onBook={() => handleBookRoom(showcaseRooms[0].id)}
              canBook={canBookRooms}
              size="large"
            />
            {showcaseRooms.slice(1).map((room) => (
              <RoomTile
                key={room.id}
                room={room}
                rating={roomRatings[room.id]}
                onView={() => handleViewRoom(room.id)}
                onBook={() => handleBookRoom(room.id)}
                canBook={canBookRooms}
                size="medium"
              />
            ))}
          </div>
        )}
        <div className="mt-12 flex justify-start md:justify-center">
          <Button asChild variant="outline" size="lg" className="bg-white/70 backdrop-blur-sm">
            <NavLink to="/rooms">View All Rooms</NavLink>
          </Button>
        </div>
      </div>
    </section>
  );
}
