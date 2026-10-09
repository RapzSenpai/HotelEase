import { useEffect, useMemo, useState } from "react";
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
import {
  requestMidStayHousekeeping,
  cancelMidStayRequest,
  rateHousekeeping,
  subscribeToHousekeepingLogsForBooking,
} from "@/services/housekeepingService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { roomLabel } from "@/lib/room-label";
import {
  Sparkles,
  Clock,
  Loader2,
  Star,
  ImageIcon,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const QUICK_OPTIONS = [
  "Fresh towels",
  "Fresh sheets",
  "Deep clean",
  "Extra amenities",
];

// Statuses that mean a request is still being worked on by housekeeping.
const IN_FLIGHT_STATUSES = new Set([
  "Dirty / Needs Cleaning",
  "Being Cleaned",
  "Pending Approval",
]);

function tsToMs(tsLike) {
  if (!tsLike) return 0;
  if (typeof tsLike.toMillis === "function") return tsLike.toMillis();
  if (typeof tsLike.toDate === "function") return tsLike.toDate().getTime();
  if (typeof tsLike === "number") return tsLike;
  if (tsLike.seconds) return tsLike.seconds * 1000;
  return 0;
}

function formatWhen(tsLike) {
  const ms = tsToMs(tsLike);
  if (!ms) return "";
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stripRequestPrefix(note = "") {
  return String(note)
    .replace(/^\[Mid-Stay Request Cancelled\]\s*/, "")
    .replace(/^\[Mid-Stay Request\]\s*/, "");
}

/**
 * Rebuild the per-request history from the room's log stream. Every log of a
 * cleaning cycle shares the same `requestId` (the id of the origin request
 * log), so grouping by it yields one entry per request with its own status,
 * photos, and rating. Logs written before requestId existed fall back to a
 * heuristic: a guest-origin "Dirty / Needs Cleaning" log starts a new request
 * and any following log joins the most recent one.
 */
function buildRequests(logs) {
  const asc = [...logs].sort((a, b) => tsToMs(a.createdAt) - tsToMs(b.createdAt));
  const groups = [];
  const byRequestId = new Map();

  for (const log of asc) {
    if (log.requestId) {
      let group = byRequestId.get(log.requestId);
      if (!group) {
        group = { requestId: log.requestId, logs: [] };
        byRequestId.set(log.requestId, group);
        groups.push(group);
      }
      group.logs.push(log);
      continue;
    }

    // Legacy fallback: an origin log starts a new request; anything else joins
    // the most recent one.
    const isOrigin =
      log.changedByRole === "guest" &&
      log.toStatus === "Dirty / Needs Cleaning" &&
      log.isMidStayRequest;
    if (isOrigin || groups.length === 0) {
      groups.push({ requestId: null, logs: [log] });
    } else {
      groups[groups.length - 1].logs.push(log);
    }
  }

  return groups
    .map((group) => {
      const latest = group.logs[group.logs.length - 1];
      const origin =
        group.logs.find(
          (l) => l.changedByRole === "guest" && l.toStatus === "Dirty / Needs Cleaning",
        ) || group.logs[0];
      const completion = group.logs.find((l) => l.toStatus === "Available");
      const photoLog = group.logs.find(
        (l) => Array.isArray(l.photoUrls) && l.photoUrls.length > 0,
      );
      const status = latest?.toStatus || "Unknown";
      return {
        id: group.requestId || origin?.id || group.logs[0]?.id,
        requestedAt: origin?.createdAt || group.logs[0]?.createdAt,
        note: stripRequestPrefix(origin?.note || group.logs[0]?.note || ""),
        status,
        latestRole: latest?.changedByRole || null,
        photos: photoLog?.photoUrls || [],
        completionLog: completion || null,
        rated: !!completion?.rating,
        rating: completion?.rating || null,
        ratingFeedback: completion?.ratingFeedback || "",
        isInFlight: IN_FLIGHT_STATUSES.has(status),
        isCompleted: status === "Available",
        isCancelled: status === "Occupied / Checked In",
      };
    })
    .sort((a, b) => tsToMs(b.requestedAt) - tsToMs(a.requestedAt));
}

const ACTIVE_STATUS_TEXT = {
  "Dirty / Needs Cleaning":
    "Your request has been sent to Front Office. We'll update you once cleaning begins.",
  "Being Cleaned":
    "Our housekeeping team is currently refreshing your room. We'll notify you once it's done.",
  "Pending Approval":
    "Cleaning completed! Awaiting final approval from Front Office. We'll notify you once your room is ready.",
};

/**
 * One past-request row. Shared by the inline latest entry and the history
 * drawer so both stay identical without duplicating markup.
 */
function PastRequestRow({ request, onRate, onSeePhotos }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-background px-3 py-2.5 shadow-sm">
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
            {request.isCancelled
              ? request.latestRole === "fo"
                ? "Cancelled by Front Office"
                : "Cancelled"
              : "Completed"}
          </span>
          <span className="text-foreground/40">
            {formatWhen(request.requestedAt)}
          </span>
          {request.isCompleted && request.rated && (
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={cn(
                    "h-3.5 w-3.5",
                    star <= request.rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-foreground/20",
                  )}
                />
              ))}
            </span>
          )}
        </div>
        {request.note && (
          <p className="truncate text-xs text-foreground/60">
            &ldquo;{request.note}&rdquo;
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {request.isCompleted && !request.rated && (
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onRate(request)}
          >
            Rate Cleanliness
          </Button>
        )}
        {request.photos.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onSeePhotos(request)}
          >
            <ImageIcon className="mr-1 h-3.5 w-3.5" /> See Photos
          </Button>
        )}
      </div>
    </div>
  );
}

