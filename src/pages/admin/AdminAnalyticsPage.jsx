import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { getAdminAnalyticsSummary } from "@/services/analyticsService";
import { subscribeToActiveUsersByRole } from "@/services/activityService";
import { useAuth } from "@/contexts/AuthContext";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { TrendingUp, Users, DollarSign, Calendar, PieChart as PieIcon, BarChart3, RefreshCw, Activity } from "lucide-react";

function formatCurrencyPHP(amount) {
  const n = Number(amount ?? 0);
  return `PHP ${n.toLocaleString()}`;
}

const COLORS = ["#D4AF37", "#1A1A1A", "#4A4A4A", "#8E8E8E"];

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [activeUsers, setActiveUsers] = useState({ total: 0, guest: 0, fo: 0, admin: 0 });
  const { trainingMode } = useAuth();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminAnalyticsSummary({ trainingMode });
      setSummary(data);
    } catch (e) {
      setError(e?.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [trainingMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeToActiveUsersByRole({ trainingMode }, (breakdown) => {
      setActiveUsers(breakdown);
    });
    return unsubscribe;
  }, [trainingMode]);

  const occupancyData = summary ? [
    { name: "Occupied", value: summary.occupancyNights },
    { name: "Available", value: summary.totalAvailableNights - summary.occupancyNights }
  ] : [];

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-semibold tracking-tight">System Analytics</h1>
          <p className="text-foreground/60">
            Comprehensive overview of hotel performance and booking trends.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? "Refreshing..." : "Sync Data"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <TrendingUp className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading || !summary ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-border bg-background animate-pulse" />
          ))}
          <div className="md:col-span-2 h-72 rounded-xl border border-border bg-background animate-pulse" />
          <div className="h-72 rounded-xl border border-border bg-background animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top Stats */}
          <Card className="overflow-hidden">
            <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
              <div className="flex items-center gap-3 px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PieIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-foreground/50">Occupancy Rate</div>
                  <div className="text-xl font-semibold leading-tight tracking-tight">
                    {(summary.occupancyRate * 100).toFixed(1)}%
                  </div>
                  <div className="truncate text-[11px] text-foreground/50">
                    {summary.occupancyNights} nights occupied
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-foreground/50">Active Users</div>
                  <div className="text-xl font-semibold leading-tight text-emerald-600">
                    {activeUsers.total}
                  </div>
                  <div className="truncate text-[11px] text-foreground/50">
                    {activeUsers.guest} guests · {activeUsers.fo} FO · {activeUsers.admin} admin
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-foreground/50">Total Revenue</div>
                  <div className="text-xl font-semibold leading-tight tracking-tight truncate">
                    {formatCurrencyPHP(summary.totalRevenue)}
                  </div>
                  <div className="truncate text-[11px] text-foreground/50">Last 30 days (est.)</div>
                </div>
              </div>

              <div className="flex items-center gap-3 px-4 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Activity className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-foreground/50">Active Units</div>
                  <div className="text-xl font-semibold leading-tight tracking-tight">
                    {summary.roomCount}
                  </div>
                  <div className="truncate text-[11px] text-foreground/50">Available units in system</div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Trend Chart */}
            <Card className="lg:col-span-2 h-full">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-primary/10 text-primary">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  Booking Volume (7 Days)
                </CardTitle>
                <span className="text-xs text-muted-foreground bg-muted/10 px-2.5 py-1 rounded-full">Updated {new Date().toLocaleTimeString()}</span>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.bookingTrendLast7Days}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 12, fill: '#888' }}
                        dy={10}
                        tickFormatter={(val) => val.split('-').slice(1).join('/')}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 12, fill: '#888' }}
                      />
                      <Tooltip 
                        cursor={{ fill: '#F5F5F5' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="#D4AF37" 
                        radius={[6, 6, 0, 0]} 
                        barSize={36}
                        name="Bookings"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Occupancy Pie Chart */}
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-primary/10 text-primary">
                    <Calendar className="h-4 w-4" />
                  </div>
                  Inventory Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={occupancyData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {occupancyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Legend verticalAlign="bottom" height={32} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="pt-3 border-t border-border mt-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground text-xs font-medium">Total Available Nights</span>
                    <span className="font-bold text-foreground">{summary.totalAvailableNights}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Peak Summary List */}
          <Card>
            <CardHeader>
              <CardTitle>Peak Booking Periods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {summary.peakBookingDays.length === 0 ? (
                  <div className="col-span-3 text-center py-6 text-muted-foreground">No bookings recorded in this range.</div>
                ) : (
                  summary.peakBookingDays.map((p, idx) => (
                    <div key={p.date} className="flex items-center gap-4 p-4 rounded-xl bg-muted/10">
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-medium">{new Date(p.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div className="text-xs text-muted-foreground">{p.count} New Bookings</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
