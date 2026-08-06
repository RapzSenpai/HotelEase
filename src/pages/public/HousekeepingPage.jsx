import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { listBookingsForUser } from "@/services/bookingsService";
import { listRooms } from "@/services/roomsService";
import { mapFirebaseError } from "@/lib/errors";
import GuestHousekeepingCard from "@/components/housekeeping/GuestHousekeepingCard";
import { BedDouble, CalendarDays, Sparkles } from "lucide-react";

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

  const activeStay = useMemo(() => {
    return bookings.find((b) => b.status === "Checked In") || null;
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
        <Card className="p-8 text-center text-sm text-foreground/50 animate-pulse">
          Loading your stay…
        </Card>
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

  if (!activeStay) {
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
            <Sparkles className="h-6 w-6" />
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

  const room = roomsMap[activeStay.roomId] || { id: activeStay.roomId };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Housekeeping</h1>
        <p className="text-foreground/80">
          Request room cleaning and housekeeping services during your stay.
        </p>
      </div>

      {/* Current stay summary */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 gap-4">
          <div>
            <CardTitle className="text-base">Your Current Stay</CardTitle>
            <CardDescription>
              {room.name || room.type || `Room ${room.roomNumber || ""}`}
            </CardDescription>
          </div>
          <Badge variant="success" className="shrink-0">
            <BedDouble className="mr-1 h-3.5 w-3.5" /> Checked In
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 text-foreground/70">
              <CalendarDays className="h-4 w-4 text-primary" />
              {formatDate(activeStay.checkInDate)} → {formatDate(activeStay.checkOutDate)}
            </span>
            {activeStay.nights ? (
              <span className="text-foreground/50">{activeStay.nights} night{activeStay.nights !== 1 ? "s" : ""}</span>
            ) : null}
            <NavLink to="/my-bookings" className="ml-auto text-sm font-medium text-primary hover:underline underline-offset-4">
              View booking details
            </NavLink>
          </div>
        </CardContent>
      </Card>

      <GuestHousekeepingCard
        booking={activeStay}
        room={room}
        trainingMode={trainingMode}
        userProfile={profile}
      />
    </div>
  );
}