export default function GuestHousekeepingCard({ booking, room, trainingMode, userProfile }) {
  const [hkDialogOpen, setHkDialogOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [note, setNote] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [logs, setLogs] = useState([]);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [photosTarget, setPhotosTarget] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!room?.id || !booking?.id) return;
    // Booking-scoped: the backend only serves this booking's logs, so other
    // guests' notes/photos never reach the client. The filter below stays as
    // defense-in-depth for legacy logs missing bookingId.
    return subscribeToHousekeepingLogsForBooking(booking.id, (data) => {
      const bookingTime = booking?.createdAt?.toDate
        ? booking.createdAt.toDate().getTime()
        : booking?.createdAt?.seconds
        ? booking.createdAt.seconds * 1000
        : 0;

      // Only this booking's logs — a later guest in the same room must never
      // see the previous guest's housekeeping history.
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
    }, { trainingMode, roomId: room.id, guestId: booking.guestId });
  }, [room?.id, booking?.id, booking?.guestId, booking?.createdAt, trainingMode]);

  const requests = useMemo(() => buildRequests(logs), [logs]);
  const activeRequest = requests.find((r) => r.isInFlight) || null;
  const pastRequests = requests.filter((r) => !r.isInFlight);

  function toggleOption(opt) {
    setSelectedOptions((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  }

  async function handleRequest() {
    if (!room?.id) return;
    setRequesting(true);
    try {
      const combinedNote = [selectedOptions.join(", "), note.trim()]
        .filter(Boolean)
        .join(" — ");
      await requestMidStayHousekeeping({
        roomId: room.id,
        bookingId: booking.id,
        guestId: booking.guestId,
        guestName: userProfile?.fullName || userProfile?.email || "Guest",
        note: combinedNote,
        trainingMode,
      });
      toast.success("Housekeeping request sent to Front Office!");
      setHkDialogOpen(false);
      setNote("");
      setSelectedOptions([]);
    } catch (err) {
      toast.error(err?.message || "Failed to request housekeeping.");
    } finally {
      setRequesting(false);
    }
  }

  async function handleCancelRequest() {
    if (!room?.id || !booking?.id) return;
    setCancelling(true);
    try {
      await cancelMidStayRequest({
        roomId: room.id,
        bookingId: booking.id,
        cancelledByRole: "guest",
        cancelledByUserId: booking.guestId,
        cancelledByName: userProfile?.fullName || userProfile?.email || "Guest",
        trainingMode,
      });
      toast.success("Housekeeping request cancelled.");
    } catch (err) {
      toast.error(err?.message || "Failed to cancel request.");
    } finally {
      setCancelling(false);
    }
  }

  function openReview(request) {
    setRating(5);
    setFeedback("");
    setReviewTarget(request);
  }

  async function handleSubmitReview() {
    if (!reviewTarget?.completionLog?.id) return;
    setSubmittingReview(true);
    try {
      await rateHousekeeping({
        logId: reviewTarget.completionLog.id,
        rating,
        feedback,
        roomName: room?.name || room?.type || "",
        trainingMode,
      });
      toast.success("Thank you for your cleanliness feedback!");
      setReviewTarget(null);
    } catch (err) {
      toast.error(err?.message || "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  }

  const roomTitle = roomLabel(room);

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
        {activeRequest?.status === "Dirty / Needs Cleaning" ? (
          <Badge variant="warning" className="shrink-0">
            <Clock className="mr-1 h-3.5 w-3.5" /> Request sent
          </Badge>
        ) : activeRequest?.status === "Being Cleaned" ? (
          <Badge variant="info" className="shrink-0 animate-pulse">
            <Loader2 className="mr-1 h-3.5 w-3.5" /> Cleaning in progress
          </Badge>
        ) : activeRequest?.status === "Pending Approval" ? (
          <Badge variant="secondary" className="shrink-0">
            <Clock className="mr-1 h-3.5 w-3.5" /> Pending approval
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {activeRequest ? (
          <div className="rounded-lg border border-warning/20 bg-warning/5 px-3.5 py-3">
            <p className="flex items-start gap-2 text-xs text-foreground/80">
              {activeRequest.status === "Being Cleaned" ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-info" />
              ) : (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              )}
              <span>
                {ACTIVE_STATUS_TEXT[activeRequest.status]}
                {activeRequest.note ? (
                  <span className="mt-1 block text-foreground/60">
                    Requested: &ldquo;{activeRequest.note}&rdquo;
                  </span>
                ) : null}
              </span>
            </p>
            {(activeRequest.status === "Dirty / Needs Cleaning" ||
              activeRequest.photos.length > 0) && (
              <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
                {activeRequest.photos.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setPhotosTarget(activeRequest)}
                  >
                    <ImageIcon className="mr-1 h-3.5 w-3.5" /> See Photos
                  </Button>
                )}
                {activeRequest.status === "Dirty / Needs Cleaning" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={cancelling}
                    onClick={handleCancelRequest}
                  >
                    {cancelling ? "Cancelling..." : "Cancel Request"}
                  </Button>
                )}
              </div>
            )}
          </div>
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

        {pastRequests.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                Housekeeping History
              </p>
              <span className="text-xs text-foreground/40">
                {requests.length} request{requests.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Latest stays inline so the card stays short; the rest live
                in the history drawer below. */}
            <PastRequestRow
              request={pastRequests[0]}
              onRate={openReview}
              onSeePhotos={setPhotosTarget}
            />
            {pastRequests.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full text-xs"
                onClick={() => setHistoryOpen(true)}
              >
                View all history ({pastRequests.length})
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {/* History Drawer */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Housekeeping History</DialogTitle>
            <DialogDescription>
              All past requests for {roomTitle} — newest first.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto py-2">
            {pastRequests.map((request) => (
              <PastRequestRow
                key={request.id}
                request={request}
                onRate={openReview}
                onSeePhotos={setPhotosTarget}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase text-foreground/70">
                What do you need?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_OPTIONS.map((opt) => {
                  const active = selectedOptions.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleOption(opt)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border text-foreground/70 hover:border-primary/40",
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="hk-note"
                className="text-xs font-semibold uppercase text-foreground/70"
              >
                Special Instructions / Notes (Optional)
              </label>
              <textarea
                id="hk-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Please replace bath towels and clean around 2 PM while I'm out."
                className="h-24 w-full resize-none rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
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
      <Dialog
        open={!!photosTarget}
        onOpenChange={(open) => !open && setPhotosTarget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cleaning Photos</DialogTitle>
            <DialogDescription>
              Proof of housekeeping for {roomTitle}
              {photosTarget ? ` — ${formatWhen(photosTarget.requestedAt)}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(photosTarget?.photos || []).map((url, idx) => (
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
            <Button variant="outline" size="sm" onClick={() => setPhotosTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanliness Review Modal */}
      <Dialog
        open={!!reviewTarget}
        onOpenChange={(open) => !open && setReviewTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rate Room Cleanliness</DialogTitle>
            <DialogDescription>
              How satisfied are you with the housekeeping on{" "}
              {reviewTarget ? formatWhen(reviewTarget.requestedAt) : "your stay"} for {roomTitle}?
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
                    className={cn(
                      "h-8 w-8",
                      star <= rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-foreground/20",
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <label
                htmlFor="hk-feedback"
                className="text-xs font-semibold uppercase text-foreground/70"
              >
                Comments (Optional)
              </label>
              <textarea
                id="hk-feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="The room was spotless! Thank you."
                className="h-20 w-full resize-none rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReviewTarget(null)}
            >
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
