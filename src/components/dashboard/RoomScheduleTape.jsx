import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, BedDouble } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle} from "@/components/ui/dialog";
import { subscribeToBookingsPage } from "@/services/bookingsService";
import { toJsDate } from "@/lib/time-utils";

const WINDOW_DAYS = 14;
const LEAD_DAYS = 0; // window starts today — checked-out stays are not drawn
const LOOKBACK_DAYS = 30; // bookings starting earlier but overlapping in
const DAY_MS = 86400000;

const HK_STATUSES = ["Being Cleaned", "Pending Approval", "Dirty / Needs Cleaning"];
// Cancelled/Rejected/Expired free the room, Checked Out is history — never drawn.
const HIDDEN_BOOKING_STATUSES = new Set(["Cancelled", "Rejected", "Expired", "Checked Out"]);

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDay(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtWeekday(d) {
  return d.toLocaleDateString(undefined, { weekday: "narrow" });
}

// Chip color per booking status — same tokens as the stat cards above the table.
function chipStyle(status, roomStatus) {
  if (status === "Checked In" || roomStatus === "Occupied") {
    return "bg-destructive/15 text-destructive border-destructive/30";
  }
  if (HK_STATUSES.includes(status) || HK_STATUSES.includes(roomStatus)) {
    return "bg-info/15 text-info border-info/30";
  }
  // Pending / Approved / Awaiting Payment / Cancellation Requested → Reserved
  return "bg-reserved/15 text-reserved border-reserved/30";
}

function chipLabel(booking) {
  const s = booking.status || "";
  if (s === "Checked In") return "Occupied";
  if (HK_STATUSES.includes(s)) return "Housekeeping";
  if (s === "Approved") return "Reserved";
  if (s === "Pending" || s === "Awaiting Payment") return "Awaiting payment";
  if (s === "Cancellation Requested") return "Cancel requested";
  return s || "Booked";
}

function badgeVariant(status, roomStatus) {
  if (status === "Checked In" || roomStatus === "Occupied") return "danger";
  if (HK_STATUSES.includes(status) || HK_STATUSES.includes(roomStatus)) return "info";
  if (status === "Pending" || status === "Awaiting Payment" || status === "Cancellation Requested") return "warning";
  return "reserved";
}

export default function RoomScheduleTape({ rooms = []}) {
  const navigate = useNavigate();
  const [windowOffset, setWindowOffset] = useState(0); // days shifted from default
  const [bookings, setBookings] = useState([]);
  const [selected, setSelected] = useState(null); // booking|null + room

  const winStart = useMemo(() => {
    const t = startOfDay(new Date());
    return new Date(t.getTime() + (windowOffset - LEAD_DAYS) * DAY_MS);
  }, [windowOffset]);
  const winEnd = useMemo(() => new Date(winStart.getTime() + WINDOW_DAYS * DAY_MS), [winStart]);
  const todayIdx = useMemo(() => {
    const t = startOfDay(new Date()).getTime();
    return Math.floor((t - winStart.getTime()) / DAY_MS);
  }, [winStart]);

  const days = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => new Date(winStart.getTime() + i * DAY_MS)),
    [winStart]);

  // One bounded window query — arrival-ordered, client filters true overlap.
  useEffect(() => {
    const fromDate = new Date(winStart.getTime() - LOOKBACK_DAYS * DAY_MS);
    const unsub = subscribeToBookingsPage(
      { fromDate, toDate: winEnd, pageSize: 300},
      (rows) => setBookings(Array.isArray(rows) ? rows : []));
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [winStart, winEnd]);

  // Room id → stacked lanes of chips intersecting the window.
  const lanesByRoom = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      if (!b?.roomId || HIDDEN_BOOKING_STATUSES.has(b.status)) continue;
      const ci = toJsDate(b.checkInDate);
      const co = toJsDate(b.checkOutDate);
      if (!ci || !co) continue;
      const checkInDay = startOfDay(ci).getTime();
      const checkoutDay = startOfDay(co).getTime();
      const startIdx = Math.max(0, Math.floor((checkInDay - winStart.getTime()) / DAY_MS));
      const endIdx = Math.min(WINDOW_DAYS, Math.floor((checkoutDay - winStart.getTime()) / DAY_MS));
      if (endIdx <= startIdx) continue;
      if (!map.has(b.roomId)) map.set(b.roomId, []);
      map.get(b.roomId).push({ booking: b, startIdx, endIdx });
    }
    // Stack overlapping chips into lanes so same-room bookings never cover each other.
    for (const bars of map.values()) {
      bars.sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
      const laneEnds = [];
      for (const bar of bars) {
        let lane = laneEnds.findIndex((end) => end <= bar.startIdx);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(bar.endIdx);
        } else {
          laneEnds[lane] = bar.endIdx;
        }
        bar.lane = lane;
      }
    }
    return map;
  }, [bookings, winStart]);

  const laneCountByRoom = useMemo(() => {
    const m = new Map();
    for (const [roomId, bars] of lanesByRoom) {
      m.set(roomId, Math.max(1, ...bars.map((b) => (b.lane ?? 0) + 1)));
    }
    return m;
  }, [lanesByRoom]);

  const rangeLabel = `${fmtDay(winStart)} – ${fmtDay(new Date(winEnd.getTime() - DAY_MS))}`;

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {/* Window nav + color legend (colors, not icons, for this view) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setWindowOffset((n) => n - 7)} aria-label="Previous 7 days">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setWindowOffset(0)}>
              Today
            </Button>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setWindowOffset((n) => n + 7)} aria-label="Next 7 days">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-1 text-xs font-medium text-foreground/60">{rangeLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-destructive/70" /> Occupied
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-reserved/70" /> Reserved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-info/70" /> Housekeeping
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-success/70" /> Available
            </span>
          </div>
        </div>

        {/* Tape grid */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="min-w-[960px]">
            {/* Date header */}
            <div
              className="grid border-b border-border"
              style={{ gridTemplateColumns: `180px repeat(${WINDOW_DAYS}, minmax(0, 1fr))` }}
            >
              <div className="sticky left-0 bg-background px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/40">
                Room
              </div>
              {days.map((d, i) => {
                const isToday = i === todayIdx;
                return (
                  <div
                    key={d.getTime()}
                    className={`px-1 py-2 text-center border-l border-border/30 first:border-l-0 ${isToday ? "bg-primary/10" : ""}`}
                  >
                    <div className={`text-[10px] uppercase tracking-wide ${isToday ? "text-primary font-semibold" : "text-foreground/40"}`}>
                      {fmtWeekday(d)}
                    </div>
                    <div className={`text-xs tabular-nums ${isToday ? "text-primary font-bold" : "font-medium text-foreground/70"}`}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Room rows */}
            {rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <BedDouble className="h-8 w-8 text-foreground/20" />
                <p className="text-sm text-foreground/50">No rooms match your filters.</p>
              </div>
            ) : (
              rooms.map((room) => {
                const bars = lanesByRoom.get(room.id) ?? [];
                const laneCount = laneCountByRoom.get(room.id) ?? 1;
                const isHKRoom = HK_STATUSES.includes(room.status);
                return (
                  <div
                    key={room.id}
                    className="grid border-b border-border/50 last:border-b-0 hover:bg-surface-hover transition-colors"
                    style={{ gridTemplateColumns: `180px repeat(${WINDOW_DAYS}, minmax(0, 1fr))` }}
                  >
                    <div className="sticky left-0 bg-background px-3 py-2.5 min-w-0">
                      <div className="truncate text-[13px] font-semibold">
                        {room.name || room.type || "Room"}
                        {room.roomNumber ? ` · #${room.roomNumber}` : ""}
                      </div>
                      <div className="text-[11px] text-foreground/45">
                        {room.type || "—"} · Flr {room.floor || "—"}
                      </div>
                    </div>
                    <div className="relative" style={{ gridColumn: `span ${WINDOW_DAYS}` }}>
                      {/* Subtle per-day grid lines so chip durations read against dates */}
                      {[...days, winEnd].map((d) => (
                        <div
                          key={d.getTime()}
                          className="absolute inset-y-0 w-px bg-border/40 pointer-events-none"
                          style={{ left: `${((d.getTime() - winStart.getTime()) / DAY_MS / WINDOW_DAYS) * 100}%` }}
                        />
                      ))}
                      {/* Today stripe */}
                      {todayIdx >= 0 && todayIdx < WINDOW_DAYS && (
                        <div
                          className="absolute inset-y-0 bg-primary/5 border-x border-primary/20 pointer-events-none"
                          style={{
                            left: `${(todayIdx / WINDOW_DAYS) * 100}%`,
                            width: `${(1 / WINDOW_DAYS) * 100}%`}}
                        />
                      )}
                      {/* Empty-available hint */}
                      {bars.length === 0 && (
                        <div className="absolute inset-0 flex items-center px-2">
                          <span
                            className={`truncate rounded-md border px-2 py-1 text-[11px] font-medium ${
                              isHKRoom
                                ? "bg-info/15 text-info border-info/30"
                                : "bg-success/10 text-success/80 border-success/20"
                            }`}
                          >
                            {isHKRoom ? "Housekeeping" : "Available"}
                          </span>
                        </div>
                      )}
                      {/* Booking chips, stacked in lanes */}
                      {bars.map((bar) => {
                        const left = (bar.startIdx / WINDOW_DAYS) * 100;
                        const width = Math.max(((bar.endIdx - bar.startIdx) / WINDOW_DAYS) * 100, 3);
                        const top = (bar.lane ?? 0) * 30;
                        return (
                          <button
                            key={bar.booking.id}
                            type="button"
                            onClick={() => setSelected({ booking: bar.booking, room })}
                            title={`${chipLabel(bar.booking)} · ${fmtDay(toJsDate(bar.booking.checkInDate))} → ${fmtDay(toJsDate(bar.booking.checkOutDate))}`}
                            className={`absolute rounded-md border px-2 text-left text-[11px] font-medium truncate transition-shadow hover:shadow-md hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${chipStyle(bar.booking.status, room.status)}`}
                            style={{ left: `${left}%`, width: `${width}%`, top: 4 + top, height: 24 }}
                          >
                            {chipLabel(bar.booking)}
                          </button>
                        );
                      })}
                      <div style={{ height: Math.max(laneCount * 30 + 8, 36) }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chip detail dialog */}
        <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
          <DialogContent className="sm:max-w-[425px]" showCloseButton={false}>
            <DialogHeader>
              <div className="flex items-center gap-2 pr-2">
                <DialogTitle className="truncate">
                  {selected?.room?.name || selected?.room?.type || "Booking"}
                </DialogTitle>
                {selected && (
                  <Badge variant={badgeVariant(selected.booking.status, selected.room?.status)} className="shrink-0">
                    {chipLabel(selected.booking)}
                  </Badge>
                )}
              </div>
              <DialogDescription>
                {selected ? `${fmtDay(toJsDate(selected.booking.checkInDate))} → ${fmtDay(toJsDate(selected.booking.checkOutDate))}` : ""}
              </DialogDescription>
            </DialogHeader>
            {selected && (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-foreground/60 text-xs">
                    {selected.booking.leadGuestName || selected.booking.guestName || "Guest"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-foreground/50">Nights</p>
                    <p className="font-medium">{selected.booking.nights ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-foreground/50">Total</p>
                    <p className="font-medium tabular-nums">PHP {Number(selected.booking.totalCost ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-foreground/50">Method</p>
                    <p className="font-medium">{selected.booking.paymentMethod || "—"}</p>
                  </div>
                  <div>
                    <p className="text-foreground/50">Booking ID</p>
                    <p className="font-mono text-[11px] truncate">{selected.booking.id}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const s = selected.booking.status;
                      const path = s === "Approved" ? "/fo/check-in" : s === "Checked In" ? "/fo/check-out" : "/fo/bookings";
                      navigate(`${path}?roomId=${selected.room?.id || selected.booking.roomId || ""}`);
                      setSelected(null);
                    }}
                  >
                    {selected.booking.status === "Approved"
                      ? "Go to Check-In"
                      : selected.booking.status === "Checked In"
                        ? "Go to Check-Out"
                        : "Open in Bookings"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
