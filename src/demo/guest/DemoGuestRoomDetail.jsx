import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Minus, Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import RoomPhotoCarousel from "@/components/rooms/RoomPhotoCarousel";
import { formatCurrency, formatDate } from "@/lib/format";
import { useDemo } from "../DemoContext";
import { activeRooms } from "./guestDemoData";

const MAX_NIGHTS = 14;
const METHODS = ["GCash", "Over-the-Counter"];

export default function DemoGuestRoomDetail() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { data, guest } = useDemo();
  const [nights, setNights] = useState(2);
  const [method, setMethod] = useState(METHODS[0]);
  const [favorite, setFavorite] = useState(false);

  const room = activeRooms(data.rooms).find((r) => r.id === roomId);

  if (!room) {
    return (
      <Card className="space-y-3 p-6">
        <h1 className="font-playfair text-2xl font-semibold">Room not in the sample data</h1>
        <p className="text-sm text-foreground/70">
          The demo only carries {activeRooms(data.rooms).length} sample rooms, and none of them is
          &ldquo;{roomId}&rdquo;.
        </p>
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link to="/demo/guest">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to the rooms
          </Link>
        </Button>
      </Card>
    );
  }

  const checkIn = new Date();
  const checkOut = new Date(checkIn.getTime() + nights * 86400000);
  const total = Number(room.ratePerNight ?? 0) * nights;

  function book() {
    guest.demoCreateBooking({ roomId: room.id, nights, method });
    toast.success(`Demo: ${room.name} booked for ${nights} night(s). Nothing was saved.`);
    navigate("/demo/guest/bookings");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 text-xs">
          <Link to="/demo/guest">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            All rooms
          </Link>
        </Button>
        <Badge variant="outline" className="text-xs">
          Demo room · not a real reservation
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <RoomPhotoCarousel
            photos={room.photos || []}
            roomName={room.name}
            isFavorite={favorite}
            onToggleFavorite={() => setFavorite((v) => !v)}
            user={null}
            role="guest"
          />
        </div>

        <div className="space-y-4 lg:col-span-5">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-foreground/50">
              {room.type}
              {room.roomNumber ? ` · Room #${room.roomNumber}` : ""}
              {room.floor ? ` · ${room.floor}` : ""}
            </p>
            <h1 className="font-playfair text-3xl font-bold leading-tight text-wrap-balance">
              {room.name}
            </h1>
            <p className="flex items-baseline gap-1">
              <span className="font-playfair text-2xl font-bold tabular-nums">
                {formatCurrency(room.ratePerNight)}
              </span>
              <span className="text-sm text-foreground/50">/ night</span>
            </p>
          </div>

          <p className="text-sm leading-relaxed text-foreground/70">{room.description}</p>

          <div className="flex flex-wrap gap-1.5">
            {(room.amenities || []).map((amenity) => (
              <span key={amenity} className="rounded-full bg-muted/40 px-2.5 py-1 text-xs text-foreground/65">
                {amenity}
              </span>
            ))}
          </div>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/60">
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Sleeps up to {room.maxPax} · {room.basePax} included
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Instant demo confirmation
            </span>
          </p>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Nights</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 active:scale-[0.96]"
                  aria-label="Fewer nights"
                  disabled={nights <= 1}
                  onClick={() => setNights((n) => Math.max(1, n - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">{nights}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 active:scale-[0.96]"
                  aria-label="More nights"
                  disabled={nights >= MAX_NIGHTS}
                  onClick={() => setNights((n) => Math.min(MAX_NIGHTS, n + 1))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-foreground/60">
              <span>{formatDate(checkIn)}</span>
              <span>→</span>
              <span>{formatDate(checkOut)}</span>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-foreground/70">Simulated total</span>
              <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-foreground/60">Payment method</span>
              <div className="flex flex-wrap gap-1.5">
                {METHODS.map((option) => (
                  <Button
                    key={option}
                    variant={method === option ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setMethod(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>

            <Button className="w-full active:scale-[0.96]" onClick={book}>
              Book {nights} night{nights > 1 ? "s" : ""} (demo)
            </Button>
            <p className="text-xs text-foreground/50">
              Books as <Badge variant="warning" className="align-middle">Pending</Badge> and lands in{" "}
              <Link to="/demo/guest/bookings" className="text-primary hover:underline underline-offset-4">
                my bookings
              </Link>
              , where the simulated payment is.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
