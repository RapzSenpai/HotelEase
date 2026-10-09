import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ACTIVE_STATUS_TEXT, buildRequests, formatWhen } from "@/lib/housekeeping-requests";
import { useDemo } from "../DemoContext";
import DemoRoomCard from "../DemoRoomCard";
import DemoBookingCard from "../DemoBookingCard";

const TABS = ["Rooms", "My Bookings", "Reviews", "Housekeeping"];

export default function DemoGuestPage() {
  const { role, data, guest } = useDemo();
  const [tab, setTab] = useState("Rooms");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(5);
  const [favorites, setFavorites] = useState([]);

  function toggleFavorite(roomId) {
    setFavorites((favs) =>
      favs.includes(roomId) ? favs.filter((id) => id !== roomId) : [...favs, roomId],
    );
  }

  if (!role) return <Navigate to="/demo" replace />;

  const checkedIn = data.bookings.find((b) => b.status === "Checked In");
  const completed = data.bookings.find((b) => b.status === "Checked Out" && b.demoRating == null);

  function book(room) {
    guest.demoCreateBooking({ roomId: room.id, method: "Over-the-Counter" });
    toast.success(`Demo booking for ${room.name} created (Pending)!`);
    setTab("My Bookings");
  }

  function review() {
    if (!completed) return;
    guest.demoSubmitReview({ bookingId: completed.id, rating, feedback: "" });
    toast.success("Demo review submitted. Nothing was saved.");
  }

  function requestCleaning() {
    if (!checkedIn) return;
    guest.demoRequestHousekeeping({ bookingId: checkedIn.id, note: note.trim() });
    toast.success("Demo housekeeping request sent to Front Office!");
    setNote("");
    setTab("Housekeeping");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-playfair text-3xl font-semibold">Guest Demo</h1>
        <p className="text-sm text-foreground/70">
          Explore the guest experience with sample data. Prerequisites are waived — everything is simulated.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>

      {tab === "Rooms" && (
        <div className="space-y-4">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/rooms?demo=1">
              Browse live rooms <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.rooms.filter((r) => r.isActive !== false).map((room, i) => (
              <div key={room.id} className="space-y-2">
                <DemoRoomCard
                  room={room}
                  animationIndex={i}
                  isFavorite={favorites.includes(room.id)}
                  onToggleFavorite={toggleFavorite}
                />
                <Button size="sm" variant="secondary" className="h-8 w-full text-xs" onClick={() => book(room)}>
                  Book (demo)
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "My Bookings" && (
        <div className="space-y-2">
          {data.bookings.map((b) => (
            <DemoBookingCard
              key={b.id}
              booking={b}
              room={data.rooms.find((r) => r.id === b.roomId)}
              payments={data.payments.filter((p) => p.bookingId === b.id)}
              onCancel={(bookingId) => {
                guest.demoCancelBooking({ bookingId });
                toast.success("Demo booking cancelled. Nothing was saved.");
              }}
            />
          ))}
        </div>
      )}

      {tab === "Reviews" && (
        <Card className="p-4 space-y-3">
          <CardHeader className="p-0 font-semibold">Rate your stay (demo)</CardHeader>
          {!completed ? (
            <p className="text-sm text-foreground/60">No completed stay awaiting review in the sample data.</p>
          ) : (
            <>
              <p className="text-xs text-foreground/60">In production a completed stay is required — here one is preloaded.</p>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" aria-label={`${s} star`} onClick={() => setRating(s)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${s <= rating ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-foreground/60"}`}>
                    {s}★
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={review}>Submit review (demo)</Button>
            </>
          )}
        </Card>
      )}

      {tab === "Housekeeping" && (
        <Card className="p-4 space-y-3">
          <CardHeader className="p-0 font-semibold">Request cleaning (demo)</CardHeader>
          {!checkedIn ? (
            <p className="text-sm text-foreground/60">No checked-in stay in the sample data.</p>
          ) : (
            <>
              <p className="text-xs text-foreground/60">In production a checked-in booking is required — one is preloaded.</p>
              <CardContent className="p-0 space-y-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Fresh towels please" />
                <Button size="sm" onClick={requestCleaning}>Send request (demo)</Button>
              </CardContent>
              {(() => {
                const requests = buildRequests(
                  data.housekeepingLogs.filter((l) => l.bookingId === checkedIn.id),
                );
                const active = requests.find((r) => r.isInFlight) || null;
                const past = requests.filter((r) => !r.isInFlight);
                return (
                  <div className="space-y-2">
                    {active && (
                      <p className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm shadow-sm">
                        {active.status === "Being Cleaned" ? (
                          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-info" />
                        ) : (
                          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        )}
                        <span>
                          {ACTIVE_STATUS_TEXT[active.status] || active.status}
                          {active.note ? (
                            <span className="mt-1 block text-foreground/60">
                              Requested: &ldquo;{active.note}&rdquo;
                            </span>
                          ) : null}
                        </span>
                      </p>
                    )}
                    {past.map((request) => (
                      <div key={request.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-background px-3 py-2.5 shadow-sm">
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            request.isCancelled
                              ? "bg-destructive/10 text-destructive"
                              : "bg-success/10 text-success")}
                        >
                          {request.isCancelled ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            <span className="font-medium text-foreground">
                              {request.isCancelled ? "Cancelled" : "Completed"}
                            </span>
                            <span className="text-foreground/40">
                              {formatWhen(request.requestedAt)}
                            </span>
                          </div>
                          {request.note && (
                            <p className="truncate text-xs text-foreground/60">
                              &ldquo;{request.note}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
