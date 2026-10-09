import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { roomLabel } from "@/lib/room-label";
import { useDemo } from "../DemoContext";
import DemoRoomCard from "../DemoRoomCard";

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
  const paidFor = (bookingId) =>
    data.payments.filter((p) => p.bookingId === bookingId).reduce((s, p) => s + Number(p.amount ?? 0), 0);

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
          {data.bookings.map((b) => {
            const room = data.rooms.find((r) => r.id === b.roomId);
            const paid = paidFor(b.id);
            return (
              <Card key={b.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-sm">{room ? roomLabel(room) : b.roomId}</div>
                  <Badge variant={paid >= b.totalCost ? "success" : "warning"}>{b.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-foreground/60 tabular-nums">
                  Total PHP {Number(b.totalCost).toLocaleString()} · Paid PHP {paid.toLocaleString()} · {b.nights} night{b.nights !== 1 ? "s" : ""}
                </div>
              </Card>
            );
          })}
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
            </>
          )}
          {data.housekeepingLogs.filter((l) => l.toStatus === "Dirty / Needs Cleaning").length > 0 && (
            <p className="text-xs text-foreground/60">
              {data.housekeepingLogs.filter((l) => l.toStatus === "Dirty / Needs Cleaning").length} cleaning request(s) in the sample log.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
