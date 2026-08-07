import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

export const StarRating = memo(function StarRating({ avg, count }) {
  if (!count)
    return <span className="text-xs text-foreground/40">No reviews yet</span>;
  const full = Math.round(avg);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${i < full ? "fill-primary text-primary" : "text-foreground/20"}`}
          />
        ))}
      </div>
      <span className="text-xs text-foreground/60">
        {avg.toFixed(1)}
      </span>
    </div>
  );
});

export function SectionEyebrow({ children }) {
  return (
    <Badge variant="primary" className="px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-semibold">
      {children}
    </Badge>
  );
}

export function SectionDivider() {
  return (
    <div className="relative h-px w-full overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </div>
  );
}

export function AmbientGlow({ position = "top-left", size = "md", intensity = 0.12, className = "" }) {
  const sizeClass = {
    sm: "h-[300px] w-[300px]",
    md: "h-[400px] w-[400px]",
    lg: "h-[500px] w-[500px]",
    xl: "h-[600px] w-[600px]",
  }[size] || "h-[400px] w-[400px]";

  const posClass = {
    "top-left": "top-0 left-0 -translate-x-1/4 -translate-y-1/4",
    "top-right": "top-0 right-0 translate-x-1/4 -translate-y-1/4",
    "bottom-left": "bottom-0 left-0 -translate-x-1/4 translate-y-1/4",
    "bottom-right": "bottom-0 right-0 translate-x-1/4 translate-y-1/4",
    "bottom-center": "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3",
    "top-center": "top-0 left-1/2 -translate-x-1/2 -translate-y-1/3",
    "mid-right": "top-1/2 right-0 translate-x-1/3 -translate-y-1/2",
    "mid-left": "top-1/2 left-0 -translate-x-1/3 -translate-y-1/2",
  }[position] || "top-0 left-0";

  return (
    <div
      className={`absolute ${posClass} ${sizeClass} rounded-full blur-[80px] pointer-events-none -z-10 ${className}`}
      style={{ backgroundColor: `rgba(245, 197, 24, ${intensity})` }}
      aria-hidden="true"
    />
  );
}

export function LayeredLogoBadge({ src, alt, logoSize = 85 }) {
  return (
    <div className="relative flex h-52 w-52 items-center justify-center md:h-56 md:w-56">
      <div className="absolute inset-[6%] z-10 flex items-center justify-center rounded-full border border-border/40 bg-white shadow-[0_4px_20px_rgba(28,28,30,0.08),0_1px_4px_rgba(28,28,30,0.04)]">
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`h-[${logoSize}%] w-[${logoSize}%] max-w-[${logoSize}%] object-contain`}
        />
      </div>
    </div>
  );
}