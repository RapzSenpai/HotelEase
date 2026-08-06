import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { listBookingsForUser } from "@/services/bookingsService";
import { listRooms } from "@/services/roomsService";
import { mapFirebaseError } from "@/lib/errors";
import GuestHousekeepingCard from "@/components/housekeeping/GuestHousekeepingCard";
import { SkeletonCard } from "@/components/ui/skeleton";
import { BedDouble, CalendarDays, SprayCan } from "lucide-react";

function formatDate(tsLike) {
  try {
    const d = tsLike?.toDate ? tsLike.toDate() : new Date(tsLike);
    if (!d || isNaN(d)) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export default function HousekeepingPage() {
  const { user, profile, trainingMode } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.uid) {
      setBookings([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [bookingData, roomData] = await Promise.all([
          listBookingsForUser(user.uid, { trainingMode }),
          listRooms({ trainingMode }),
        ]);
        if (!isMounted) return;

        setBookings(bookingData);

        const map = {};
        for (const r of roomData) map[r.id] = r;
        setRoomsMap(map);
      } catch (e) {
        if (!isMounted) return;
        setError(mapFirebaseError(e) || "Failed to load your stay.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [user?.uid, trainingMode]);

  const activeStays = useMemo(() => {
    return bookings.filter((b) => b.status === "Checked In");
  }, [bookings]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-playfair text-3xl font-semibold">Housekeeping</h1>
          <p className="text-foreground/80">
            Request room cleaning and housekeeping services during your stay.
          </p>
        </div>
        <SkeletonCard className="p-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-playfair text-3xl font-semibold">Housekeeping</h1>
          <p className="text-foreground/80">
            Request room cleaning and housekeeping services during your stay.
          </p>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      </div>
    );
  }

  if (activeStays.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-playfair text-3xl font-semibold">Housekeeping</h1>
          <p className="text-foreground/80">
            Request room cleaning and housekeeping services during your stay.
          </p>
        </div>

        <Card className="p-10 flex flex-col items-center gap-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <SprayCan className="h-6 w-6" />
          </span>
          <p className="text-foreground/60 text-sm">
            You don&apos;t have an active stay right now.
          </p>
          <p className="text-xs text-foreground/45">
            Housekeeping requests are available once your booking is checked in.
          </p>
          <Button asChild variant="default" size="sm">
            <NavLink to="/rooms">Browse Rooms</NavLink>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 space-y-1">
        <div>
          <h1 className="font-playfair text-3xl font-semibold">Housekeeping</h1>
          <p className="text-foreground/80 text-sm">
            Request room cleaning and housekeeping services during your stay.
          </p>
        </div>
        {activeStays.length > 1 && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {activeStays.length} Active Rooms
          </span>
        )}
      </div>

      <div className="space-y-8">
        {activeStays.map((stay) => {
          const room = roomsMap[stay.roomId] || { id: stay.roomId };
          return (
            <div key={stay.id} className="space-y-3">
              {/* Stay summary */}
              <Card className="py-0">
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <BedDouble className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">
                      {room.name || room.type || `Room ${room.roomNumber || ""}`}
                    </span>
                  </span>
                  <span className="hidden h-4 w-px bg-border sm:block" />
                  <span className="flex items-center gap-1.5 text-foreground/70">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    {formatDate(stay.checkInDate)} → {formatDate(stay.checkOutDate)}
                  </span>
                  {stay.nights ? (
                    <span className="text-foreground/50">
                      {stay.nights} night{stay.nights !== 1 ? "s" : ""}
                    </span>
                  ) : null}
                  <NavLink
                    to="/my-bookings"
                    className="ml-auto text-xs font-medium text-primary hover:underline underline-offset-4"
                  >
                    View booking details
                  </NavLink>
                </CardContent>
              </Card>

              <GuestHousekeepingCard
                booking={stay}
                room={room}
                trainingMode={trainingMode}
                userProfile={profile}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
