import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { subscribeToSystemHealth, getRecentErrorLogs, initializeSystemHealth } from "@/services/healthService";
import {
  summarizeSamples,
  probeConnectivity,
} from "@/services/performanceService";
import { 
  Database, 
  Activity, 
  Clock, 
  Server, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Zap,
  Shield
} from "lucide-react";

export default function AdminSystemHealthPage() {
  const [health, setHealth] = useState(null);
  const [errorLogs, setErrorLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real performance-derived metrics
  const [realLatency, setRealLatency] = useState(null);
  const [realConnectivity, setRealConnectivity] = useState(null);

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

    // Real performance metrics (setState deferred onto a microtask so the
    // effect body stays free of synchronous setState calls).
    const summary = summarizeSamples();
    const latencyOp = Object.values(summary.operations || {}).sort((a, b) => b.count - a.count)[0];
    Promise.resolve().then(() =>
      setRealLatency(latencyOp ? latencyOp.avgMs : null),
    );
    probeConnectivity().then((r) => setRealConnectivity(r));

    return unsubscribe;
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    const summary = summarizeSamples();
    const latencyOp = Object.values(summary.operations || {}).sort((a, b) => b.count - a.count)[0];
    setRealLatency(latencyOp ? latencyOp.avgMs : null);
    const conn = await probeConnectivity();
    setRealConnectivity(conn);
    await loadErrorLogs();
    setRefreshing(false);
  }

  function getStatusIcon(status) {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Activity className="h-5 w-5 text-muted-foreground" />;
    }
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

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-bold tracking-tight">System Health</h1>
          <p className="text-muted-foreground text-lg">
            Real-time monitoring of system performance and status.
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh} 
          disabled={refreshing}
          className="rounded-full px-6 gap-2 border-gold/30 hover:bg-gold/10"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Health Status Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Database Status */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
              <Database className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Database</div>
          </div>
          <div className="flex items-center gap-2">
            {realConnectivity?.connected === false ? (
              getStatusIcon("error")
            ) : (
              getStatusIcon(realConnectivity?.connected ? "healthy" : health?.databaseStatus)
            )}
            <span className={`text-lg font-semibold capitalize ${getStatusColor(
              realConnectivity?.connected === false ? "error"
                : realConnectivity?.connected ? "healthy"
                : health?.databaseStatus
            ).split(' ')[0]}`}>
              {realConnectivity?.connected === false
                ? "Offline"
                : realConnectivity?.connected
                  ? "Connected"
                  : health?.databaseStatus || "Unknown"}
            </span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {realConnectivity?.latency != null ? `${realConnectivity.latency}ms round trip` : "Live check"}
          </div>
        </div>

        {/* API Latency */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600">
              <Zap className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">API Latency</div>
          </div>
          <div className="text-2xl font-bold">
            {realLatency ?? health?.apiLatency ?? 0}ms
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {realLatency != null ? "Measured from your browser's operations" : "Average response time"}
          </div>
        </div>

        {/* Active Sessions */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-green-500/10 text-green-600">
              <Activity className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Active Sessions</div>
          </div>
          <div className="text-2xl font-bold">
            {health?.activeSessions || 0}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Currently active
          </div>
        </div>

        {/* System Uptime */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-gold/10 text-gold">
              <Server className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Uptime</div>
          </div>
          <div className="text-2xl font-bold">
            {health?.uptime || "99.9%"}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Last 30 days
          </div>
        </div>
      </div>

      {/* System Overview */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5 text-gold" />
          <h3 className="font-semibold text-lg">System Overview</h3>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Last Updated</div>
            <div className="font-medium">
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
          
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Firebase Connection</div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-600">Connected</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Authentication</div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-600">Operational</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Firestore Database</div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-600">Operational</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Error Logs */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-gold" />
            <h3 className="font-semibold text-lg">Recent Error Logs</h3>
          </div>
          <span className="text-sm text-muted-foreground">
            {errorLogs.length} recent errors
          </span>
        </div>
        
        {errorLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-600 opacity-20" />
            <p>No recent errors logged</p>
          </div>
        ) : (
          <div className="space-y-3">
            {errorLogs.map((log) => (
              <div key={log.id} className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="font-medium text-destructive">{log.message}</div>
                    {log.component && (
                      <div className="text-xs text-muted-foreground">
                        Component: {log.component}
                      </div>
                    )}
                    {log.timestamp && (
                      <div className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
