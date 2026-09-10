import { memo, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Read-only star rating display.
 * Uses the lucide `Star` icon (rounded, smooth shape) for consistency
 * across the whole UI.
 */
export const StarRating = memo(function StarRating({ rating, max = 5, className, starClassName }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${rating} out of ${max} stars`}
    >
      {Array.from({ length: max }, (_, i) => {
        const filled = i < rating;
        return (
          <Star
            key={i}
            aria-hidden="true"
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              filled ? "fill-primary text-primary" : "fill-none text-foreground/25",
              starClassName
            )}
          />
        );
      })}
    </span>
  );
});

/**
 * Interactive star rating selector with hover preview.
 */
export const StarRatingInput = memo(function StarRatingInput({
  value,
  onChange,
  max = 5,
  disabled = false,
  className,
  starClassName,
}) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      onMouseLeave={() => setHovered(0)}
      role="radiogroup"
      aria-label="Rating"
    >
      {Array.from({ length: max }, (_, i) => {
        const star = i + 1;
        const active = star <= display;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
            className={cn(
              "rounded-sm p-0.5 transition-transform hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
              starClassName
            )}
            onMouseEnter={() => !disabled && setHovered(star)}
            onClick={() => onChange?.(star)}
          >
            <Star
              aria-hidden="true"
              className={cn(
                "h-7 w-7 shrink-0 transition-colors",
                active ? "fill-primary text-primary" : "fill-none text-foreground/25"
              )}
            />
          </button>
        );
      })}
    </div>
  );
});
