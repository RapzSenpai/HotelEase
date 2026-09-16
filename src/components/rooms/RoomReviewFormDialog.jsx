import { useState } from "react";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { StarRatingInput } from "@/components/common/StarRating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mapFirebaseError } from "@/lib/errors";

/**
 * The "Write a Review" dialog.
 *
 * Its four state values (rating, feedback, submitting, error) were referenced
 * nowhere else in the page, so they moved here along with the validation and
 * the error text. The page keeps the Firestore write and passes it in as
 * `onSubmit({ rating, feedback })` — which must reject on failure, since that is
 * what surfaces the error and keeps the draft. Markup is unchanged.
 */
export default function RoomReviewFormDialog({ open, onOpenChange, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Clearing the draft on close used to live in the page's onOpenChange wrapper.
  const handleOpenChange = (next) => {
    onOpenChange(next);
    if (!next) {
      setRating(0);
      setFeedback("");
      setSubmitError(null);
    }
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);

    if (!rating || rating < 1) {
      setSubmitError("Please select a star rating.");
      return;
    }
    if (!feedback.trim()) {
      setSubmitError("Please enter your feedback.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ rating, feedback: feedback.trim() });
      setRating(0);
      setFeedback("");
    } catch (e) {
      setSubmitError(
        mapFirebaseError(e) || "Failed to submit review. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-playfair text-xl">Write a Review</DialogTitle>
          <DialogDescription>
            Share your experience staying in this room.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-foreground/50 uppercase tracking-wider">
              Your Rating<RequiredIndicator />
            </span>
            <StarRatingInput value={rating} onChange={setRating} />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="review-feedback-dialog"
              className="text-xs font-medium text-foreground/50 uppercase tracking-wider"
            >
              Your Feedback<RequiredIndicator />
            </label>
            <textarea
              id="review-feedback-dialog"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="Share your experience with this room…"
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/35 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none transition-colors"
              disabled={submitting}
            />
          </div>
          {submitError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
              {submitError}
            </div>
          )}
          <Button
            type="submit"
            variant="default"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? "Submitting…" : "Submit Review"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
