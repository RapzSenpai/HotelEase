import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  getMaintenanceStatus,
  setMaintenanceStatus,
} from "@/services/maintenanceService";
import { auditAction, AUDIT_ACTIONS } from "@/services/auditService";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle,
  Clock,
  CalendarDays,
} from "lucide-react";

export default function AdminSystemSettingsPage() {
  // Session sandbox flag — Maintenance Mode has no training variant (it is
  // global by design), so it must be locked while a training session is active.
  const { trainingMode: sessionTrainingMode } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-semibold tracking-tight">
            System Settings
          </h1>
          <p className="text-foreground/60">
            Manage global system behaviour and maintenance mode.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* ── Maintenance Mode ── */}
      <Card className={`overflow-hidden ${maintenanceEnabled ? "border-destructive/40 bg-destructive/5" : ""}`}>
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2">
                <div
                  className={`p-1 rounded-md ${
                    maintenanceEnabled
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                Maintenance Mode
              </CardTitle>
              <CardDescription>
                When enabled, all non-admin users see a maintenance message and
                cannot access the system. Admin users are always allowed through.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 shrink-0">
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
              <Switch
                checked={maintenanceEnabled}
                onCheckedChange={() => onToggleMaintenance()}
                disabled={loading || maintenanceSaving || sessionTrainingMode}
                aria-label="Toggle maintenance mode"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {sessionTrainingMode && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground/80">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
              <p>
                Maintenance Mode is <span className="font-semibold">global</span> and affects the
                production site even while training mode is active — it cannot be changed during a
                training session. Exit training mode to manage it.
              </p>
            </div>
          )}
          {maintenanceEnabled && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
              <Clock className="h-3.5 w-3.5" />
              Site is currently in maintenance mode
            </span>
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="maintenanceMessage">Maintenance Message</Label>
              <Textarea
                id="maintenanceMessage"
                placeholder="Enter the message users will see during maintenance..."
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                rows={2}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Shown to all non-admin visitors while maintenance is active.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="maintenanceStartTime">Start Time (Optional)</Label>
                <div className="relative">
                  <Input
                    id="maintenanceStartTime"
                    type="datetime-local"
                    value={maintenanceStartTime}
                    onChange={(e) => setMaintenanceStartTime(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onFocus={(e) => e.target.blur()}
                    className="h-10 pr-10 border-border text-sm rounded-lg [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer"
                  />
                  <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maintenanceEndTime">End Time (Optional)</Label>
                <div className="relative">
                  <Input
                    id="maintenanceEndTime"
                    type="datetime-local"
                    value={maintenanceEndTime}
                    onChange={(e) => setMaintenanceEndTime(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onFocus={(e) => e.target.blur()}
                    className="h-10 pr-10 border-border text-sm rounded-lg [&::-webkit-calendar-picker-indicator]:hidden cursor-pointer"
                  />
                  <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={onSaveMaintenance}
                disabled={loading || maintenanceSaving || sessionTrainingMode}
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
