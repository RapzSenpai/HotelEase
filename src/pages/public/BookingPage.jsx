import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createBooking } from "@/services/bookingsService";
import { getRoom, isRoomActive, isRoomBookable } from "@/services/roomsService";
import RoomBookingsCalendar from "@/components/calendar/RoomBookingsCalendar";
import { Calendar as CalendarIcon } from "lucide-react";

export default function BookingPage() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { user, trainingMode } = useAuth();

  const [room, setRoom] = useState(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [error, setError] = useState(null);

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [paxCount, setPaxCount] = useState(1);
  const [specialRequests, setSpecialRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoadingRoom(true);
        setError(null);
        const data = await getRoom(roomId);
        if (!isMounted) return;
        setRoom(data);
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load room.");
      } finally {
        if (isMounted) setLoadingRoom(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [roomId]);

  const status = room?.status || "Available";
  const roomActive = isRoomActive(room);
  const bookable = isRoomBookable(room);
  const resolvedRoomId = useMemo(() => {
    // Ensure Firestore filters always receive string document IDs.
    if (typeof room?.id === "string") return room.id;
    if (typeof roomId === "string" && roomId) return roomId;
    return null;
  }, [room?.id, roomId]);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const a = new Date(`${checkIn}T00:00:00`);
    const b = new Date(`${checkOut}T00:00:00`);
    if (b <= a) return 0;
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }, [checkIn, checkOut]);

  const totalCost = useMemo(() => {
    const rate = Number(room?.ratePerNight ?? 0);
    if (!nights || !rate) return 0;
    return nights * rate;
  }, [room?.ratePerNight, nights]);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError(null);

    if (!user?.uid) {
      setSubmitError("You must be logged in to book.");
      return;
    }
    if (!room) {
      setSubmitError("Room not found.");
      return;
    }
    if (!resolvedRoomId) {
      setSubmitError("Room ID is missing. Please reload the page.");
      return;
    }
    if (!roomActive) {
      setSubmitError("This room is no longer available for booking.");
      return;
    }
    if (!bookable) {
      setSubmitError("This room is not currently bookable.");
      return;
    }
    if (!checkIn || !checkOut) {
      setSubmitError("Please select check-in and check-out dates.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await createBooking({
        guestId: user.uid,
        roomId: resolvedRoomId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        paxCount: Number(paxCount || 1),
        specialRequests,
        trainingMode,
      });

      setBookingId(res.id);
    } catch (e) {
      setSubmitError(e?.message || "Booking failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Booking</h1>
        <p className="text-foreground/80">
          Select your dates, enter guest details, and confirm your reservation.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      {loadingRoom ? (
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">
          Loading booking data...
        </div>
      ) : room ? (
        <div className="grid gap-6 lg:grid-cols-5">
          {!roomActive ? (
            <div className="lg:col-span-5 rounded-xl border border-warning/30 bg-warning/10 p-5 space-y-3">
              <div className="font-semibold">This room is no longer available</div>
              <p className="text-sm text-foreground/80">
                This room has been archived and cannot accept new bookings.
              </p>
              <Button variant="outline" onClick={() => navigate("/rooms")}>
                Browse Available Rooms
              </Button>
            </div>
          ) : null}

          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-background p-5">
              <div className="space-y-1">
                <div className="text-sm text-foreground/70">Room</div>
                <div className="text-lg font-semibold">
                  {room.name || room.type || "Room"}
                  {room.roomNumber ? ` • ${room.roomNumber}` : null}
                </div>
                <div className="text-sm text-foreground/70">
                  Rate: PHP {Number(room.ratePerNight ?? 0).toLocaleString()} /
                  night
                </div>
                <div className="text-sm text-foreground/70">
                  Current status: {status}
                </div>
              </div>
            </div>

            {bookingId ? (
              <div className="rounded-xl border border-success/30 bg-success/10 p-5">
                <div className="font-semibold">Booking Submitted</div>
                <div className="mt-1 text-sm text-foreground/80">
                  Status: <span className="font-medium">Pending</span>
                </div>
                <div className="mt-2 text-sm text-foreground/80">
                  Booking ID: <span className="font-medium">{bookingId}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    onClick={() => navigate("/my-bookings")}
                  >
                    Go to My Bookings
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/rooms")}>
                    Back to Rooms
                  </Button>
                </div>
              </div>
            ) : !roomActive ? null : (
              <form
                className="rounded-xl border border-border bg-background p-5 space-y-4"
                onSubmit={onSubmit}
              >
                <div className="space-y-2">
                  <Label htmlFor="checkIn" className="text-sm font-medium">Check-in (2:00 PM)</Label>
                  <div className="relative group">
                    <Input
                      id="checkIn"
                      type="date"
                      required
                      className="pr-10 border-border text-sm block [&::-webkit-calendar-picker-indicator]:hidden"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onFocus={(e) => e.target.blur()}
                    />
                    <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="checkOut" className="text-sm font-medium">Check-out (12:00 NN)</Label>
                  <div className="relative group">
                    <Input
                      id="checkOut"
                      type="date"
                      required
                      className="pr-10 border-border text-sm block [&::-webkit-calendar-picker-indicator]:hidden"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onFocus={(e) => e.target.blur()}
                    />
                    <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paxCount">Number of Guests (pax)</Label>
                  <Input
                    id="paxCount"
                    type="number"
                    min={1}
                    required
                    value={paxCount}
                    onChange={(e) => setPaxCount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="specialRequests">Special Requests</Label>
                  <Input
                    id="specialRequests"
                    placeholder="e.g., late arrival, extra towels"
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                  />
                </div>

                {submitError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
                    {submitError}
                  </div>
                ) : null}

                {!bookable ? (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground/80">
                    This room is currently not bookable (status: {status}).
                  </div>
                ) : null}

                <div className="space-y-2 rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>Nights</span>
                    <span className="font-semibold">{nights || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Total Cost</span>
                    <span className="font-semibold">
                      PHP {totalCost ? totalCost.toLocaleString() : "—"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    variant="default"
                    disabled={submitting || !bookable}
                  >
                    {submitting ? "Submitting..." : "Confirm Booking (Pending)"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/rooms")}
                  >
                    Back to Rooms
                  </Button>
                </div>
              </form>
            )}
          </div>

          <div className="lg:col-span-3">
            {roomActive ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="font-semibold">Booking Calendar (Room)</div>
                <div className="text-sm text-foreground/70">
                  Existing bookings for this room. Date conflicts are blocked on
                  submit.
                </div>
              </div>

              {/* Only render calendar once we have a stable string room ID. */}
              {resolvedRoomId ? (
                <RoomBookingsCalendar
                  roomId={resolvedRoomId}
                  trainingMode={trainingMode}
                />
              ) : null}
            </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">
          Room not found.
        </div>
      )}
    </div>
  );
}
