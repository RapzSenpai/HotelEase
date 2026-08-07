import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { subscribeToAuditLogs, downloadAuditLogsCSV, AUDIT_ACTIONS } from "@/services/auditService";
import { Search, Download, Filter, Shield, Clock, User, FileText, RefreshCw, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "radix-ui";
import { toast } from "sonner";

const ACTION_TYPE_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: AUDIT_ACTIONS.USER_ROLE_CHANGE, label: "User Role Change" },
  { value: AUDIT_ACTIONS.USER_DELETE, label: "User Delete" },
  { value: AUDIT_ACTIONS.USER_FORCE_LOGOUT, label: "User Force Logout" },
  { value: AUDIT_ACTIONS.ROOM_UPDATE, label: "Room Update" },
  { value: AUDIT_ACTIONS.ROOM_STATUS_CHANGE, label: "Room Status Change" },
  { value: AUDIT_ACTIONS.BOOKING_CREATE, label: "Booking Create" },
  { value: AUDIT_ACTIONS.BOOKING_CANCEL, label: "Booking Cancel" },
  { value: AUDIT_ACTIONS.BOOKING_UPDATE, label: "Booking Update" },
  { value: AUDIT_ACTIONS.PAYMENT_PROCESS, label: "Payment Process" },
  { value: AUDIT_ACTIONS.PAYMENT_REFUND, label: "Payment Refund" },
  { value: AUDIT_ACTIONS.MAINTENANCE_MODE_TOGGLE, label: "Maintenance Mode Toggle" },
  { value: AUDIT_ACTIONS.TRAINING_MODE_TOGGLE, label: "Training Mode Toggle" },
  { value: AUDIT_ACTIONS.ANNOUNCEMENT_CREATE, label: "Announcement Create" },
  { value: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATE, label: "Announcement Update" },
  { value: AUDIT_ACTIONS.ANNOUNCEMENT_DELETE, label: "Announcement Delete" },
  { value: AUDIT_ACTIONS.SYSTEM_SETTINGS_CHANGE, label: "System Settings Change" },
];

const TARGET_TYPE_OPTIONS = [
  { value: "all", label: "All Targets" },
  { value: "user", label: "User" },
  { value: "room", label: "Room" },
  { value: "booking", label: "Booking" },
  { value: "payment", label: "Payment" },
  { value: "announcement", label: "Announcement" },
  { value: "system", label: "System" },
];

function toDate(value) {
  if (!value) return null;
  return typeof value?.toDate === "function" ? value.toDate() : new Date(value);
}

