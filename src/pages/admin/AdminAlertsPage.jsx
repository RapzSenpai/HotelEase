import { useEffect, useMemo, useState } from "react";
import { Select } from "radix-ui";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
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
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Loader2,
  RefreshCw,
  Bell,
  Plus,
  ChevronDown,
} from "lucide-react";
import {
  subscribeToAlerts,
  resolveAlert,
  deleteAlert,
  createAlert,
  scanAndCreateAlerts,
  SEVERITIES,
} from "@/services/alertService";
import { auditAction, AUDIT_ACTIONS } from "@/services/auditService";

const SEVERITY_STYLES = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-warning/10 text-warning border-warning/20",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-muted/50 text-foreground/60 border-border",
};

const SEVERITY_ICONS = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: Bell,
  low: Bell,
};

function formatWhen(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleString();
}

export default function AdminAlertsPage() {
  const { trainingMode } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  // Manual alert form
  const [formOpen, setFormOpen] = useState(false);
  const [formSeverity, setFormSeverity] = useState("medium");
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAlerts(
      (data) => {
        setAlerts(data);
        setLoading(false);
      },
      { trainingMode }
    );
    return () => unsub();
  }, [trainingMode]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      return true;
    });
  }, [alerts, statusFilter, severityFilter]);

  const unresolvedCount = alerts.filter((a) => a.status === "unresolved").length;
  const criticalCount = alerts.filter(
    (a) => a.severity === "critical" && a.status === "unresolved"
  ).length;

  async function onResolve(id) {
    try {
      await resolveAlert(id, { trainingMode });
      toast.success("Alert resolved");
    } catch (e) {
      toast.error(e?.message || "Failed to resolve alert");
    }
  }

  async function onDelete(id) {
    try {
      await deleteAlert(id, { trainingMode });
      toast.success("Alert deleted");
    } catch (e) {
      toast.error(e?.message || "Failed to delete alert");
    }
  }

  async function onScan() {
    setScanning(true);
    try {
      const res = await scanAndCreateAlerts({ trainingMode });
      toast.success(res.created ? `${res.created} new alert(s) created` : "No new issues found");
    } catch (e) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function onCreateManual() {
    if (!formTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setFormBusy(true);
    try {
      await createAlert({
        type: "manual",
        severity: formSeverity,
        title: formTitle.trim(),
        message: formMessage.trim(),
        trainingMode,
      });
      auditAction(AUDIT_ACTIONS.SYSTEM_SETTINGS_CHANGE, {
        targetType: "system",
        changes: { severity: formSeverity, title: formTitle.trim() },
        description: `Manual system alert raised: ${formTitle.trim()}`,
        trainingMode,
      });
      toast.success("Alert raised");
      setFormTitle("");
      setFormMessage("");
      setFormOpen(false);
    } catch (e) {
      toast.error(e?.message || "Failed to raise alert");
    } finally {
      setFormBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-playfair text-4xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-foreground/60 max-w-lg">
          System alerts for operational issues, errors, and manual notifications.
        </p>
      </div>

      {trainingMode && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Training mode is active — alerts write to the training sandbox.
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-foreground/60">Unresolved</div>
            <div className="mt-1 text-3xl font-semibold">{unresolvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-foreground/60">Critical</div>
            <div className="mt-1 text-3xl font-semibold text-destructive">{criticalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-foreground/60">Total</div>
            <div className="mt-1 text-3xl font-semibold">{alerts.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Alert List</CardTitle>
            <CardDescription>
              Real-time view. New alerts appear as they are raised.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onScan} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Scan for Issues
            </Button>
            <Button size="sm" onClick={() => setFormOpen((v) => !v)}>
              <Plus className="h-4 w-4" /> Raise Alert
            </Button>
          </div>
        </CardHeader>

        {formOpen && (
          <CardContent className="border-b border-border pb-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select.Root value={formSeverity} onValueChange={setFormSeverity}>
                  <Select.Trigger className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors">
                    <Select.Value />
                    <ChevronDown className="h-4 w-4 opacity-50 ml-1.5 shrink-0 text-muted-foreground" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                      <Select.Viewport>
                        {SEVERITIES.map((s) => (
                          <Select.Item key={s} value={s} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                            <Select.ItemText>{s}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alertTitle">Title</Label>
                <Input
                  id="alertTitle"
                  placeholder="e.g. Payment gateway unreachable"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alertMessage">Message (Optional)</Label>
                <Textarea
                  id="alertMessage"
                  rows={3}
                  placeholder="Additional details…"
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                />
              </div>
              <Button onClick={onCreateManual} disabled={formBusy}>
                {formBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                Raise Alert
              </Button>
            </div>
          </CardContent>
        )}

        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <Select.Root value={statusFilter} onValueChange={setStatusFilter}>
              <Select.Trigger className="flex h-9 w-44 items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors">
                <Select.Value />
                <ChevronDown className="h-4 w-4 opacity-50 ml-1.5 shrink-0 text-muted-foreground" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                  <Select.Viewport>
                    <Select.Item value="all" className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                      <Select.ItemText>All Statuses</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="unresolved" className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                      <Select.ItemText>Unresolved</Select.ItemText>
                    </Select.Item>
                    <Select.Item value="resolved" className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                      <Select.ItemText>Resolved</Select.ItemText>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>

            <Select.Root value={severityFilter} onValueChange={setSeverityFilter}>
              <Select.Trigger className="flex h-9 w-44 items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors">
                <Select.Value />
                <ChevronDown className="h-4 w-4 opacity-50 ml-1.5 shrink-0 text-muted-foreground" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                  <Select.Viewport>
                    <Select.Item value="all" className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                      <Select.ItemText>All Severities</Select.ItemText>
                    </Select.Item>
                    {SEVERITIES.map((s) => (
                      <Select.Item key={s} value={s} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                        <Select.ItemText>{s}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-foreground/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-foreground/50">
              No alerts{statusFilter !== "all" || severityFilter !== "all" ? " match the filters" : " yet"}.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((a) => {
                const SeverityIcon = SEVERITY_ICONS[a.severity] || Bell;
                const resolved = a.status === "resolved";
                return (
                  <div
                    key={a.id}
                    className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between ${
                      resolved ? "border-border bg-muted/30 opacity-70" : "border-border bg-background"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <SeverityIcon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          a.severity === "critical"
                            ? "text-destructive"
                            : a.severity === "high"
                              ? "text-warning"
                              : "text-primary"
                        }`}
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{a.title}</span>
                          <Badge className={`border capitalize ${SEVERITY_STYLES[a.severity] || ""}`}>
                            {a.severity}
                          </Badge>
                          <Badge
                            variant={resolved ? "secondary" : "default"}
                            className="capitalize"
                          >
                            {a.status}
                          </Badge>
                        </div>
                        {a.message ? (
                          <p className="text-sm text-foreground/70">{a.message}</p>
                        ) : null}
                        <p className="text-xs text-foreground/40">
                          {formatWhen(a.createdAt)}
                          {resolved && a.resolvedAt
                            ? ` · resolved ${formatWhen(a.resolvedAt)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {!resolved && (
                        <Button variant="outline" size="sm" onClick={() => onResolve(a.id)}>
                          <CheckCircle2 className="h-4 w-4" /> Resolve
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => onDelete(a.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}