import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, Star, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { ACTIVE_STATUS_TEXT, buildRequests, formatWhen } from "@/lib/housekeeping-requests";
import { roomLabelFrom } from "@/lib/room-label";
import { useDemo } from "../DemoContext";
import { reviewableBooking, roomOfBooking, stayBooking } from "./guestDemoData";

export default function DemoGuestStay() {
  const { data, guest } = useDemo();
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(5);
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
  const stay = stayBooking(data);
  const reviewable = reviewableBooking(data);

  const requests = stay
    ? buildRequests(data.housekeepingLogs.filter((l) => l.bookingId === stay.id))
    : [];
  const active = requests.find((r) => r.isInFlight) || null;
  const past = requests.filter((r) => !r.isInFlight);

  function requestCleaning() {
    if (!stay) return;
    guest.demoRequestHousekeeping({ bookingId: stay.id, note: note.trim() });
    toast.success("Demo housekeeping request sent to Front Office!");
    setNote("");
  }

  function submitReview() {
    if (!reviewable) return;
    guest.demoSubmitReview({ bookingId: reviewable.id, rating, feedback: "" });
    toast.success("Demo review submitted. Nothing was saved.");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-playfair text-3xl font-semibold">Your stay</h1>
        <p className="text-sm text-foreground/70">
          Mid-stay housekeeping and reviews, on the preloaded sample stays.
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        {stay ? (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
                Currently in
              </p>
              <p className="font-playfair text-xl font-semibold">
                {roomLabelFrom(roomsById, stay.roomId)}
              </p>
              <p className="text-xs text-foreground/60">
                {formatDate(stay.checkInDate.toDate())} → {formatDate(stay.checkOutDate.toDate())} ·{" "}
                {stay.nights} night(s)
              </p>
            </div>
            <Badge variant="success" className="w-fit">Checked In</Badge>
          </>
        ) : (
          <p className="text-sm text-foreground/60">No checked-in stay in the sample data.</p>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">Request housekeeping (demo)</h2>
        {!stay ? (
          <p className="text-sm text-foreground/60">
            A checked-in stay is required — the sample data has none right now.
          </p>
        ) : (
          <>
            <p className="text-xs text-foreground/60">
              In production this needs a checked-in booking; here one is preloaded.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Fresh towels please"
                className="sm:max-w-md"
                aria-label="Housekeeping note"
              />
              <Button size="sm" className="h-9 active:scale-[0.96] sm:w-auto" onClick={requestCleaning}>
                Send request (demo)
              </Button>
            </div>

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
                <div
                  key={request.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-background px-3 py-2.5 shadow-sm"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      request.isCancelled
                        ? "bg-destructive/10 text-destructive"
                        : "bg-success/10 text-success",
                    )}
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
                      <span className="text-foreground/40">{formatWhen(request.requestedAt)}</span>
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
          </>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">Rate your last stay (demo)</h2>
        {!reviewable ? (
          <p className="text-sm text-foreground/60">
            That stay is already reviewed, or there is no completed stay in the sample data. Book and
            finish another stay to unlock one.
          </p>
        ) : (
          <>
            <p className="text-xs text-foreground/60">
              {roomOfBooking(data, reviewable)?.name ?? "Your last room"} ·{" "}
              {formatDate(reviewable.checkOutDate.toDate())}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} star`}
                  aria-pressed={star === rating}
                  onClick={() => setRating(star)}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent shadow-none transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95",
                    star <= rating ? "text-primary" : "text-foreground/30 hover:text-foreground/50",
                  )}
                >
                  <Star className={cn("h-7 w-7", star <= rating ? "fill-current" : "fill-none")} />
                </button>
              ))}
            </div>
            <Button size="sm" className="w-full active:scale-[0.96] sm:w-auto" onClick={submitReview}>
              Submit review (demo)
            </Button>
          </>
        )}
      </Card>

      <p className="text-xs text-foreground/50">
        Browsing rooms is on{" "}
        <Link to="/demo/guest" className="text-primary hover:underline underline-offset-4">
          the rooms page
        </Link>
        .
      </p>
    </div>
  );
}