function formatTimestamp(timestamp) {
  const date = toDate(timestamp);
  if (!date || isNaN(date)) return "Invalid date";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionColor(actionType) {
  const colors = {
    [AUDIT_ACTIONS.USER_ROLE_CHANGE]: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    [AUDIT_ACTIONS.USER_DELETE]: "bg-red-500/10 text-red-600 border-red-500/20",
    [AUDIT_ACTIONS.USER_FORCE_LOGOUT]: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    [AUDIT_ACTIONS.ROOM_UPDATE]: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    [AUDIT_ACTIONS.ROOM_STATUS_CHANGE]: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    [AUDIT_ACTIONS.BOOKING_CREATE]: "bg-green-500/10 text-green-600 border-green-500/20",
    [AUDIT_ACTIONS.BOOKING_CANCEL]: "bg-red-500/10 text-red-600 border-red-500/20",
    [AUDIT_ACTIONS.BOOKING_UPDATE]: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    [AUDIT_ACTIONS.PAYMENT_PROCESS]: "bg-green-500/10 text-green-600 border-green-500/20",
    [AUDIT_ACTIONS.PAYMENT_REFUND]: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    [AUDIT_ACTIONS.MAINTENANCE_MODE_TOGGLE]: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    [AUDIT_ACTIONS.TRAINING_MODE_TOGGLE]: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    [AUDIT_ACTIONS.ANNOUNCEMENT_CREATE]: "bg-green-500/10 text-green-600 border-green-500/20",
    [AUDIT_ACTIONS.ANNOUNCEMENT_UPDATE]: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    [AUDIT_ACTIONS.ANNOUNCEMENT_DELETE]: "bg-red-500/10 text-red-600 border-red-500/20",
    [AUDIT_ACTIONS.SYSTEM_SETTINGS_CHANGE]: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  };
  return colors[actionType] || "bg-gray-500/10 text-gray-600 border-gray-500/20";
}

export default function AdminAuditLogsPage() {
  const { trainingMode } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [actionTypeFilter, setActionTypeFilter] = useState("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(100);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingLog, setViewingLog] = useState(null);

  // Reset fetch/loading state when the query signature changes. Done during
  // render (not synchronously inside the effect) to keep effects side-effect free.
  const filterKey = `${actionTypeFilter}|${targetTypeFilter}|${limit}|${trainingMode}|${refreshKey}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    const unsub = subscribeToAuditLogs(
      {
        actionType: actionTypeFilter === "all" ? undefined : actionTypeFilter,
        targetType: targetTypeFilter === "all" ? undefined : targetTypeFilter,
        limit,
      },
      {
        trainingMode,
        onData: (data) => {
          setLogs(data);
          setLoading(false);
        },
        onError: (e) => {
          setError(e?.message || "Failed to load audit logs");
          toast.error("Failed to load audit logs");
          setLoading(false);
        },
      }
    );

    return () => unsub();
  }, [actionTypeFilter, targetTypeFilter, limit, trainingMode, refreshKey]);

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs;
    
    const search = searchQuery.toLowerCase();
    return logs.filter(
      (log) =>
        log.userEmail?.toLowerCase().includes(search) ||
        log.userRole?.toLowerCase().includes(search) ||
        log.targetId?.toLowerCase().includes(search) ||
        log.description?.toLowerCase().includes(search)
    );
  }, [logs, searchQuery]);

  function handleExport() {
    try {
      downloadAuditLogsCSV(filteredLogs, `audit-logs-${new Date().toISOString().split("T")[0]}.csv`);
      toast.success("Audit logs exported successfully");
    } catch {
      toast.error("Failed to export audit logs");
    }
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleCopyChanges() {
    if (!viewingLog) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(viewingLog.changes, null, 2));
      toast.success("Changes copied to clipboard");
    } catch {
      toast.error("Failed to copy changes");
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground text-lg">
            Track all admin actions and system events for security and compliance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh} disabled={loading} className="gap-2">
            <Clock className="w-4 h-4" />
            Refresh
          </Button>
          <Button variant="default" onClick={handleExport} disabled={filteredLogs.length === 0} className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-4">
            {/* Search */}
            <div className="relative group flex-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Search Logs</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  type="text"
                  placeholder="Search by email, role, target ID, or description..."
                  className="pl-10 h-10 border-border focus:ring-primary/40"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Action Type Filter */}
            <div className="w-full lg:w-64 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Action Type</Label>
              <Select.Root value={actionTypeFilter} onValueChange={setActionTypeFilter}>
                <Select.Trigger className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <Select.Value placeholder="All Actions" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                    <Select.Viewport>
                      {ACTION_TYPE_OPTIONS.map((opt) => (
                        <Select.Item
                          key={opt.value}
                          value={opt.value}
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                        >
                          <Select.ItemText>{opt.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            {/* Target Type Filter */}
            <div className="w-full lg:w-48 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Target Type</Label>
              <Select.Root value={targetTypeFilter} onValueChange={setTargetTypeFilter}>
                <Select.Trigger className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <Select.Value placeholder="All Targets" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                    <Select.Viewport>
                      {TARGET_TYPE_OPTIONS.map((opt) => (
                        <Select.Item
                          key={opt.value}
                          value={opt.value}
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                        >
                          <Select.ItemText>{opt.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            {/* Limit */}
            <div className="w-full lg:w-32 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Limit</Label>
              <Select.Root value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <Select.Trigger className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <Select.Value />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                    <Select.Viewport>
                      {[50, 100, 200, 500].map((val) => (
                        <Select.Item
                          key={val}
                          value={String(val)}
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                        >
                          <Select.ItemText>{val}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
          <Shield className="w-5 h-5" />
          {error}
        </div>
      ) : null}

      {/* Loading State */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-border bg-background animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Results Count */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium text-muted-foreground">
              Showing <span className="font-bold text-foreground">{filteredLogs.length}</span> of <span className="font-bold text-foreground">{logs.length}</span> audit logs
            </p>
          </div>

          {/* Logs List */}
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed border-border text-center space-y-3">
              <FileText className="w-12 h-12 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground">No audit logs found matching your criteria.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => {
                const hasChanges =
                  log.changes && Object.keys(log.changes).length > 0;
                return (
                  <div
                    key={log.id}
                    className="rounded-lg border border-border bg-card px-3.5 py-2.5 transition-colors hover:border-border/80 hover:bg-muted/5"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] px-2 py-0.5 ${getActionColor(log.actionType)}`}
                      >
                        {log.actionType}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
                        {log.description}
                      </span>
                      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-3 w-3" />
                        <span className="font-medium text-foreground/75">
                          {log.userEmail || "Unknown user"}
                        </span>
                      </span>
                      {log.userRole && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0.5 font-medium uppercase tracking-wider"
                        >
                          {log.userRole}
                        </Badge>
                      )}
                      {log.targetId && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1.5">
                            <FileText className="h-3 w-3" />
                            <span className="capitalize font-medium text-foreground/75">
                              {log.targetType}
                            </span>
                            <code className="rounded bg-muted/10 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {log.targetId}
                            </code>
                          </span>
                        </>
                      )}
                      {hasChanges && (
                        <button
                          type="button"
                          onClick={() => setViewingLog(log)}
                          className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
                        >
                          View Changes
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Changes Dialog */}
      <Dialog
        open={viewingLog !== null}
        onOpenChange={(open) => {
          if (!open) setViewingLog(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              Event Changes
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
              <Badge
                variant="outline"
                className={`font-mono text-[10px] px-2 py-0.5 ${viewingLog ? getActionColor(viewingLog.actionType) : ""}`}
              >
                {viewingLog?.actionType}
              </Badge>
              <span className="text-xs text-foreground/75">{viewingLog?.description}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Raw before/after values
            </span>
            <Button variant="outline" size="xs" onClick={handleCopyChanges} className="gap-1">
              <Copy className="h-3 w-3" />
              Copy
            </Button>
          </div>
          <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-muted/10 p-3.5 text-[11px] font-mono leading-relaxed text-foreground/80">
            {viewingLog ? JSON.stringify(viewingLog.changes, null, 2) : ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
