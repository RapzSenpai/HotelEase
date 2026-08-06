import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestMidStayHousekeeping, listHousekeepingLogsForRoom } from "@/services/housekeepingService";
import { createReview } from "@/services/reviewsService";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export default function GuestHousekeepingCard({ booking, room, trainingMode, userProfile }) {
  const [hkDialogOpen, setHkDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const isRequested = room?.status === "Dirty / Needs Cleaning" && room?.isMidStayRequest;
  const isCleaning = room?.status === "Being Cleaned";

  useEffect(() => {
    if (room?.id) {
      listHousekeepingLogsForRoom(room.id, { trainingMode })
        .then((data) => setLogs(data))
        .catch(() => setLogs([]));
    }
  }, [room?.id, room?.status, trainingMode]);

  async function handleRequest() {
    if (!room?.id) return;
    setRequesting(true);
    try {
      await requestMidStayHousekeeping({
        roomId: room.id,
        bookingId: booking.id,
        guestId: booking.guestId,
        guestName: userProfile?.fullName || userProfile?.email || "Guest",
        note,
        trainingMode,
      });
      toast.success("Housekeeping request sent to Front Office!");
      setHkDialogOpen(false);
      setNote("");
    } catch (err) {
      toast.error(err?.message || "Failed to request housekeeping.");
    } finally {
      setRequesting(false);
    }
  }

  async function handleSubmitReview() {
    if (!room?.id) return;
    setSubmittingReview(true);
    try {
      await createReview({
        roomId: room.id,
        bookingId: booking.id,
        guestId: booking.guestId,
        guestName: userProfile?.fullName || userProfile?.email || "Guest",
        rating,
        feedback: feedback ? `[Cleanliness Review] ${feedback}` : "[Cleanliness Review]",
        trainingMode,
      });
      toast.success("Thank you for your cleanliness feedback!");
      setReviewSubmitted(true);
      setReviewDialogOpen(false);
    } catch (err) {
      toast.error(err?.message || "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  }

  const latestPhotoLog = logs.find((l) => Array.isArray(l.photoUrls) && l.photoUrls.length > 0);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
              🧹
            </span>
            <span className="font-semibold text-sm">Mid-Stay Room Housekeeping</span>
          </div>
          <p className="text-xs text-foreground/70">
            Request room cleaning, fresh towels, or amenities while staying.
          </p>
        </div>

        {isRequested ? (
          <Badge variant="warning" className="self-start sm:self-auto py-1 px-3">
            🧹 Request Sent (Pending Staff)
          </Badge>
        ) : isCleaning ? (
          <Badge variant="info" className="self-start sm:self-auto py-1 px-3 animate-pulse">
            🧼 Cleaning in Progress
          </Badge>
        ) : (
          <Button
            size="sm"
            onClick={() => setHkDialogOpen(true)}
            className="self-start sm:self-auto gap-1.5 shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            Request Housekeeping
          </Button>
        )}
      </div>

      {latestPhotoLog && latestPhotoLog.photoUrls?.length > 0 && (
        <div className="pt-2 border-t border-primary/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Recent Cleaning Photos & Verification
            </span>
            {!reviewSubmitted && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary hover:bg-primary/10"
                onClick={() => setReviewDialogOpen(true)}
              >
                Rate Cleanliness ⭐
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {latestPhotoLog.photoUrls.map((url, idx) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border shadow-sm hover:ring-2 hover:ring-primary"
              >
                <img src={url} alt={`Cleaned room ${idx + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Request Modal */}
      <Dialog open={hkDialogOpen} onOpenChange={setHkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Mid-Stay Housekeeping</DialogTitle>
            <DialogDescription>
              Let our Front Office team know if you need room cleaning, fresh towels, or any special arrangements.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold text-foreground/70 uppercase">Special Instructions / Notes (Optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Please replace bath towels and clean around 2 PM while I'm out."
              className="w-full h-24 rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHkDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={requesting} onClick={handleRequest}>
              {requesting ? "Sending..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanliness Review Modal */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rate Room Cleanliness</DialogTitle>
            <DialogDescription>
              How satisfied are you with the housekeeping quality for {room?.name || room?.type}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`text-2xl transition-transform hover:scale-110 ${
                    star <= rating ? "text-amber-400" : "text-foreground/20"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground/70 uppercase">Comments (Optional)</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="The room was spotless! Thank you."
                className="w-full h-20 rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={submittingReview} onClick={handleSubmitReview}>
              {submittingReview ? "Submitting..." : "Submit Feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
