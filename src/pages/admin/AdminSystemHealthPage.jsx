import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { subscribeToSystemHealth, getRecentErrorLogs, initializeSystemHealth } from "@/services/healthService";
import {
  summarizeSamples,
  probeConnectivity,
} from "@/services/performanceService";
import { 
  Database, 
  Activity, 
  Server, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  Zap,
  Shield,
  Users
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToUsers } from "@/services/userService";

export default function AdminSystemHealthPage() {
  // System health and error logs are production-only collections (no sandbox
  // variants) — explain instead of showing permission errors to trainees.
  const { trainingMode } = useAuth();
  const [health, setHealth] = useState(null);
  const [errorLogs, setErrorLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real performance-derived metrics
  const [realLatency, setRealLatency] = useState(null);
  const [realConnectivity, setRealConnectivity] = useState(null);

  // Live user presence — both derived from one subscribeToUsers stream
  const [onlineNow, setOnlineNow] = useState(null);      // isOnline: true
  const [activeToday, setActiveToday] = useState(null);  // lastLoginAt within 24h

  async function loadErrorLogs() {
    try {
      const logs = await getRecentErrorLogs(10);
      setErrorLogs(logs);
    } catch (error) {
      console.error("Failed to load error logs:", error);
    }
  }

  useEffect(() => {
    // Initialize system health document if it doesn't exist
    initializeSystemHealth();

    // Subscribe to real-time health metrics
    const unsubscribe = subscribeToSystemHealth((data) => {
      setHealth(data);
      setLoading(false);
    });

    // Load error logs (via promise chain so no synchronous setState in the effect)
    getRecentErrorLogs(10)
      .then((logs) => setErrorLogs(logs))
      .catch((error) => console.error("Failed to load error logs:", error));

    // Live user presence — single subscription powers both metrics
    const unsubUsers = subscribeToUsers({
      trainingMode: false, // always production users for health page
      onData: (users) => {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        setOnlineNow(users.filter((u) => u.isOnline === true).length);
        setActiveToday(
          users.filter((u) => {
            const ts = u.lastLoginAt;
            if (!ts) return false;
            const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
            return d.getTime() >= oneDayAgo;
          }).length
        );
      },
      onError: () => {
        setOnlineNow(null);
        setActiveToday(null);
      },
    });

    // Real performance metrics (setState deferred onto a microtask so the
    // effect body stays free of synchronous setState calls).
    const summary = summarizeSamples();
    const latencyOp = Object.values(summary.operations || {}).sort((a, b) => b.count - a.count)[0];
    Promise.resolve().then(() =>
      setRealLatency(latencyOp ? latencyOp.avgMs : null),
    );
    probeConnectivity().then((r) => setRealConnectivity(r));

    return () => {
      unsubscribe();
      unsubUsers();
    };
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    const summary = summarizeSamples();
    const latencyOp = Object.values(summary.operations || {}).sort((a, b) => b.count - a.count)[0];
    setRealLatency(latencyOp ? latencyOp.avgMs : null);
    const conn = await probeConnectivity();
    setRealConnectivity(conn);
    await loadErrorLogs();
    // User presence is kept live by subscribeToUsers — no manual refresh needed
    setRefreshing(false);
  }

  function getStatusColor(status) {
    switch (status) {
      case "healthy":
        return "text-green-600 bg-green-500/10 border-green-500/20";
      case "warning":
        return "text-yellow-600 bg-yellow-500/10 border-yellow-500/20";
      case "error":
        return "text-destructive bg-destructive/10 border-destructive/20";
      default:
        return "text-muted-foreground bg-muted/10 border-border";
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-bold tracking-tight">System Health</h1>
          <p className="text-muted-foreground text-lg">
            Real-time monitoring of system performance and status.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl border border-border bg-background animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (trainingMode) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-bold tracking-tight">System Health</h1>
          <p className="text-muted-foreground text-lg">
            Real-time monitoring of system performance and status.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-foreground/80">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
          <p>
            System health diagnostics and error logs are production-only and are not
            available in training mode. Exit training mode to view live system data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-bold tracking-tight">System Health</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of system performance and status.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {/* Database Status */}
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">Database</div>
              <div className={`text-lg font-semibold leading-tight capitalize ${getStatusColor(
                realConnectivity?.connected === false ? "error"
                  : realConnectivity?.connected ? "healthy"
                  : health?.databaseStatus || "default"
              ).split(' ')[0]}`}>
                {realConnectivity?.connected === false
                  ? "Offline"
                  : realConnectivity?.connected
                    ? "Connected"
                    : health?.databaseStatus || "Unknown"}
              </div>
              <div className="truncate text-[11px] text-foreground/50">
                {realConnectivity?.latency != null ? `${realConnectivity.latency}ms round trip` : "Live check"}
              </div>
            </div>
          </div>

          {/* API Latency */}
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">API Latency</div>
              <div className="text-lg font-semibold leading-tight">
                {realLatency != null || health?.apiLatency != null
                  ? `${realLatency ?? health?.apiLatency}ms`
                  : "—"}
              </div>
              <div className="truncate text-[11px] text-foreground/50">
                {realLatency != null ? "From your browser's operations" : "Not measured yet"}
              </div>
            </div>
          </div>

          {/* Online Now — live isOnline: true count */}
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">Online Now</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold leading-tight">
                  {onlineNow != null ? onlineNow : "—"}
                </span>
                {onlineNow != null && onlineNow > 0 && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                )}
              </div>
              <div className="truncate text-[11px] text-foreground/50">Users active right now</div>
            </div>
          </div>

          {/* Active Today — lastLoginAt within 24h */}
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">Active Today</div>
              <div className="text-lg font-semibold leading-tight">
                {activeToday != null ? activeToday : "—"}
              </div>
              <div className="truncate text-[11px] text-foreground/50">Logged in (last 24h)</div>
            </div>
          </div>
        </div>
      </Card>

      {/* System Overview */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            System Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-foreground/50">Last Updated</div>
            <div className="mt-0.5 text-sm font-medium">
              {health?.lastUpdated
                ? new Date(health.lastUpdated).toLocaleString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : "Never"}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-foreground/50">Firebase Connection</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-green-600">
              <CheckCircle className="h-4 w-4" /> Connected
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-foreground/50">Authentication</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-green-600">
              <CheckCircle className="h-4 w-4" /> Operational
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] text-foreground/50">Firestore Database</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-green-600">
              <CheckCircle className="h-4 w-4" /> Operational
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Error Logs */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Recent Error Logs
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {errorLogs.length} recent error(s)
          </span>
        </CardHeader>
        <CardContent>
          {errorLogs.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600 opacity-20" />
              No recent errors logged
            </div>
          ) : (
            <div className="space-y-2.5">
              {errorLogs.map((log) => (
                <div key={log.id} className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-0.5">
                      <div className="text-sm font-medium text-destructive">{log.message}</div>
                      {(log.component || log.timestamp) && (
                        <div className="text-xs text-muted-foreground">
                          {log.component ? `Component: ${log.component}` : ""}
                          {log.component && log.timestamp ? " · " : ""}
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : ""}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
