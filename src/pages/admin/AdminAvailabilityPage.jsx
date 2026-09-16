import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wrench,
} from "lucide-react";
import {
  loadAvailabilityDiff,
  repairAvailability,
} from "@/services/availabilityReconciliation";

const PREVIEW_LIMIT = 25;

function DriftList({ title, description, items, render, tone }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {tone === "danger" ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" />
          )}
          {title}
          <Badge variant={items.length > 0 ? tone : "secondary"}>{items.length}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-foreground/60">Nothing to fix here.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {items.slice(0, PREVIEW_LIMIT).map(render)}
            {items.length > PREVIEW_LIMIT && (
              <li className="text-xs text-foreground/50">
                … and {items.length - PREVIEW_LIMIT} more
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminAvailabilityPage() {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDiff(await loadAvailabilityDiff());
    } catch (e) {
      setError(e?.message || "Failed to load availability data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const orphans = diff?.orphanMarkers ?? [];
  const missing = diff?.missingMarkers ?? [];
  const issueCount = orphans.length + missing.length;

  async function handleRepair() {
    setRepairing(true);
    try {
      const result = await repairAvailability({ orphanMarkers: orphans, missingMarkers: missing });
      toast.success(
        `Cleaned up ${result.removed} orphan night(s) and restored ${result.restored} missing night(s).`,
      );
      await load();
    } catch (e) {
      toast.error(e?.message || "Repair failed.");
    } finally {
      setRepairing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-playfair text-2xl font-bold">Availability Integrity</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Compares bookings with the public availability markers guests see. Drift here is what
            makes a room look unavailable when it is free (or vice versa).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading || repairing} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={handleRepair} disabled={loading || repairing || issueCount === 0} className="gap-2">
            {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Repair all
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm text-foreground">{error}</CardContent>
        </Card>
      )}

      {loading && !diff ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-foreground/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking availability…
          </CardContent>
        </Card>
      ) : diff ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
              {issueCount === 0 ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="font-medium">Bookings and availability markers agree.</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <span className="font-medium">
                    {issueCount} issue{issueCount === 1 ? "" : "s"} found — use “Repair all” to fix.
                  </span>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <DriftList
              tone="danger"
              title="Orphan markers"
              description="Blocked nights left behind by a cancelled/checked-out or deleted booking. These hide rooms from guests."
              items={orphans}
              render={(m) => (
                <li key={m.id} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">{m.roomId}</span>
                  <span className="text-foreground/60">{m.date}</span>
                </li>
              )}
            />
            <DriftList
              tone="warning"
              title="Missing markers"
              description="Nights an active booking holds but that are not blocked publicly, so the room could be double-booked."
              items={missing}
              render={(m) => (
                <li key={`${m.roomId}_${m.date}`} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">{m.roomId}</span>
                  <span className="text-foreground/60">
                    {m.date} · {m.status}
                  </span>
                </li>
              )}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
