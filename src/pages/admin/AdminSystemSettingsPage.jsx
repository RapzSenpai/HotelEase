import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/services/trainingService";
import {
  getMaintenanceStatus,
  setMaintenanceStatus,
} from "@/services/maintenanceService";
import { auditAction, AUDIT_ACTIONS } from "@/services/auditService";
import {
  AlertTriangle,
  Power,
  Clock,
  GraduationCap,
  KeyRound,
} from "lucide-react";

export default function AdminSystemSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [trainingMode, setTrainingMode] = useState(false);
  const [sessionCode, setSessionCode] = useState(null);
  const [sessionExpiryIso, setSessionExpiryIso] = useState(null);

  const [ttlHours, setTtlHours] = useState(24);
  const [sessionBusy, setSessionBusy] = useState(false);

  // Maintenance mode state
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceStartTime, setMaintenanceStartTime] = useState("");
  const [maintenanceEndTime, setMaintenanceEndTime] = useState("");
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        
        // Load training system state
        const sys = await getTrainingSystemState();
        if (!isMounted) return;

        setTrainingMode(Boolean(sys.enabled));
        setSessionCode(sys.sessionCode);
        setSessionExpiryIso(
          sys.sessionExpiryIso?.toString?.() ?? sys.sessionExpiryIso ?? null,
        );

        // Load maintenance status
        const maint = await getMaintenanceStatus();
        if (!isMounted) return;

        setMaintenanceEnabled(maint.enabled);
        setMaintenanceMessage(maint.message);
        setMaintenanceStartTime(maint.startTime || "");
        setMaintenanceEndTime(maint.endTime || "");
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load system settings.");
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
      const newVal = !trainingMode;
      const sys = await getTrainingSystemState();
      setTrainingMode(Boolean(sys.enabled));
      setSessionCode(sys.sessionCode);
      setSessionExpiryIso(
        sys.sessionExpiryIso?.toString?.() ?? sys.sessionExpiryIso ?? null,
      );
      auditAction(AUDIT_ACTIONS.TRAINING_MODE_TOGGLE, {
        targetType: "system",
        changes: { enabled: newVal },
        description: `Training mode ${newVal ? "enabled" : "disabled"}`,
      });
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

  async function onToggleMaintenance() {
    setError(null);
    setMaintenanceSaving(true);
    try {
      await setMaintenanceStatus({
        enabled: !maintenanceEnabled,
        message: maintenanceMessage,
        startTime: maintenanceStartTime || null,
        endTime: maintenanceEndTime || null,
      });
      // Reload to confirm the save worked
      const maint = await getMaintenanceStatus();
      setMaintenanceEnabled(maint.enabled);
      setMaintenanceMessage(maint.message);
      setMaintenanceStartTime(maint.startTime || "");
      setMaintenanceEndTime(maint.endTime || "");
      auditAction(AUDIT_ACTIONS.MAINTENANCE_MODE_TOGGLE, {
        targetType: "system",
        changes: { enabled: maint.enabled },
        description: `Maintenance mode ${maint.enabled ? "enabled" : "disabled"}`,
      });
    } catch (e) {
      setError(e?.message || "Failed to update maintenance status.");
      // Revert to actual server state on error
      const maint = await getMaintenanceStatus();
      setMaintenanceEnabled(maint.enabled);
      setMaintenanceMessage(maint.message);
      setMaintenanceStartTime(maint.startTime || "");
      setMaintenanceEndTime(maint.endTime || "");
    } finally {
      setMaintenanceSaving(false);
    }
  }

  async function onSaveMaintenance() {
    setError(null);
    setMaintenanceSaving(true);
    try {
      await setMaintenanceStatus({
        enabled: maintenanceEnabled,
        message: maintenanceMessage,
        startTime: maintenanceStartTime || null,
        endTime: maintenanceEndTime || null,
      });
      // Reload to confirm the save worked
      const maint = await getMaintenanceStatus();
      setMaintenanceEnabled(maint.enabled);
      setMaintenanceMessage(maint.message);
      setMaintenanceStartTime(maint.startTime || "");
      setMaintenanceEndTime(maint.endTime || "");
      auditAction(AUDIT_ACTIONS.MAINTENANCE_MODE_TOGGLE, {
        targetType: "system",
        changes: { enabled: maint.enabled, message: maint.message },
        description: `Maintenance settings saved (${maint.enabled ? "enabled" : "disabled"})`,
      });
    } catch (e) {
      setError(e?.message || "Failed to update maintenance status.");
      // Revert to actual server state on error
      const maint = await getMaintenanceStatus();
      setMaintenanceEnabled(maint.enabled);
      setMaintenanceMessage(maint.message);
      setMaintenanceStartTime(maint.startTime || "");
      setMaintenanceEndTime(maint.endTime || "");
    } finally {
      setMaintenanceSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="font-playfair text-4xl font-bold tracking-tight">
          System Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Manage training mode and maintenance mode for your system.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      ) : null}

      {/* ── Training Mode ── */}
      <Card className="rounded-2xl border-border shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <CardTitle>Training Mode</CardTitle>
                <CardDescription>
                  When enabled, booking and guest actions use the{" "}
                  <span className="font-mono text-foreground/70">training_*</span>{" "}
                  collections.
                </CardDescription>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold w-fit ${
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
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
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
            <span className="text-xs text-muted-foreground">
              Training data stays isolated from production at all times.
            </span>
          </div>

          <div className="border-t border-border pt-5">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Session Codes</h4>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Students use a session code to join the training sandbox. Codes
              expire automatically.
            </p>

            <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-end">
              <div className="space-y-2">
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-5 py-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active session code
                  </div>
                  <div className="text-2xl font-bold tracking-[0.2em] text-primary">
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
              <div className="mt-4 rounded-xl border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
                {trainingMode
                  ? "No active session code yet. Generate one above."
                  : "Enable Training Mode to generate a session code."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Maintenance Mode ── */}
      <Card
        className={`rounded-2xl shadow-sm ${
          maintenanceEnabled
            ? "border-destructive/40 bg-destructive/5"
            : "border-border"
        }`}
      >
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  maintenanceEnabled
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <CardTitle>Maintenance Mode</CardTitle>
                <CardDescription>
                  When enabled, all non-admin users see a maintenance message
                  and cannot access the system. Admin users are always allowed
                  through.
                </CardDescription>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold w-fit ${
                maintenanceEnabled
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-muted/10 text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  maintenanceEnabled
                    ? "bg-destructive"
                    : "bg-muted-foreground/50"
                }`}
              />
              {maintenanceEnabled ? "Active" : "Off"}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={maintenanceEnabled ? "destructive" : "default"}
              onClick={onToggleMaintenance}
              disabled={maintenanceSaving}
              className="gap-2"
            >
              <Power className="h-4 w-4" />
              {maintenanceEnabled
                ? "Turn Off Maintenance"
                : "Turn On Maintenance"}
            </Button>
            {maintenanceEnabled && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                <Clock className="h-3.5 w-3.5" />
                Site is currently in maintenance mode
              </span>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="maintenanceMessage">Maintenance Message</Label>
              <Textarea
                id="maintenanceMessage"
                placeholder="Enter the message users will see during maintenance..."
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Shown to all non-admin visitors while maintenance is active.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="maintenanceStartTime">Start Time (Optional)</Label>
                <Input
                  id="maintenanceStartTime"
                  type="datetime-local"
                  value={maintenanceStartTime}
                  onChange={(e) => setMaintenanceStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenanceEndTime">End Time (Optional)</Label>
                <Input
                  id="maintenanceEndTime"
                  type="datetime-local"
                  value={maintenanceEndTime}
                  onChange={(e) => setMaintenanceEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={onSaveMaintenance}
                disabled={maintenanceSaving}
                className="w-full sm:w-auto"
              >
                {maintenanceSaving ? "Saving..." : "Save Maintenance Settings"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
