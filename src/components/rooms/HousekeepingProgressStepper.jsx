import { HOUSEKEEPING_STEPS } from "@/components/rooms/RoomStatusBadge";

const STEP_LABELS = {
  "Dirty / Needs Cleaning": "Dirty",
  "Being Cleaned": "Cleaning",
  "Pending Approval": "Review",
  Available: "Ready",
};

export default function HousekeepingProgressStepper({ status }) {
  const currentIndex = HOUSEKEEPING_STEPS.indexOf(status);
  if (currentIndex === -1) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {HOUSEKEEPING_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLast = index === HOUSEKEEPING_STEPS.length - 1;

          return (
            <div key={step} className="flex flex-1 items-center gap-1 min-w-0">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                  isComplete
                    ? "bg-success text-white"
                    : isCurrent
                      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                      : "bg-muted text-foreground/40"
                }`}
                title={step}
              >
                {isComplete ? "✓" : index + 1}
              </div>
              {!isLast && (
                <div
                  className={`h-0.5 flex-1 rounded-full transition-colors ${
                    isComplete ? "bg-success/60" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between gap-1 text-[10px] text-foreground/50">
        {HOUSEKEEPING_STEPS.map((step, index) => (
          <span
            key={step}
            className={`flex-1 text-center truncate ${
              index === currentIndex ? "font-semibold text-foreground/80" : ""
            }`}
          >
            {STEP_LABELS[step]}
          </span>
        ))}
      </div>
    </div>
  );
}
