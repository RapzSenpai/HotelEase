import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { resetTrainingData } from "@/services/trainingService";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Trash2,
} from "lucide-react";

const COLLECTIONS_TO_CLEAR = [
  { label: "Bookings", code: "training_bookings" },
  { label: "Guest Accounts", code: "training_guests" },
  { label: "Room Inventory", code: "training_rooms" },
  { label: "Payment Records", code: "training_payments" },
  { label: "Housekeeping Logs", code: "training_housekeeping" },
];

export default function AdminTrainingDataResetPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  async function onReset() {
    if (
      !window.confirm(
        "This will permanently delete ALL training sandbox data. Production records are unaffected. Continue?"
      )
    ) {
      return;
    }
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      const res = await resetTrainingData();
      setStatus(
        res?.ok
          ? "Training data reset requested successfully."
          : "Reset completed.",
      );
    } catch (e) {
      setError(e?.message || "Failed to reset training data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="font-playfair text-4xl font-bold tracking-tight">
          Training Data Reset
        </h1>
        <p className="text-muted-foreground text-lg">
          Clear all training sandbox data without affecting production records.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4" />
          {status}
        </div>
      ) : null}

      <Card className="rounded-2xl border-border shadow-sm">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <CardTitle>Reset Training Sandbox</CardTitle>
              <CardDescription>
                Permanently wipe all{" "}
                <span className="font-mono text-foreground/70">training_*</span>{" "}
                data. Production records are never touched.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div>
            <p className="text-sm font-semibold mb-3">
              The following data will be cleared:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {COLLECTIONS_TO_CLEAR.map((c) => (
                <div
                  key={c.code}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/5 px-3 py-2.5"
                >
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {c.code}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <Database className="h-4 w-4 text-primary shrink-0" />
            Production data is fully isolated and safe during this reset.
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-warning" />
              This action is permanent and cannot be undone.
            </p>
            <Button
              variant="destructive"
              onClick={onReset}
              disabled={loading}
              className="gap-2 shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Reset Training Data
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
