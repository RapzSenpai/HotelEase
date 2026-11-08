import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate } from "@/lib/format";
import { nightsPastArrival } from "@/lib/night-audit";
import {
  getLatestAudit,
  loadNightAuditData,
  markNoShow,
  runNightAudit} from "@/services/nightAuditService";
import {
  BedDouble,
  CalendarX2,
  MoonStar,
  RefreshCw,
  UserX,
  Users} from "lucide-react";

/**
 * Night audit + no-show control for the FO dashboard. Everything here is a
 * manual FO action (no cron): mark individual late arrivals as no-shows and
 * write the end-of-day snapshot. Cutoff + dedupe rules live in
 * lib/night-audit.js + nightAuditService.js; this card is presentation only.
 */

const TONE = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-foreground/50"};

function FigureTile({ icon: Icon, label, value, suffix, hint, tone = "neutral", valueTone = "" }) {
  return (
    <div className="bg-background p-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[11px] uppercase tracking-wide text-foreground/50">
          {label}
        </p>
      </div>
      <p className={`text-2xl font-semibold leading-none tabular-nums ${valueTone}`}>
        {value}
        {suffix ? (
          <span className="ml-1 text-sm font-medium text-foreground/40">{suffix}</span>
        ) : null}
      </p>
      <p className="text-[11px] text-foreground/55 leading-snug">{hint}</p>
    </div>
  );
}

function ArrivalRow({ booking, confirmArmed, busy, onArm, onConfirm }) {
  const lateInfo = nightsPastArrival(booking);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {booking.roomName || "Room"} · {formatDate(booking.checkInDate)}
        </p>
        <p className="text-[10px] text-foreground/50">
          {lateInfo > 0
            ? `${lateInfo}d past arrival — eligible for the no-show charge`
            : `${lateInfo}d past arrival`}
        </p>
      </div>
      {confirmArmed ? (
        <Button
          variant="destructive"
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={onConfirm}>
          <UserX className="h-3.5 w-3.5 mr-1" />
          Confirm No-Show
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={onArm}>
          <UserX className="h-3.5 w-3.5 mr-1" />
          Mark No-Show
        </Button>
      )}
    </div>
  );
}

export default function NightAuditCard() {
  const { user, profile } = useAuth();
  const staffName =
    profile?.fullName || user?.displayName || user?.email || "Staff";
  const staffId = user?.uid || null;

  const [data, setData] = useState(null);
  const [lastAudit, setLastAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [markingBusy, setMarkingBusy] = useState(false);
  const [armedId, setArmedId] = useState(null);

  async function refresh() {
    try {
      const [stats, audit] = await Promise.all([
        loadNightAuditData(),
        getLatestAudit()]);
      setData(stats);
      setLastAudit(audit);
    } catch (e) {
      console.error("[NightAuditCard] load failed:", e);
      toast.error("Could not load night audit data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleMarkNoShow(bookingId) {
    setMarkingBusy(true);
    try {
      const result = await markNoShow(bookingId, {
        markedBy: staffName,
        markedByUserId: staffId});
      if (result.changed === false) {
        toast.info("Booking was already cancelled — nothing changed.");
      } else if (result.refundRequested > 0) {
        toast.success("No-show recorded", {
          description: `Refund of ₱${result.refundRequested.toLocaleString()} queued for approval (one-night fee withheld).`});
      } else {
        toast.success("No-show recorded", {
          description: result.refundSkipped
            ? result.refundSkipped
            : "No refund was due (payment did not cover one night)."});
      }
      setArmedId(null);
      await refresh();
    } catch (e) {
      toast.error(e?.message || "Could not mark the no-show.");
    } finally {
      setMarkingBusy(false);
    }
  }

  async function handleRunAudit() {
    setRunning(true);
    try {
      const result = await runNightAudit({
        runByName: staffName,
        runByUserId: staffId});
      toast.success(`Night audit saved (${result.runCount === 1 ? "first run" : `run #${result.runCount}`})`, {
        description: `Snapshot written for ${result.auditDate}.`});
      await refresh();
    } catch (e) {
      toast.error(e?.message || "Could not run the night audit.");
    } finally {
      setRunning(false);
    }
  }

  const figures = data?.figures ?? {};
  const lastRunText = lastAudit
    ? `Last audit today: run #${lastAudit.runCount ?? "?"}${lastAudit.runByName ? ` by ${lastAudit.runByName}` : ""}${lastAudit.occupancyRate != null ? ` · ${lastAudit.occupancyRate}% occupancy` : ""}`
    : "No audit snapshot yet today.";

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MoonStar className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold leading-tight">Night Audit</h3>
            <p className="text-[11px] text-foreground/50 leading-snug">
              End-of-day check: missed arrivals become no-shows, then the day&apos;s
              figures are saved as one snapshot per business date.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            title="Reload lists and figures">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" disabled={running} onClick={handleRunAudit}>
            {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
            Run Night Audit
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-foreground/60">Loading night audit data…</p>
      ) : (
        <>
          <p className="text-[11px] text-foreground/50">{lastRunText}</p>

          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            <FigureTile
              icon={BedDouble}
              label="Occupied"
              value={figures.occupiedRooms ?? 0}
              suffix={`/ ${figures.totalRooms ?? 0}`}
              hint="Rooms in use at audit time"
              tone="primary"
            />
            <FigureTile
              icon={Users}
              label="Arrivals today"
              value={figures.arrivalsTodayNotCheckedIn ?? 0}
              hint="Approved, not checked in yet"
              tone="info"
            />
            <FigureTile
              icon={CalendarX2}
              label="No-show eligible"
              value={figures.noShowEligible ?? 0}
              hint="Arrival date passed — ready to mark"
              tone="warning"
              valueTone={(figures.noShowEligible ?? 0) > 0 ? "text-warning" : ""}
            />
            <FigureTile
              icon={UserX}
              label="No-shows today"
              value={figures.noShowsMarkedToday ?? 0}
              hint="Marked no-show today"
              tone="destructive"
              valueTone={(figures.noShowsMarkedToday ?? 0) > 0 ? "text-destructive" : ""}
            />
          </div>

          {/* No-show eligible — arrival date passed; guest did not show */}
          {data?.eligible?.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold">
                Late arrivals — no-show eligible
                <span className="ml-1 font-normal text-foreground/50">
                  (arrival date is over; the one-night fee applies per the policy)
                </span>
              </p>
              {data.eligible.map((booking) => (
                <ArrivalRow
                  key={booking.id}
                  booking={booking}
                  confirmArmed={armedId === booking.id}
                  busy={markingBusy}
                  onArm={() => setArmedId(booking.id)}
                  onConfirm={() => handleMarkNoShow(booking.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-foreground/50">
              No late arrivals — every approved booking still within its stay.
            </p>
          )}

          {/* Arrivals today: informational, blocked intentionally */}
          {data?.dueToday?.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold">
                Arrivals today — not yet checked in
                <span className="ml-1 font-normal text-foreground/50">
                  (no action now: the guest may still arrive tonight; becomes no-show
                  eligible tomorrow)
                </span>
              </p>
              {data.dueToday.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-sm">
                  {booking.roomName || "Room"} · {formatDate(booking.checkInDate)}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
