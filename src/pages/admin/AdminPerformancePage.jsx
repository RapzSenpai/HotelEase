import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Gauge,
  Zap,
  Timer,
  Database,
  RefreshCw,
  Trash2,
  Loader2,
  FileText,
  AlertTriangle,
} from "lucide-react";
import {
  getBrowserPerformanceSnapshot,
  summarizeSamples,
  computePerformanceScore,
  clearSamples,
  probeConnectivity,
  subscribeToConnectivity,
} from "@/services/performanceService";
import { useAuth } from "@/contexts/AuthContext";

function scoreColor(score) {
  if (score >= 85) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

function scoreRingClass(score) {
  if (score >= 85) return "border-success/40 bg-success/10";
  if (score >= 60) return "border-warning/40 bg-warning/10";
  return "border-destructive/40 bg-destructive/10";
}

function formatMs(ms) {
  return ms == null ? "—" : `${ms}ms`;
}

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

export default function AdminPerformancePage() {
  const { trainingMode } = useAuth();
  const [metrics, setMetrics] = useState(() => getBrowserPerformanceSnapshot());
  const [summary, setSummary] = useState(() => summarizeSamples());
  const [connectivity, setConnectivity] = useState({ connected: null, latency: null });
  const [refreshing, setRefreshing] = useState(false);
  const [probing, setProbing] = useState(false);

  const refreshAll = useCallback(() => {
    setMetrics(getBrowserPerformanceSnapshot());
    setSummary(summarizeSamples());
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    refreshAll();
    const r = await probeConnectivity({ trainingMode });
    setConnectivity(r);
    setRefreshing(false);
  }, [refreshAll, trainingMode]);

  useEffect(() => {
    refreshAll();
    const unsub = subscribeToConnectivity(
      (state) => setConnectivity((prev) => ({ ...prev, connected: state.connected })),
      { trainingMode }
    );
    probeConnectivity({ trainingMode }).then((r) => setConnectivity(r));
    return unsub;
  }, [trainingMode, refreshAll]);

  const score = useMemo(
    () => computePerformanceScore(metrics, summary),
    [metrics, summary]
  );

  const operations = useMemo(
    () =>
      Object.entries(summary.operations || {})
        .map(([name, op]) => ({ name, ...op }))
        .sort((a, b) => b.count - a.count),
    [summary]
  );

  async function handleProbe() {
    setProbing(true);
    try {
      const r = await probeConnectivity({ trainingMode });
      setConnectivity(r);
    } finally {
      setProbing(false);
    }
  }

  function handleClear() {
    clearSamples();
    refreshAll();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <h1 className="font-playfair text-4xl font-semibold tracking-tight">
            Performance
          </h1>
          <p className="text-foreground/60 max-w-lg">
            Real browser metrics, Firestore connectivity, and operation latency.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleProbe} disabled={probing}>
            {probing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Probe Connection
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {trainingMode && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Training mode is active — connectivity checks read from the training sandbox.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {/* Score */}
          <div className="flex items-center gap-3 p-4">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 ${scoreRingClass(score)}`}
            >
              <span className={`text-base font-bold ${scoreColor(score)}`}>{score}</span>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">Performance Score</div>
              <div className="text-sm font-semibold leading-tight">
                {score >= 85 ? "Excellent" : score >= 60 ? "Fair" : "Needs attention"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Timer className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">TTFB</div>
              <div className={`text-lg font-semibold leading-tight ${
                metrics.ttfb < 300 ? "text-success" : metrics.ttfb < 800 ? "text-warning" : "text-destructive"
              }`}>
                {formatMs(metrics.ttfb)}
              </div>
              <div className="truncate text-[11px] text-foreground/50">Time to first byte</div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">Firestore</div>
              <div className={`text-lg font-semibold leading-tight ${
                connectivity.connected ? "text-success" : "text-warning"
              }`}>
                {connectivity.connected ? "Connected" : "Unknown"}
              </div>
              <div className="truncate text-[11px] text-foreground/50">
                {connectivity.latency != null ? `${connectivity.latency}ms round trip` : "Live subscription active"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground/50">Error Rate</div>
              <div className={`text-lg font-semibold leading-tight ${
                summary.errorRate === 0 ? "text-success" : "text-warning"
              }`}>
                {summary.errorRate ? `${summary.errorRate}%` : "0%"}
              </div>
              <div className="truncate text-[11px] text-foreground/50">
                {summary.total} sampled operation(s)
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Browser metrics */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Browser Performance
            </CardTitle>
            <CardDescription>
              Measured in this browser from the Performance API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-[11px] text-foreground/50">Page Load</div>
                <div className="text-base font-semibold">{formatMs(metrics.loadComplete)}</div>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-[11px] text-foreground/50">DOM Ready</div>
                <div className="text-base font-semibold">{formatMs(metrics.domContentLoaded)}</div>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-[11px] text-foreground/50">Largest Content</div>
                <div className="text-base font-semibold">{formatMs(metrics.largestContentfulPaint)}</div>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-[11px] text-foreground/50">Resources</div>
                <div className="text-base font-semibold">
                  {metrics.resourceCount ?? "—"}
                  <span className="ml-1 text-xs font-normal text-foreground/50">
                    {metrics.totalResourceBytes != null ? `· ${metrics.totalResourceBytes}KB` : ""}
                  </span>
                </div>
              </div>
            </div>
            {!metrics.supportsPerfApi && (
              <p className="text-xs text-foreground/50">
                Performance API not available in this browser.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Connectivity */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Firestore Connectivity
            </CardTitle>
            <CardDescription>
              Live subscription status + on-demand round-trip probe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-[11px] text-foreground/50">Status</div>
                <div
                  className={`text-base font-semibold ${
                    connectivity.connected === null
                      ? "text-foreground/60"
                      : connectivity.connected
                        ? "text-success"
                        : "text-destructive"
                  }`}
                >
                  {connectivity.connected === null
                    ? "Checking…"
                    : connectivity.connected
                      ? "Connected"
                      : "Disconnected"}
                </div>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <div className="text-[11px] text-foreground/50">Round Trip</div>
                <div className="text-base font-semibold">
                  {connectivity.latency != null ? `${connectivity.latency}ms` : "—"}
                </div>
              </div>
            </div>
            <p className="text-xs text-foreground/60 leading-relaxed">
              A live listener on <span className="font-mono">system_health/metrics</span> keeps this
              indicator real-time. Click “Probe Connection” for a one-shot round-trip measurement.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Operation latency */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Operation Latency
            </CardTitle>
            <CardDescription>
              Measured Firestore operations recorded in this browser (latest{" "}
              {summary.total} sample(s)).
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4" /> Clear Samples
          </Button>
        </CardHeader>
        <CardContent>
          {operations.length === 0 ? (
            <div className="p-6 text-center text-sm text-foreground/50">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
              No operation samples yet. They are recorded as you use the system.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-foreground/50">
                    <th className="pb-2 pr-4">Operation</th>
                    <th className="pb-2 pr-4">Count</th>
                    <th className="pb-2 pr-4">Avg</th>
                    <th className="pb-2 pr-4">Min</th>
                    <th className="pb-2 pr-4">Max</th>
                    <th className="pb-2">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.map((op) => (
                    <tr key={op.name} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{op.name}</td>
                      <td className="py-2 pr-4">{op.count}</td>
                      <td className="py-2 pr-4 font-medium">{op.avgMs}ms</td>
                      <td className="py-2 pr-4">{op.minMs}ms</td>
                      <td className="py-2 pr-4">{op.maxMs}ms</td>
                      <td className="py-2">
                        {op.errors > 0 ? (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" /> {op.errors}
                          </span>
                        ) : (
                          <span className="text-success">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-foreground/50">
            Last recorded: {formatTime(summary.lastUpdated)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}