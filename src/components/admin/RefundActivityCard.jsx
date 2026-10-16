import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Undo2, HandCoins, ClockAlert, Banknote } from "lucide-react";

function formatCurrencyPHP(amount) {
  const n = Number(amount ?? 0);
  return `PHP ${n.toLocaleString()}`;
}

function Tile({ icon: Icon, label, value, sub, warning = false }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          warning ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-foreground/50">{label}</div>
        <div
          className={`text-xl font-semibold leading-tight tracking-tight ${
            warning ? "text-warning" : ""
          }`}
        >
          {value}
        </div>
        <div className="truncate text-[11px] text-foreground/50">{sub}</div>
      </div>
    </div>
  );
}

const EMPTY_STATE_CLASS = "border-t border-border px-4 py-6 text-center text-sm text-muted-foreground";

/**
 * Read-only refund monitoring for admins. Payouts stay with the Front Office
 * cancellation queue; this card only surfaces backlog counts and amounts from
 * the existing `refunds` records (stats = summarizeRefunds output, or null
 * when the fetch failed).
 */
export default function RefundActivityCard({ stats = null, totalCount = 0 }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Refund Activity</CardTitle>
        <CardDescription>
          Refunds across all bookings. Payouts are handled by the Front Office.
        </CardDescription>
      </CardHeader>
      {stats === null ? (
        <div className={EMPTY_STATE_CLASS}>
          Refund data unavailable right now. Use Sync Data to retry.
        </div>
      ) : totalCount === 0 ? (
        <div className={EMPTY_STATE_CLASS}>No refunds recorded yet.</div>
      ) : (
        <div className="grid divide-y divide-border border-t border-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <Tile
            icon={Undo2}
            label="Pending Requests"
            value={stats.pendingCount}
            sub={`${formatCurrencyPHP(stats.pendingAmount)} requested`}
          />
          <Tile
            icon={HandCoins}
            label="Approved, Awaiting Payout"
            value={stats.approvedCount}
            sub={`${formatCurrencyPHP(stats.approvedAmount)} ready to send`}
          />
          <Tile
            icon={ClockAlert}
            label="Pending 7+ Days"
            value={stats.stuckPending7d}
            sub={stats.stuckPending7d > 0 ? "Front Office follow-up needed" : "None overdue"}
            warning={stats.stuckPending7d > 0}
          />
          <Tile
            icon={Banknote}
            label="Paid (30 Days)"
            value={stats.paidLast30d?.count ?? 0}
            sub={`${formatCurrencyPHP(stats.paidLast30d?.total ?? 0)} sent out`}
          />
        </div>
      )}
    </Card>
  );
}
