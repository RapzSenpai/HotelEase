import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BedDouble, CalendarDays, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import DemoRoomCard from "../DemoRoomCard";
import { useDemo } from "../DemoContext";
import { activeRooms, balanceOf, stayBooking, upcomingBooking } from "./guestDemoData";

// First tile keeps the Featured badge but matches the other cards in size.
function FeatureRoom({ room }) {
  return (
    <article className="room-card-enter group/card flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-[0_2px_16px_rgba(28,28,30,0.06)] transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(28,28,30,0.12)]">
      <div className="relative h-44 w-full overflow-hidden sm:h-52">
        <img
          src={room.photos?.[0]}
          alt={room.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
        />
        <Badge variant="primary" className="absolute left-3 top-3">Featured</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-foreground/50">
            {room.type}
            {room.roomNumber ? ` · Room #${room.roomNumber}` : ""}
          </p>
          <h3 className="font-playfair text-2xl font-semibold leading-tight text-wrap-balance">
            {room.name}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-foreground/70">{room.description}</p>
        <ul className="flex flex-wrap gap-1.5">
          {(room.amenities || []).map((amenity) => (
            <li key={amenity} className="rounded-full bg-muted/40 px-2.5 py-1 text-xs text-foreground/65">
              {amenity}
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/55">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Sleeps up to {room.maxPax}
          </span>
          <span>{room.floor}</span>
        </p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-1">
          <div className="flex items-baseline gap-1">
            <span className="font-playfair text-2xl font-bold tabular-nums">
              {formatCurrency(room.ratePerNight)}
            </span>
            <span className="text-sm text-foreground/50">/ night</span>
          </div>
          <Button asChild className="active:scale-[0.96]">
            <Link to={`/demo/guest/rooms/${room.id}`}>
              View details &amp; book <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function DemoGuestRooms() {
  const { data } = useDemo();
  const [favorites, setFavorites] = useState([]);
  const rooms = activeRooms(data.rooms);
  const [featured, ...rest] = rooms;
  const stay = stayBooking(data);
  const upcoming = upcomingBooking(data);
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));

  function toggleFavorite(roomId) {
    setFavorites((favs) =>
      favs.includes(roomId) ? favs.filter((id) => id !== roomId) : [...favs, roomId],
    );
  }

  return (
    <div className="space-y-8">
      <section id="rooms" className="scroll-mt-20 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="font-playfair text-2xl font-semibold sm:text-3xl">Our rooms</h1>
            <p className="text-sm text-foreground/60">
              A few sample rooms to look through. Real rates come from the hotel.
            </p>
          </div>
          <p className="text-xs text-foreground/45">{rooms.length} rooms available to browse</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured && <FeatureRoom room={featured} />}
          {rest.map((room, i) => (
            <DemoRoomCard
              key={room.id}
              room={room}
              animationIndex={i + 1}
              isFavorite={favorites.includes(room.id)}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-playfair text-2xl font-semibold">Your stay so far</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">In house now</span>
            </div>
            {stay ? (
              <>
                <div>
                  <p className="font-playfair text-lg font-semibold">
                    {roomLabelFrom(roomsById, stay.roomId)}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-foreground/60">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(stay.checkInDate.toDate())} → {formatDate(stay.checkOutDate.toDate())}
                  </p>
                </div>
                <p className="text-sm text-foreground/70">
                  Need fresh towels or a clean-up? Mid-stay housekeeping is part of the demo.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-auto w-full sm:w-auto">
                  <Link to="/demo/guest/stay">Request housekeeping</Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-foreground/60">No checked-in stay in the sample data.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-primary">
              <BedDouble className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Next arrival</span>
            </div>
            {upcoming ? (
              <>
                <div>
                  <p className="font-playfair text-lg font-semibold">
                    {roomLabelFrom(roomsById, upcoming.roomId)}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-foreground/60">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(upcoming.checkInDate.toDate())} · {upcoming.nights} night(s)
                  </p>
                </div>
                <p className="text-sm text-foreground/70">
                  Balance due{" "}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(balanceOf(upcoming, data.payments))}
                  </span>
                  . Pay it in the simulated checkout, or leave it for check-in.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-auto w-full sm:w-auto">
                  <Link to="/demo/guest/bookings">Open my bookings</Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-foreground/60">No approved arrival in the sample data.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-5 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 text-primary">
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Pick your nights</span>
            </div>
            <p className="text-sm text-foreground/70">
              Open any room to choose 1–14 nights and see the simulated total before you book.
            </p>
            <p className="text-xs text-foreground/50">
              Bookings start today and are created as <Badge variant="warning" className="align-middle">Pending</Badge> for
              the front office, exactly like the real flow.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-auto w-full sm:w-auto">
              <Link to={`/demo/guest/rooms/${featured?.id ?? ""}`}>Start with a room</Link>
            </Button>
          </Card>
        </div>
      </section>
    </div>
  );
}
