import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatElapsed, getElapsedMinutes, toJsDate } from "@/lib/time-utils";

function urgencyClass(minutes) {
  if (minutes >= 60) return "text-destructive border-destructive/30 bg-destructive/10";
  if (minutes >= 30) return "text-warning border-warning/30 bg-warning/10";
  return "text-foreground/70 border-border/60 bg-muted/20";
}

export default function CleaningTimer({ startedAt, label = "Cleaning for" }) {
  const [elapsed, setElapsed] = useState(null);

  useEffect(() => {
    const startDate = toJsDate(startedAt);
    if (!startDate) {
      setElapsed(null);
      return;
    }

    const tick = () => setElapsed(formatElapsed(startDate));
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!elapsed) return null;

  const minutes = getElapsedMinutes(startedAt);

  return (
    <div
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-medium leading-none ${urgencyClass(minutes)}`}
    >
      <Clock className="h-3 w-3 shrink-0" />
      <span>
        {label} {elapsed}
      </span>
    </div>
  );
}
