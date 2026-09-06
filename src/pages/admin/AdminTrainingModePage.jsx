import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  generateTrainingSessionCode,
  getTrainingSystemState,
  setTrainingModeEnabled,
  resetTrainingData,
} from "@/services/trainingService";
import { seedTrainingData } from "@/services/seedService";
import { listRooms } from "@/services/roomsService";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  GraduationCap,
  KeyRound,
  Loader2,
  Power,
  Sparkles,
  Trash2,
} from "lucide-react";

const STEPS = [
  { n: 1, label: "Enable Training Mode" },
  { n: 2, label: "Generate a session code" },
  { n: 3, label: "Seed demo data" },
  { n: 4, label: "Share the code with your class" },
];

const COLLECTIONS_TO_CLEAR = [
  { label: "Bookings", code: "training_bookings" },
  { label: "Guest Accounts", code: "training_guests" },
  { label: "Room Inventory", code: "training_rooms" },
  { label: "Payment Records", code: "training_payments" },
  { label: "Housekeeping Logs", code: "training_housekeeping_logs" },
];

const SEED_ITEMS = [
  { label: "Room Inventory", code: "training_rooms" },
  { label: "Guest Accounts", code: "training_guests" },
  { label: "Bookings", code: "training_bookings" },
  { label: "Payment Records", code: "training_payments" },
];

export default function AdminTrainingModePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  const [trainingMode, setTrainingMode] = useState(false);
  const [sessionCode, setSessionCode] = useState(null);
  const [sessionExpiryIso, setSessionExpiryIso] = useState(null);
  const [ttlHours, setTtlHours] = useState(24);
  const [sessionBusy, setSessionBusy] = useState(false);

  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sandboxEmpty, setSandboxEmpty] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const sys = await getTrainingSystemState();
        if (!isMounted) return;

        setTrainingMode(Boolean(sys.enabled));
        setSessionCode(sys.sessionCode);
        setSessionExpiryIso(
          sys.sessionExpiryIso?.toString?.() ?? sys.sessionExpiryIso ?? null,
        );

        if (sys.enabled) {
          const rooms = await listRooms({ trainingMode: true }).catch(() => []);
          if (!isMounted) return;
          setSandboxEmpty(rooms.length === 0);
        } else {
          setSandboxEmpty(false);
        }
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load training state.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  async function onToggle() {
    setError(null);
    try {
      await setTrainingModeEnabled(!trainingMode);
      const sys = await getTrainingSystemState();
      setTrainingMode(Boolean(sys.enabled));
      setSessionCode(sys.sessionCode);
      setSessionExpiryIso(
        sys.sessionExpiryIso?.toString?.() ?? sys.sessionExpiryIso ?? null,
      );
    } catch (e) {
      setError(e?.message || "Failed to toggle training mode.");
    }
  }

  async function onGenerateSessionCode() {
    setError(null);
    setSessionBusy(true);
    try {
      const res = await generateTrainingSessionCode({ ttlHours });
      setSessionCode(res.sessionCode);
      setSessionExpiryIso(res.expiryIso);
    } catch (e) {
      setError(e?.message || "Failed to generate session code.");
    } finally {
      setSessionBusy(false);
    }
  }

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
      setSandboxEmpty(false);
    } catch (e) {
      setError(e?.message || "Failed to seed demo data.");
    } finally {
      setSeeding(false);
    }
  }

  async function onReset() {
    if (
      !window.confirm(
        "This will permanently delete ALL training sandbox data. Production records are unaffected. Continue?",
      )
    ) {
      return;
    }
    setResetting(true);
    setStatus(null);
    setError(null);
    try {
      const res = await resetTrainingData();
      setStatus(
        res?.ok
          ? "Training data reset requested successfully."
          : "Reset completed.",
      );
      setSandboxEmpty(true);
    } catch (e) {
      setError(e?.message || "Failed to reset training data.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-semibold tracking-tight">
            Training Mode
          </h1>
          <p className="text-foreground/60">
            Run the sandbox end to end — enable it, generate a code, seed demo
            data. Production records are never affected.
          </p>
        </div>
      </div>

      {/* Workflow strip */}
      <div className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((step) => {
          const done =
            (step.n === 1 && trainingMode) ||
            (step.n === 2 && Boolean(sessionCode)) ||
            (step.n === 3 && !sandboxEmpty && trainingMode);
          return (
            <div
              key={step.n}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                done
                  ? "border-success/30 bg-success/5"
                  : "border-border bg-background"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-success/15 text-success"
                    : "bg-primary/15 text-primary"
                }`}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.n}
              </span>
              <span className="text-xs font-medium text-foreground/80">
                {step.label}
              </span>
            </div>
          );
        })}
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

      {/* ── Session Control ── */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-primary/10 text-primary">
                <GraduationCap className="h-4 w-4" />
              </div>
              Session Control
            </CardTitle>
            <CardDescription>
              When enabled, booking and guest actions use the{" "}
              <span className="font-mono text-foreground/70">training_*</span>{" "}
              collections. Training data stays isolated from production at all
              times.
            </CardDescription>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold w-fit shrink-0 ${
              trainingMode
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-border bg-muted/10 text-muted-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                trainingMode ? "bg-primary" : "bg-muted-foreground/50"
              }`}
            />
            {trainingMode ? "Active" : "Off"}
          </span>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={trainingMode ? "default" : "outline"}
              onClick={onToggle}
              disabled={loading}
              className="gap-2"
            >
              <Power className="h-4 w-4" />
              {trainingMode ? "Disable Training Mode" : "Enable Training Mode"}
            </Button>
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Session Codes</h4>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Students use a session code to join the training sandbox. Codes
              expire automatically.
            </p>

            <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="ttlHours">Expiry (hours)</Label>
                <Input
                  id="ttlHours"
                  type="number"
                  min={1}
                  value={ttlHours}
                  onChange={(e) => setTtlHours(e.target.value)}
                />
              </div>
              <div className="flex sm:justify-end">
                <Button
                  type="button"
                  onClick={onGenerateSessionCode}
                  disabled={sessionBusy || !trainingMode}
                  className="gap-2"
                >
                  <KeyRound className="h-4 w-4" />
                  {sessionBusy ? "Generating..." : "Generate New Code"}
                </Button>
              </div>
            </div>

            {sessionCode ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active session code
                  </div>
                  <div className="text-xl font-bold tracking-[0.2em] text-primary">
                    {sessionCode}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Expires:{" "}
                    {sessionExpiryIso
                      ? new Date(sessionExpiryIso).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-2.5 py-1 text-xs font-semibold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Live
                </span>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                {trainingMode
                  ? "No active session code yet. Generate one above."
                  : "Enable Training Mode to generate a session code."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Demo Data ── */}
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
          {trainingMode && sandboxEmpty && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-foreground/80">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              The sandbox is currently empty — seed demo data so trainees see a
              populated system.
            </div>
          )}

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
            This operation is idempotent — running it again safely preserves any
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

      {/* ── Reset Sandbox ── */}
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
              disabled={resetting}
              className="gap-2 shrink-0"
            >
              {resetting ? (
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
