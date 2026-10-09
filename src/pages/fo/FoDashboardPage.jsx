import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import RoomScheduleTape from "@/components/dashboard/RoomScheduleTape";
import { subscribeToRooms } from "@/services/roomsService";
import {
  subscribeToBookingsPage,
  countCheckInsToday,
  countCheckOutsDue,
  countOverdueCheckOuts} from "@/services/bookingsService";
import { useHotkeys } from "@/hooks/useHotkeys";
import { getStatusTimestamp, toJsDate } from "@/lib/time-utils";
import {
  BedDouble,
  Users,
  Wrench,
  Clock,
  TrendingUp,
  CalendarClock,
  LogIn,
  Search,
  AlertTriangle} from "lucide-react";

const STATUS_FILTERS = [
  { id: "all", label: "All Rooms" },
  { id: "Available", label: "Available" },
  { id: "Reserved", label: "Reserved" },
  { id: "Occupied", label: "Occupied" },
  { id: "Housekeeping", label: "Housekeeping" },
];

function MetricPill({ label, value, icon }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-foreground/45" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-foreground/45">
          {label}
        </p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function actionForStatus(status) {
  const s = (status || "").trim();
  if (s === "Reserved") return { label: "Check-In", path: "/fo/check-in", key: "c" };
  if (s === "Occupied") return { label: "Check-Out", path: "/fo/check-out", key: "o" };
  if (
    s === "Dirty / Needs Cleaning" ||
    s === "Being Cleaned" ||
    s === "Pending Approval"
  ) {
    return { label: "Housekeeping", path: "/fo/housekeeping", key: "h" };
  }
  return null;
}

function getRoomLabel(room) {
  const parts = [room.name || room.type || "Room"];
  if (room.roomNumber) parts.push(`#${room.roomNumber}`);
  return parts.join(" • ");
}

function matchesHotkeyAction(room, hotkey) {
  const status = room.status || "Available";
  const action = actionForStatus(status)?.key;
  return action === hotkey;
}

export default function FoDashboardPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  // P1 scalability: exact server counts instead of the whole bookings
  // collection. Null = not loaded yet (renders as …).
  const [bookingMetrics, setBookingMetrics] = useState({
    checkInsToday: null,
    checkOutsDue: null,
    overdueCheckOuts: null});
  const [error] = useState(null);
  // Table row selection is gone with the table; hotkeys fall back to the
  // first matching room when nothing is selected.
  const [selectedRoomId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");

  const prevStatusesRef = useRef(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    let settled = false;

    const unsubscribe = subscribeToRooms(
      (data) => {
        if (!isInitialLoadRef.current && prevStatusesRef.current) {
          data.forEach((room) => {
            const previousStatus = prevStatusesRef.current.get(room.id);
            if (
              previousStatus &&
              previousStatus !== room.status &&
              room.isActive !== false &&
              // Mid-stay requests carry their own View toast — the generic
              // status toast would only double-notify the same event.
              !room.isMidStayRequest
            ) {
              toast.info(
                `${getRoomLabel(room)} is now ${room.status || "Unknown"}`,
                { description: "Updated by another staff member" });
            }
          });
        }

        prevStatusesRef.current = new Map(
          data.map((room) => [room.id, room.status]));
        isInitialLoadRef.current = false;
        setRooms(data);
        if (!settled) {
          settled = true;
          setLoading(false);
        }
      });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Realtime trigger + periodic refresh for the booking metrics below.
  // The 1-doc window watches ALL statuses ordered by updatedAt, so every
  // booking write (check-in, check-out, even back-office edits to old
  // check-outs that re-enter today's window) bubbles to the top and fires.
  // Single-field updatedAt ordering needs no composite index.
  // The 60s interval covers day rollover.
  useEffect(() => {
    let cancelled = false;
    async function refreshMetrics() {
      try {
        const [checkInsToday, checkOutsDue, overdueCheckOuts] = await Promise.all([
          countCheckInsToday(),
          countCheckOutsDue(),
          countOverdueCheckOuts(),
        ]);
        if (!cancelled) setBookingMetrics({ checkInsToday, checkOutsDue, overdueCheckOuts });
      } catch (err) {
        // Missing composite index (see firestore.indexes.json) lands here —
        // metrics stay "…" instead of crashing. Deploy indexes to fix.
        console.error("[FoDashboardPage] metrics query failed:", err);
      }
    }
    refreshMetrics();
    const unsubscribe = subscribeToBookingsPage(
      { pageSize: 1, orderField: "updatedAt", orderDir: "desc"},
      () => {
        if (!cancelled) refreshMetrics();
      });
    const interval = setInterval(() => {
      if (!cancelled) refreshMetrics();
    }, 60000);
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const visibleRooms = rooms.filter((r) => r.isActive !== false);

  const statCounts = {
    available: visibleRooms.filter((r) => r.status === "Available").length,
    occupied: visibleRooms.filter((r) => r.status === "Occupied").length,
    reserved: visibleRooms.filter((r) => r.status === "Reserved").length,
    housekeeping: visibleRooms.filter((r) =>
      ["Being Cleaned", "Pending Approval", "Dirty / Needs Cleaning"].includes(
        r.status)).length};

  const timeMetrics = useMemo(() => {
    const total = visibleRooms.length || 1;
    const occupancyRate = Math.round((statCounts.occupied / total) * 100);

    const checkInsToday = bookingMetrics.checkInsToday;
    const checkOutsDue = bookingMetrics.checkOutsDue;

    const activeStatuses = visibleRooms.filter(
      (room) => room.status && room.status !== "Available");
    const nowMs = new Date().getTime();
    const avgMinutes =
      activeStatuses.length > 0
        ? Math.round(
            activeStatuses.reduce((sum, room) => {
              const ts = getStatusTimestamp(room);
              const date = toJsDate(ts);
              if (!date) return sum;
              return sum + (nowMs - date.getTime()) / 60000;
            }, 0) / activeStatuses.length)
        : 0;

    const avgStatusLabel =
      avgMinutes >= 60
        ? `${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m`
        : avgMinutes > 0
          ? `${avgMinutes}m`
          : "—";

    const overdueCheckOuts = bookingMetrics.overdueCheckOuts;

    return { occupancyRate, checkInsToday, checkOutsDue, overdueCheckOuts, avgStatusLabel };
  }, [visibleRooms, statCounts.occupied, bookingMetrics]);

  const filteredRooms = useMemo(() => {
    const HK_STATUSES = ["Being Cleaned", "Pending Approval", "Dirty / Needs Cleaning"];
    let result = visibleRooms;

    if (activeStatusFilter !== "all") {
      result = result.filter((r) =>
        activeStatusFilter === "Housekeeping"
          ? HK_STATUSES.includes(r.status)
          : r.status === activeStatusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.type || "").toLowerCase().includes(q) ||
          String(r.roomNumber || "").toLowerCase().includes(q) ||
          String(r.floor || "").toLowerCase().includes(q));
    }

    return result;
  }, [visibleRooms, activeStatusFilter, searchQuery]);

  const navigateForHotkey = useCallback(
    (hotkey) => {
      const selected =
        selectedRoomId &&
        visibleRooms.find((room) => room.id === selectedRoomId);
      const target =
        selected && matchesHotkeyAction(selected, hotkey)
          ? selected
          : visibleRooms.find((room) =>
              matchesHotkeyAction(room, hotkey));

      if (!target) {
        toast.message(`No room available for that action (${hotkey.toUpperCase()})`);
        return;
      }

      const status = target.status || "Available";
      const action = actionForStatus(status);

      if (!action) {
        toast.message(`No action available for ${getRoomLabel(target)}`);
        return;
      }

      navigate(`${action.path}?roomId=${target.id}`);
    },
    [
      navigate,
      selectedRoomId,
      visibleRooms,
    ]);

  const hotkeys = useMemo(
    () => ({
      c: () => navigateForHotkey("c"),
      o: () => navigateForHotkey("o"),
      h: () => navigateForHotkey("h")}),
    [navigateForHotkey]);

  useHotkeys(hotkeys, { enabled: !loading });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-playfair text-3xl font-semibold">FO Dashboard</h1>
          <p className="text-foreground/80">
            Live room overview with status tracking and quick-action shortcuts.
          </p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-xs text-foreground/60">
          <span className="font-semibold text-foreground/80">Shortcuts:</span>{" "}
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">C</kbd>{" "}
          Check-in ·{" "}
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">O</kbd>{" "}
          Check-out ·{" "}
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">H</kbd>{" "}
          Housekeeping
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      {!loading && (
        <>
          {/* Overdue Checkouts Alert Banner */}
          {timeMetrics.overdueCheckOuts > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/20 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-destructive">
                    {timeMetrics.overdueCheckOuts} Overdue Stay{timeMetrics.overdueCheckOuts !== 1 ? "s" : ""} Detected
                  </h4>
                  <p className="text-xs text-foreground/75 mt-0.5">
                    Checked-in bookings have exceeded their check-out deadline. Review folios, extend stays, or finalize departure.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0 text-xs font-semibold"
                onClick={() => navigate("/fo/check-out")}
              >
                Resolve Overdue Checkouts
              </Button>
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="grid divide-y divide-border grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
              <div className="flex items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                  <BedDouble className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-foreground/50">Available</p>
                  <p className="text-lg font-semibold leading-tight">{statCounts.available}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-foreground/50">Occupied</p>
                  <p className="text-lg font-semibold leading-tight">{statCounts.occupied}</p>
                  <p className="truncate text-[10px] text-foreground/50">{timeMetrics.occupancyRate}% occupancy</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-reserved/15 text-reserved">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-foreground/50">Reserved</p>
                  <p className="text-lg font-semibold leading-tight">{statCounts.reserved}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/15 text-info">
                  <Wrench className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-foreground/50">Housekeeping</p>
                  <p className="text-lg font-semibold leading-tight">{statCounts.housekeeping}</p>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricPill
              label="Occupancy rate"
              value={`${timeMetrics.occupancyRate}%`}
              icon={TrendingUp}
            />
            <MetricPill
              label="Check-ins today"
              value={timeMetrics.checkInsToday ?? "…"}
              icon={LogIn}
            />
            <MetricPill
              label="Check-outs due"
              value={timeMetrics.checkOutsDue ?? "…"}
              icon={CalendarClock}
            />
            <MetricPill
              label="Avg. time in status"
              value={timeMetrics.avgStatusLabel}
              icon={Clock}
            />
          </div>
        </>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-background p-5 text-sm text-foreground/70">
          Loading rooms...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Search bar + room count */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search rooms..."
                className="pl-9 pr-3 h-9 w-full sm:w-64 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-0 focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <p className="text-sm text-foreground/50">
              {filteredRooms.length === visibleRooms.length
                ? `${visibleRooms.length} rooms`
                : `${filteredRooms.length} of ${visibleRooms.length} rooms`}
            </p>
          </div>

          {/* Status filter tabs */}
          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            {STATUS_FILTERS.map((tab) => {
              const isActive = activeStatusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveStatusFilter(tab.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Room schedule */}
          <RoomScheduleTape rooms={filteredRooms} />
        </div>
      )}
    </div>
  );
}
