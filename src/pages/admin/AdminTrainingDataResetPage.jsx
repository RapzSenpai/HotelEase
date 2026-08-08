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
import { seedTrainingData } from "@/services/seedService";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";

const COLLECTIONS_TO_CLEAR = [
  { label: "Bookings", code: "training_bookings" },
  { label: "Guest Accounts", code: "training_guests" },
  { label: "Room Inventory", code: "training_rooms" },
  { label: "Payment Records", code: "training_payments" },
  { label: "Housekeeping Logs", code: "training_housekeeping" },
];

const SEED_ITEMS = [
  { label: "Room Inventory", code: "training_rooms" },
  { label: "Guest Accounts", code: "training_guests" },
  { label: "Bookings", code: "training_bookings" },
  { label: "Payment Records", code: "training_payments" },
];

export default function AdminTrainingDataResetPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);

  async function onSeed() {
    setSeeding(true);
    setStatus(null);
    setError(null);
    try {
      const res = await seedTrainingData();
      const c = res?.counts;
      setStatus(
        c
          ? `Demo data seeded: ${c.rooms} rooms, ${c.guests} users, ${c.bookings} bookings, ${c.payments} payment(s).`
          : "Demo data seeded successfully.",
      );
    } catch (e) {
      setError(e?.message || "Failed to seed demo data.");
    } finally {
      setSeeding(false);
    }
  }

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
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-semibold tracking-tight">
            Training Sandbox
          </h1>
          <p className="text-foreground/60">
            Seed demo data into the sandbox and reset it — production records are never affected.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {status}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            Seed Demo Data
          </CardTitle>
          <CardDescription>
            Populate the sandbox with sample data so trainees can explore every
            role immediately.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-semibold mb-2">
              The following sample data will be created:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SEED_ITEMS.map((item) => (
                <div
                  key={item.code}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/5 px-3 py-2"
                >
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {item.code}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            This operation is idempotent, running it again safely preserves any
            existing sandbox data.
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Database className="h-4 w-4 text-primary" />
              Sample data is written only to the sandbox; production records are
              never affected.
            </p>
            <Button
              variant="default"
              onClick={onSeed}
              disabled={seeding}
              className="gap-2 shrink-0"
            >
              {seeding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Seed Demo Data
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </div>
              Reset Training Sandbox
            </CardTitle>
            <CardDescription>
              Permanently wipe all{" "}
              <span className="font-mono text-foreground/70">training_*</span>{" "}
              data. Production records are never touched.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-semibold mb-2">
              The following data will be cleared:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {COLLECTIONS_TO_CLEAR.map((c) => (
                <div
                  key={c.code}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/5 px-3 py-2"
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

          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
            <Database className="h-4 w-4 text-primary shrink-0" />
            Production data is fully isolated and safe during this reset.
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
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
