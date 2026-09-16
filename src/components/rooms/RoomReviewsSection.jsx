import { useMemo } from "react";
import { PenLine, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/common/StarRating";
import { formatDate } from "@/lib/format";

/**
 * Guest reviews: average badge, loading/error states, the first few reviews and
 * the write-a-review / show-all buttons.
 *
 * Grep before moving confirmed that `avgRating`, `visibleReviews`,
 * `hasMoreReviews` and `showReviewCount` were referenced nowhere else in the
 * page, so the derivations came along with the markup. The component holds no
 * state — it only reports intent upward. Markup is unchanged.
 */
const SHOW_REVIEW_COUNT = 3;

export default function RoomReviewsSection({
  reviews = [],
  reviewsLoading,
  reviewsError,
  eligibilityChecked,
  canReview,
  onWriteReview,
  onShowAllReviews,
}) {
  const avgRating = useMemo(() => {
    if (!reviews.length) return null;
    const sum = reviews.reduce((acc, r) => acc + Number(r.rating ?? 0), 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const hasMoreReviews = reviews.length > SHOW_REVIEW_COUNT;
  const visibleReviews = reviews.slice(0, SHOW_REVIEW_COUNT);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-playfair text-lg font-semibold text-foreground">Guest Reviews</h2>
        {avgRating && (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
            <Star className="h-3.5 w-3.5 fill-primary text-primary" />
            <span className="text-sm font-semibold text-foreground">{avgRating}</span>
          </div>
        )}
      </div>

      {reviewsLoading && (
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      )}
      {reviewsError && !reviewsLoading && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
          {reviewsError}
        </div>
      )}

      {!reviewsLoading && !reviewsError && (
        <>
          {reviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 bg-muted/5 px-6 py-10 text-center">
              <Star className="mx-auto mb-3 h-8 w-8 text-foreground/20" />
              <p className="text-sm font-medium text-foreground/50">No reviews yet</p>
              <p className="mt-1 text-xs text-foreground/35">Be the first to share your experience!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleReviews.map((review) => (
                <div
                  key={review.id}
                  className="rounded-xl border border-border/40 bg-white p-4 space-y-2.5 shadow-[0_1px_3px_rgba(28,28,30,0.04)]"
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
              ))}
            </div>
          )}

          {hasMoreReviews && (
            <div className="flex gap-2">
              {eligibilityChecked && canReview && (
                <Button size="sm" className="flex-1" onClick={onWriteReview}>
                  <PenLine className="mr-1.5 h-3.5 w-3.5" />
                  Write a Review
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className={`bg-white/80 backdrop-blur-sm ${eligibilityChecked && canReview ? "flex-1" : "w-full"}`}
                onClick={onShowAllReviews}
              >
                Show All Reviews ({reviews.length})
              </Button>
            </div>
          )}
          {!hasMoreReviews && eligibilityChecked && canReview && (
            <Button size="sm" className="w-full" onClick={onWriteReview}>
              <PenLine className="mr-1.5 h-3.5 w-3.5" />
              Write a Review
            </Button>
          )}
        </>
      )}
    </div>
  );
}
