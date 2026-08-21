import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestMidStayHousekeeping, listHousekeepingLogsForRoom } from "@/services/housekeepingService";
import { createReview, hasUserReviewedRoom } from "@/services/reviewsService";
import { toast } from "sonner";
import { Sparkles, Clock, Loader2, Star, ImageIcon } from "lucide-react";

export default function GuestHousekeepingCard({ booking, room, trainingMode, userProfile }) {
  const [hkDialogOpen, setHkDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const isRequested =
    room?.status === "Dirty / Needs Cleaning" &&
    room?.isMidStayRequest &&
    room?.midStayBookingId === booking?.id;
  const isCleaning =
    room?.status === "Being Cleaned" &&
    room?.isMidStayRequest &&
    room?.midStayBookingId === booking?.id;
  const isPendingApproval =
    room?.status === "Pending Approval" &&
    room?.isMidStayRequest &&
    room?.midStayBookingId === booking?.id;

  useEffect(() => {
    if (room?.id && booking?.id) {
      listHousekeepingLogsForRoom(room.id, { trainingMode })
        .then((data) => {
          const bookingTime = booking?.createdAt?.toDate
            ? booking.createdAt.toDate().getTime()
            : booking?.createdAt?.seconds
            ? booking.createdAt.seconds * 1000
            : 0;

          const scopedLogs = data.filter((log) => {
            if (log.bookingId) return log.bookingId === booking.id;
            const logTime = log.createdAt?.toDate
              ? log.createdAt.toDate().getTime()
              : log.createdAt?.seconds
              ? log.createdAt.seconds * 1000
              : 0;
            return (
              log.isMidStayRequest &&
              log.changedByUserId === booking.guestId &&
              logTime >= bookingTime
            );
          });

          setLogs(scopedLogs);
        })
        .catch(() => setLogs([]));
    }
  }, [
    room?.id,
    room?.status,
    booking?.id,
    booking?.guestId,
    booking?.createdAt,
    trainingMode,
  ]);

  useEffect(() => {
    if (room?.id && booking?.guestId) {
      hasUserReviewedRoom(booking.guestId, room.id, { trainingMode })
        .then((hasReviewed) => {
          setReviewSubmitted(hasReviewed);
        })
        .catch(() => setReviewSubmitted(false));
    }
  }, [room?.id, booking?.guestId, trainingMode]);

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
  const photoUrls = latestPhotoLog?.photoUrls || [];

  const cleaningCompleted = logs.some((l) =>
    ["Pending Approval", "Available"].includes(l.toStatus)
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-base">Room Housekeeping</CardTitle>
            <CardDescription className="text-xs">
              Request cleaning, fresh towels, or amenities while you stay.
            </CardDescription>
          </div>
        </div>
        {isRequested ? (
          <Badge variant="warning" className="shrink-0">
            <Clock className="mr-1 h-3.5 w-3.5" /> Request sent
          </Badge>
        ) : isCleaning ? (
          <Badge variant="info" className="shrink-0 animate-pulse">
            <Loader2 className="mr-1 h-3.5 w-3.5" /> Cleaning in progress
          </Badge>
        ) : isPendingApproval ? (
          <Badge variant="secondary" className="shrink-0">
            <Clock className="mr-1 h-3.5 w-3.5" /> Pending approval
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {isRequested ? (
          <p className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3.5 py-2.5 text-xs text-foreground/80">
            <Clock className="h-4 w-4 shrink-0 text-warning" />
            Your request has been sent to Front Office. We&apos;ll update you once cleaning begins.
          </p>
        ) : isCleaning ? (
          <p className="flex items-center gap-2 rounded-lg border border-info/20 bg-info/5 px-3.5 py-2.5 text-xs text-foreground/80">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
            Our housekeeping team is currently refreshing your room. We&apos;ll notify you once
            it&apos;s done.
          </p>
        ) : isPendingApproval ? (
          <p className="flex items-center gap-2 rounded-lg border border-secondary/20 bg-secondary/5 px-3.5 py-2.5 text-xs text-foreground/80">
            <Clock className="h-4 w-4 shrink-0 text-secondary" />
            Cleaning completed! Awaiting final approval from Front Office. We&apos;ll notify you once your room is ready.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-foreground/60">
              Need your room refreshed, fresh towels, or extra amenities?
            </p>
            <Button size="sm" onClick={() => setHkDialogOpen(true)}>
              Request Housekeeping
            </Button>
          </div>
        )}

        {(photoUrls.length > 0 || (cleaningCompleted && !reviewSubmitted)) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-foreground/60">
              {photoUrls.length > 0
                ? "Housekeeping completed — view cleaning photos or rate cleanliness."
                : "Housekeeping completed — how was the cleaning?"}
            </p>
            <div className="flex items-center gap-1.5">
              {!reviewSubmitted && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setReviewDialogOpen(true)}
                >
                  Rate Cleanliness
                </Button>
              )}
              {photoUrls.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setPhotosOpen(true)}
                >
                  <ImageIcon className="mr-1 h-3.5 w-3.5" /> See Photos
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {/* Request Modal */}
      <Dialog open={hkDialogOpen} onOpenChange={setHkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Mid-Stay Housekeeping</DialogTitle>
            <DialogDescription>
              Let our Front Office team know if you need room cleaning, fresh towels, or any special
              arrangements.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label htmlFor="hk-note" className="text-xs font-semibold text-foreground/70 uppercase">
              Special Instructions / Notes (Optional)
            </label>
            <textarea
              id="hk-note"
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

      {/* Cleaning Photos Overlay */}
      <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cleaning Photos</DialogTitle>
            <DialogDescription>
              Proof of housekeeping for {room?.name || room?.type}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photoUrls.map((url, idx) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="group relative aspect-square overflow-hidden rounded-lg border border-border shadow-sm hover:ring-2 hover:ring-primary"
              >
                <img
                  src={url}
                  alt={`Cleaned room ${idx + 1}`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </a>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPhotosOpen(false)}>
              Close
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
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 ${
                      star <= rating ? "fill-amber-400 text-amber-400" : "text-foreground/20"
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <label htmlFor="hk-feedback" className="text-xs font-semibold text-foreground/70 uppercase">
                Comments (Optional)
              </label>
              <textarea
                id="hk-feedback"
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
    </Card>
  );
}
