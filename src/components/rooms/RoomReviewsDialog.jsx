import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StarRating } from "@/components/common/StarRating";
import { formatDate } from "@/lib/format";

/**
 * The "All Guest Reviews" overlay: a star filter plus the filtered list.
 *
 * The star filter state and the two memos that derive from it (the filtered
 * list and the per-star counts) moved here too — the page used them for nothing
 * else, so keeping them behind this component's boundary removes three pieces
 * of state from a page that already had 25. Markup is verbatim.
 */
export default function RoomReviewsDialog({ open, onOpenChange, reviews }) {
  const [reviewFilter, setReviewFilter] = useState("all");

  // The page used to reset this filter just before opening the dialog. The
  // filter lives here now, so resetting on open keeps that behaviour — and
  // covers any future entry point that forgets to do it.
  useEffect(() => {
    if (open) setReviewFilter("all");
  }, [open]);

  const filteredReviews = useMemo(() => {
    if (reviewFilter === "all") return reviews;
    const star = Number(reviewFilter);
    return reviews.filter((r) => Number(r.rating ?? 0) === star);
  }, [reviews, reviewFilter]);

  const reviewCounts = useMemo(() => {
    const counts = { all: reviews.length };
    for (let i = 1; i <= 5; i++) {
      counts[i] = reviews.filter((r) => Number(r.rating ?? 0) === i).length;
    }
    return counts;
  }, [reviews]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-playfair text-xl">All Guest Reviews</DialogTitle>
          <DialogDescription>
            {reviews.length} review{reviews.length !== 1 ? "s" : ""} for this room
          </DialogDescription>
        </DialogHeader>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/10 p-2">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
          {["all", "5", "4", "3", "2", "1"].map((f) => (
            <button
              key={f}
              onClick={() => setReviewFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                reviewFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/20 text-foreground/60 hover:bg-muted/30"
              }`}
            >
              {f === "all" ? `All (${reviewCounts.all})` : `${f} ★ (${reviewCounts[Number(f)] || 0})`}
            </button>
          ))}
        </div>

        {/* Reviews list */}
        <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
          {filteredReviews.length === 0 ? (
            <p className="text-sm text-foreground/50 text-center py-8">No reviews match this filter.</p>
          ) : (
            filteredReviews.map((review) => (
              <div
                key={review.id}
                className="rounded-xl border border-border/40 bg-background p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {review.guestName || "Guest"}
                  </span>
                  <span className="text-xs text-foreground/40">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                <StarRating rating={Number(review.rating ?? 0)} />
                {review.feedback && (
                  <p className="text-sm text-foreground/65 leading-relaxed">
                    {review.feedback}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
