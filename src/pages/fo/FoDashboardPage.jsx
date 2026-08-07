import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { subscribeToRooms } from "@/services/roomsService";
import {
  listBookingsByStatuses,
  subscribeToAllBookings,
} from "@/services/bookingsService";
import { useAuth } from "@/contexts/AuthContext";
import { useHotkeys } from "@/hooks/useHotkeys";
import { getStatusTimestamp, timeSince, toJsDate } from "@/lib/time-utils";
import {
  BedDouble,
  Users,
  Wrench,
  Clock,
  TrendingUp,
  CalendarClock,
  LogIn,
  Search,
} from "lucide-react";

function StatCard({ label, value, icon, subtitle, variant = "default" }) {
  const IconComponent = icon;
  const variants = {
    success: {
      container: "bg-success/5 border-success/20 hover:border-success/30",
      icon: "bg-success/15 text-success border-success/20",
    },
    danger: {
      container: "bg-destructive/5 border-destructive/20 hover:border-destructive/30",
      icon: "bg-destructive/15 text-destructive border-destructive/20",
    },
    reserved: {
      container: "bg-reserved/5 border-reserved/20 hover:border-reserved/30",
      icon: "bg-reserved/15 text-reserved border-reserved/20",
    },
    info: {
      container: "bg-info/5 border-info/20 hover:border-info/30",
      icon: "bg-info/15 text-info border-info/20",
    },
    default: {
      container: "border-border bg-background hover:border-border/80",
      icon: "bg-muted/50 text-foreground/60 border-transparent",
    }
  };
  const style = variants[variant] || variants.default;

  return (
    <div className={`rounded-xl border p-5 space-y-3 transition-all hover:shadow-sm ${style.container}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground/65">{label}</p>
        <div className={`rounded-lg border p-2 ${style.icon}`}>
          <IconComponent className="h-4 w-4" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {subtitle ? (
        <p className="text-xs text-foreground/50">{subtitle}</p>
      ) : null}
    </div>
  );
}

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

function matchesHotkeyAction(room, hotkey, trainingMode, trainingBookingsByRoomId) {
  const status = room.status || "Available";
  const action = trainingMode
    ? (() => {
        const t = trainingBookingsByRoomId.get(room.id);
        if (t?.hasPendingOrApproved) return "c";
        if (t?.hasCheckedIn) return "o";
        if (t?.hasCheckedOut) return "h";
        return null;
      })()
    : actionForStatus(status)?.key;
  return action === hotkey;
}

export default function FoDashboardPage() {
  const navigate = useNavigate();
  const { trainingMode } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [trainingBookingsByRoomId, setTrainingBookingsByRoomId] = useState(
    new Map(),
  );

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
              room.isActive !== false
            ) {
              toast.info(
                `${getRoomLabel(room)} is now ${room.status || "Unknown"}`,
                { description: "Updated by another staff member" },
              );
            }
          });
        }

        prevStatusesRef.current = new Map(
          data.map((room) => [room.id, room.status]),
        );
        isInitialLoadRef.current = false;
        setRooms(data);
        if (!settled) {
          settled = true;
          setLoading(false);
        }
      },
      { trainingMode },
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [trainingMode]);

  useEffect(() => {
    const unsubscribe = subscribeToAllBookings((data) => setBookings(data), {
      trainingMode,
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [trainingMode]);

  useEffect(() => {
    let isMounted = true;
    async function loadTrainingBookings() {
      if (!trainingMode) {
        setTrainingBookingsByRoomId(new Map());
        return;
      }
      try {
        const data = await listBookingsByStatuses(
          ["Pending", "Approved", "Checked In", "Checked Out"],
          { trainingMode: true },
        );
        if (!isMounted) return;

        const map = new Map();
        for (const b of data) {
          if (!b.roomId) continue;
          if (!map.has(b.roomId)) {
            map.set(b.roomId, {
              hasPendingOrApproved: false,
              hasCheckedIn: false,
              hasCheckedOut: false,
            });
          }
          const item = map.get(b.roomId);
          if (b.status === "Pending" || b.status === "Approved")
            item.hasPendingOrApproved = true;
          if (b.status === "Checked In") item.hasCheckedIn = true;
          if (b.status === "Checked Out") item.hasCheckedOut = true;
        }
        setTrainingBookingsByRoomId(map);
      } catch {
        if (!isMounted) return;
        setTrainingBookingsByRoomId(new Map());
      }
    }

    loadTrainingBookings();
    return () => {
      isMounted = false;
    };
  }, [trainingMode]);

  const visibleRooms = rooms.filter((r) => r.isActive !== false);

  const statCounts = {
    available: visibleRooms.filter((r) => r.status === "Available").length,
    occupied: visibleRooms.filter((r) => r.status === "Occupied").length,
    reserved: visibleRooms.filter((r) => r.status === "Reserved").length,
    housekeeping: visibleRooms.filter((r) =>
      ["Being Cleaned", "Pending Approval", "Dirty / Needs Cleaning"].includes(
        r.status,
      ),
    ).length,
  };

  const timeMetrics = useMemo(() => {
    const total = visibleRooms.length || 1;
    const occupancyRate = Math.round((statCounts.occupied / total) * 100);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkInsToday = bookings.filter((booking) => {
      if (booking.status !== "Checked In" && booking.status !== "Checked Out")
        return false;
      const updated = toJsDate(booking.updatedAt);
      return updated && updated >= today;
    }).length;

    const checkOutsDue = bookings.filter((booking) => {
      if (booking.status !== "Checked In") return false;
      const checkOutDate = toJsDate(booking.checkOutDate);
      if (!checkOutDate) return false;
      checkOutDate.setHours(0, 0, 0, 0);
      return checkOutDate <= today;
    }).length;

    const activeStatuses = visibleRooms.filter(
      (room) => room.status && room.status !== "Available",
    );
    const nowMs = new Date().getTime();
    const avgMinutes =
      activeStatuses.length > 0
        ? Math.round(
            activeStatuses.reduce((sum, room) => {
              const ts = getStatusTimestamp(room);
              const date = toJsDate(ts);
              if (!date) return sum;
              return sum + (nowMs - date.getTime()) / 60000;
            }, 0) / activeStatuses.length,
          )
        : 0;

    const avgStatusLabel =
      avgMinutes >= 60
        ? `${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m`
        : avgMinutes > 0
          ? `${avgMinutes}m`
          : "—";

    return { occupancyRate, checkInsToday, checkOutsDue, avgStatusLabel };
  }, [visibleRooms, statCounts.occupied, bookings]);

  const filteredRooms = useMemo(() => {
    const HK_STATUSES = ["Being Cleaned", "Pending Approval", "Dirty / Needs Cleaning"];
    let result = visibleRooms;

    if (activeStatusFilter !== "all") {
      result = result.filter((r) =>
        activeStatusFilter === "Housekeeping"
          ? HK_STATUSES.includes(r.status)
          : r.status === activeStatusFilter,
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.type || "").toLowerCase().includes(q) ||
          String(r.roomNumber || "").toLowerCase().includes(q) ||
          String(r.floor || "").toLowerCase().includes(q),
      );
    }

    return result;
  }, [visibleRooms, activeStatusFilter, searchQuery]);

  const navigateForHotkey = useCallback(
    (hotkey) => {
      const selected =
        selectedRoomId &&
        visibleRooms.find((room) => room.id === selectedRoomId);
      const target =
        selected && matchesHotkeyAction(selected, hotkey, trainingMode, trainingBookingsByRoomId)
          ? selected
          : visibleRooms.find((room) =>
              matchesHotkeyAction(room, hotkey, trainingMode, trainingBookingsByRoomId),
            );

      if (!target) {
        toast.message(`No room available for that action (${hotkey.toUpperCase()})`);
        return;
      }

      const status = target.status || "Available";
      const action = trainingMode
        ? trainingBookingsByRoomId.get(target.id)?.hasPendingOrApproved
          ? { path: "/fo/check-in" }
          : trainingBookingsByRoomId.get(target.id)?.hasCheckedIn
            ? { path: "/fo/check-out" }
            : trainingBookingsByRoomId.get(target.id)?.hasCheckedOut
              ? { path: "/fo/housekeeping" }
              : null
        : actionForStatus(status);

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
      trainingMode,
      trainingBookingsByRoomId,
    ],
  );

  const hotkeys = useMemo(
    () => ({
      c: () => navigateForHotkey("c"),
      o: () => navigateForHotkey("o"),
      h: () => navigateForHotkey("h"),
    }),
    [navigateForHotkey],
  );

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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Available"
              value={statCounts.available}
              icon={BedDouble}
              variant="success"
            />
            <StatCard
              label="Occupied"
              value={statCounts.occupied}
              icon={Users}
              subtitle={`${timeMetrics.occupancyRate}% occupancy`}
              variant="danger"
            />
            <StatCard
              label="Reserved"
              value={statCounts.reserved}
              icon={Clock}
              variant="reserved"
            />
            <StatCard
              label="Housekeeping"
              value={statCounts.housekeeping}
              icon={Wrench}
              variant="info"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricPill
              label="Occupancy rate"
              value={`${timeMetrics.occupancyRate}%`}
              icon={TrendingUp}
            />
            <MetricPill
              label="Check-ins today"
              value={timeMetrics.checkInsToday}
              icon={LogIn}
            />
            <MetricPill
              label="Check-outs due"
              value={timeMetrics.checkOutsDue}
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
                className="pl-10 pr-4 py-2 bg-background border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-64 transition-all"
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

          {/* Room table */}
          {filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-xl border-2 border-dashed border-border text-center space-y-2">
              <BedDouble className="h-10 w-10 text-foreground/20" />
              <p className="text-sm text-foreground/50">No rooms match your filters.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Rate / Night</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRooms.map((room) => {
                    const status = room.status || "Available";
                    const roomTraining = trainingBookingsByRoomId.get(room.id);
                    const action = trainingMode
                      ? roomTraining?.hasPendingOrApproved
                        ? { label: "Check-In", path: "/fo/check-in" }
                        : roomTraining?.hasCheckedIn
                          ? { label: "Check-Out", path: "/fo/check-out" }
                          : roomTraining?.hasCheckedOut
                            ? { label: "Housekeeping", path: "/fo/housekeeping" }
                            : null
                      : actionForStatus(status);
                    const isSelected = selectedRoomId === room.id;
                    const statusTime = timeSince(getStatusTimestamp(room));

                    return (
                      <TableRow
                        key={room.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedRoomId(room.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedRoomId(room.id);
                          }
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                            : ""
                        }`}
                      >
                        {/* Room name + floor */}
                        <TableCell>
                          <div className="font-semibold text-sm">
                            {room.name || room.type || "Room"}
                            {room.roomNumber ? ` · #${room.roomNumber}` : ""}
                          </div>
                          <div className="text-xs text-foreground/45 mt-0.5">
                            Floor {room.floor || "—"}
                          </div>
                        </TableCell>

                        {/* Type */}
                        <TableCell>
                          <span className="text-sm text-foreground/70">
                            {room.type || "—"}
                          </span>
                        </TableCell>

                        {/* Rate */}
                        <TableCell>
                          <Badge variant="warning" className="text-xs font-semibold">
                            PHP {Number(room.ratePerNight ?? 0).toLocaleString()}
                          </Badge>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <div className="space-y-1">
                            <RoomStatusBadge status={status} />
                            {status !== "Available" && (
                              <div className="text-[10px] text-foreground/40">
                                Active {statusTime}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-right">
                          {action ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`${action.path}?roomId=${room.id}`);
                              }}
                            >
                              {action.label}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              No Action
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
