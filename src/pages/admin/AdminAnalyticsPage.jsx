import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-bold tracking-tight">System Analytics</h1>
          <p className="text-muted-foreground text-lg">
            Comprehensive overview of hotel performance and booking trends.
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={refresh} 
          disabled={loading}
          className="rounded-full px-6 gap-2 border-gold/30 hover:bg-gold/10"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? "Refreshing..." : "Sync Data"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
          <TrendingUp className="w-5 h-5" />
          {error}
        </div>
      ) : null}

      {loading || !summary ? (
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl border border-border bg-background animate-pulse" />
          ))}
          <div className="md:col-span-2 h-80 rounded-2xl border border-border bg-background animate-pulse" />
          <div className="h-80 rounded-2xl border border-border bg-background animate-pulse" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Stats */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Occupancy Rate</span>
                <div className="p-2.5 rounded-xl bg-gold/10 text-gold flex items-center justify-center">
                  <PieIcon className="w-5 h-5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground tracking-tight">
                  {(summary.occupancyRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <span>{summary.occupancyNights} nights occupied</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Users</span>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-600 tracking-tight">
                  {activeUsers.total}
                </div>
                <div className="text-xs text-muted-foreground mt-1.5 font-medium">
                  {activeUsers.guest} guests · {activeUsers.fo} FO · {activeUsers.admin} admin
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Revenue</span>
                <div className="p-2.5 rounded-xl bg-gold/10 text-gold flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground tracking-tight truncate">
                  {formatCurrencyPHP(summary.totalRevenue)}
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  Last 30 days (est.)
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Units</span>
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground tracking-tight">{summary.roomCount}</div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  Available units in system
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Trend Chart */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gold/10 text-gold">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-lg">Booking Volume (7 Days)</h3>
                </div>
                <span className="text-xs text-muted-foreground bg-muted/10 px-2.5 py-1 rounded-full">Updated {new Date().toLocaleTimeString()}</span>
              </div>
              
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
            </div>

            {/* Occupancy Pie Chart */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-gold/10 text-gold">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-lg">Inventory Utilization</h3>
              </div>
              
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
            </div>
          </div>

          {/* Peak Summary List */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-semibold text-lg mb-4">Peak Booking Periods</h3>
            <div className="grid gap-4 md:grid-cols-3">
              {summary.peakBookingDays.length === 0 ? (
                <div className="col-span-3 text-center py-6 text-muted-foreground">No bookings recorded in this range.</div>
              ) : (
                summary.peakBookingDays.map((p, idx) => (
                  <div key={p.date} className="flex items-center gap-4 p-4 rounded-xl bg-muted/10">
                    <div className="w-8 h-8 rounded-full bg-gold/20 text-gold flex items-center justify-center font-bold text-sm">
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
          </div>
        </div>
      )}
    </div>
  );
}
