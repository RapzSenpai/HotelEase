import { Badge } from "@/components/ui/badge";

/**
 * Payment history for the selected booking: the loading/error/empty states, the
 * list, and the running total.
 *
 * `formatMethod` moved with it — it was defined at module scope in the page and
 * used nowhere else. Markup is unchanged.
 */
function formatMethod(p) {
  // Check top-level `note` field first (written by updated paymentsService),
  // then fall back to legacy methodDetails sub-fields for older records.
  const ref =
    p.note ||
    p.methodDetails?.referenceNumber ||
    p.methodDetails?.checkNumber ||
    p.methodDetails?.cardLast4 ||
    null;
  return ref ? `${p.method || "—"} · ${ref}` : p.method || "—";
}

export default function CheckoutPaymentHistory({ payments, loading, error }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="font-semibold">Payment History</div>

      {loading ? (
        <div className="text-sm text-foreground/50">
          Loading payments...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
          <p className="font-medium">
            Could not load payment history.
          </p>
          <p className="mt-0.5 text-foreground/70">
            {error}
          </p>
        </div>
      ) : payments.length === 0 ? (
        <div className="text-sm text-foreground/60">
          No payments recorded yet for this booking.
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const ts = p.createdAt?.toDate
              ? p.createdAt.toDate()
              : null;
            const source = p.source || "fo_manual";
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">
                      PHP {Number(p.amount ?? 0).toLocaleString()}
                    </div>
                    <Badge
                      variant={source === "guest_proof" ? "success" : "outline"}
                      className="text-[10px]"
                    >
                      {source === "guest_proof" ? "Guest Upload" : "Front Desk"}
                    </Badge>
                  </div>
                  <div className="text-xs text-foreground/50 truncate">
                    {formatMethod(p)}
                  </div>
                </div>
                <div className="text-xs text-foreground/40 shrink-0 text-right">
                  {ts ? ts.toLocaleString() : "—"}
                </div>
              </div>
            );
          })}

          {/* Running total */}
          <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
            <span className="text-foreground/70">Total paid</span>
            <span>
              PHP{" "}
              {payments
                .reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
                .toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
