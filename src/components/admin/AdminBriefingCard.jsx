import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent} from "@/components/ui/card";
import { buildAdminContext, generateOpsBriefing } from "@/services/insightsService";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Info,
  Loader2,
  Sparkles,
  X} from "lucide-react";

const SEVERITY_STYLES = {
  high: {
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
    label: "High",
    icon: AlertTriangle,
    iconClass: "text-destructive"},
  medium: {
    chip: "border-warning/30 bg-warning/10 text-warning",
    label: "Medium",
    icon: AlertTriangle,
    iconClass: "text-warning"},
  low: {
    chip: "border-info/30 bg-info/10 text-info",
    label: "Low",
    icon: Info,
    iconClass: "text-info"}};

const DISMISS_KEY = "he_dismissed_briefings";

function readDismissed() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Ops Briefing — ranked, AI-generated to-do cards derived from the live
 * snapshot (rightNow queues + 30-day trends). Every item cites numbers and
 * deep-links to the page that resolves it. Dismissed items persist locally.
 */
export default function AdminBriefingCard() {
  const [items, setItems] = useState([]);
  const [hasRun, setHasRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    // New scope (prod vs training) invalidates dismissed items — sandbox
    // briefings are independent from production ones.
    setDismissed(readDismissed());
  }, []);

  async function runBriefing() {
    setLoading(true);
    setError(null);
    try {
      const context = await buildAdminContext({ force: true });
      const result = await generateOpsBriefing(context);
      setItems(result);
      setHasRun(true);
    } catch (e) {
      setError(e?.message || "Failed to generate briefing.");
    } finally {
      setLoading(false);
    }
  }

  function dismiss(item) {
    const next = [...dismissed, `${item.title}|${item.link}`];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const visible = items.filter((item) => !dismissed.includes(`${item.title}|${item.link}`));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-primary/10 text-primary">
              <ClipboardList className="h-4 w-4" />
            </div>
            Ops Briefing
          </CardTitle>
          <CardDescription>
            AI ranks what needs attention right now — with the numbers and the
            page to act on.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={runBriefing}
          disabled={loading}
          className="gap-2 shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {hasRun ? "Re-run" : "Run Briefing"}
            </>
          )}
        </Button>
      </CardHeader>

      {error ? (
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </CardContent>
      ) : null}

      {hasRun && !error ? (
        <CardContent className="space-y-3">
          {visible.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {items.length === 0
                ? "Nothing needs attention right now. All clear!"
                : "All briefing items handled."}
            </div>
          ) : (
            visible.map((item, idx) => {
              const style = SEVERITY_STYLES[item.severity] ?? SEVERITY_STYLES.medium;
              const SeverityIcon = style.icon;
              return (
                <div
                  key={`${item.title}-${idx}`}
                  className="rounded-xl border border-border bg-background p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <SeverityIcon className={`h-4 w-4 shrink-0 ${style.iconClass}`} />
                      <p className="text-sm font-semibold leading-tight">{item.title}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.chip}`}
                    >
                      {style.label}
                    </span>
                  </div>
                  {item.evidence ? (
                    <p className="text-xs leading-relaxed text-foreground/60">
                      <span className="font-medium text-foreground/75">Evidence: </span>
                      {item.evidence}
                    </p>
                  ) : null}
                  <p className="text-xs leading-relaxed text-foreground/75">
                    <span className="font-medium">Do this: </span>
                    {item.recommendation}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <Link
                      to={item.link}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Open
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => dismiss(item)}
                      className="inline-flex items-center gap-1 text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
                      aria-label="Dismiss item"
                    >
                      <X className="h-3.5 w-3.5" />
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      ) : null}

      {!hasRun && !error ? (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            Checks expiring payment holds, approval queues, cancellations, room
            statuses, arrivals, and trend shifts — then tells you what to do
            first.
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
