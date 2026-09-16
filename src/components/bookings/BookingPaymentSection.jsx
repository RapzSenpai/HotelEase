import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, CreditCard, Upload } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import {
  calculatePartialPayment,
  getPaymentDetails,
  PROOF_REQUIRED_METHODS,
} from "@/lib/paymentDetails";

/**
 * Everything payment-related inside an expanded booking card: the folio, the
 * "payment required" panel with proof upload, and the proof-submitted /
 * simulated-payment confirmations.
 *
 * Deliberately PRESENTATIONAL: the payments list, the upload file and the
 * in-flight flag stay in BookingCard, because the Download Receipt action in
 * the card's footer CTA reads the same payment records. Moving that state here
 * would have meant either lifting it back up or relocating the receipt button,
 * both of which change behaviour for no gain. Markup is verbatim.
 */
export default function BookingPaymentSection({
  booking,
  status,
  total,
  paid,
  balance,
  deadlineStr,
  payments,
  paymentsLoading,
  paymentFile,
  onPaymentFileChange,
  uploadingProof,
  onUploadProof,
}) {
  const navigate = useNavigate();
  const payableAmount = booking.paymentType === "Partial" ? calculatePartialPayment(total) : total;

  return (
    <>
      {/* ── Payment folio ── */}
      <div className="rounded-lg border border-border bg-background p-2.5 space-y-2">
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-4 w-4 text-foreground/50" />
          <span className="text-sm font-semibold">Payment Folio</span>
        </div>

        {/* For OTC/Card + Pending status, show proof-exempt messaging instead of misleading ₱0 folio */}
        {(booking.paymentMethod === "Credit/Debit Card" || booking.paymentMethod === "Over-the-Counter") && status === "Pending" ? (
          <div className="rounded-md bg-background/80 border border-border px-3 py-2">
            <p className="text-xs text-foreground/50">Payment Status</p>
            <p className="text-sm font-semibold">
              {booking.paymentType === "Full"
                ? "Your full payment will be verified and recorded by Front Office. Your booking is pending FO review."
                : "Pay the remaining balance at the front desk upon arrival. Your booking is pending FO review."}
            </p>
            <p className="text-xs text-foreground/60 mt-1">
              Declared amount: PHP {payableAmount.toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-background/80 border border-border px-1 sm:px-2 py-2 min-w-0">
              <p className="text-xs text-foreground/50">Total</p>
              <p className="text-sm font-semibold break-words">
                PHP {total.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md bg-background/80 border border-border px-1 sm:px-2 py-2 min-w-0">
              <p className="text-xs text-foreground/50">Paid</p>
              <p className="text-sm font-semibold text-success break-words">
                PHP {paid.toLocaleString()}
              </p>
            </div>
            <div className="rounded-md bg-background/80 border border-border px-1 sm:px-2 py-2 min-w-0">
              <p className="text-xs text-foreground/50">Balance</p>
              <p
                className={`text-sm font-semibold break-words ${balance > 0 ? "text-destructive" : "text-success"}`}
              >
                PHP {balance.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Individual payment records */}
        {paymentsLoading ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : payments.length > 0 ? (
          <div className="space-y-1 pt-1">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">
              Payment Records
            </p>
            {payments.map((p) => {
              const ref =
                p.methodDetails?.referenceNumber ||
                p.methodDetails?.checkNumber ||
                p.methodDetails?.cardLast4 ||
                null;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 text-xs text-foreground/70 border-t border-border/50 pt-1"
                >
                  <span className="min-w-0 truncate">
                    PHP {Number(p.amount ?? 0).toLocaleString()} ·{" "}
                    {p.method || "—"}
                    {ref ? ` · ${ref}` : ""}
                  </span>
                  <span className="shrink-0 text-foreground/40">
                    {formatDateTime(p.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* ── Payment (Awaiting Payment status) ── */}
      {/* Phase 17.3: Only show payment UI for GCash and Bank Transfer methods.
          Primary path: simulated gateway checkout. Manual proof upload kept as fallback. */}
      {status === "Awaiting Payment" && PROOF_REQUIRED_METHODS.includes(booking.paymentMethod) && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-3">
          <div className="flex items-center gap-2 text-warning">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-semibold">Payment Required</span>
          </div>
          <p className="text-xs text-foreground/70">
            Complete payment by <span className="font-medium">{deadlineStr}</span> or this booking will be automatically cancelled.
          </p>

          {/* Primary: simulated gateway checkout */}
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/my-bookings/${booking.id}/pay`);
            }}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Pay Now — ₱{payableAmount.toLocaleString()} via {booking.paymentMethod}
          </Button>

          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-foreground/50">or upload proof manually</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onUploadProof} className="space-y-3">
            {/* Payment Method Display (read-only - locked from booking time) */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase text-foreground/70">Payment Method</span>
              <div className="text-sm font-medium">{booking.paymentMethod}</div>
            </div>

            {/* Payment Instructions */}
            <div className="rounded-md border border-border bg-background p-3 space-y-2">
              <div className="text-xs font-semibold">Payment Instructions</div>
              <div className="space-y-1.5 text-xs">
                <p>
                  Please send <span className="font-semibold">
                    ₱{payableAmount.toLocaleString()}
                  </span> via {booking.paymentMethod}:
                </p>
                {(() => {
                  const details = getPaymentDetails(booking.paymentMethod);
                  return (
                    <div className="space-y-1.5">
                      {details.number && (
                        <div className="flex items-center gap-2 bg-surface-hover p-1.5 rounded">
                          <span className="font-mono font-semibold text-sm">{details.number}</span>
                        </div>
                      )}
                      {details.bankName && (
                        <div className="space-y-0.5">
                          <div className="font-medium">{details.bankName}</div>
                          <div className="font-mono text-sm">{details.accountNumber}</div>
                          <div className="text-foreground/60">{details.accountName}</div>
                        </div>
                      )}
                      <p className="text-foreground/60">{details.instructions}</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Payment Type Display (read-only - locked from booking time) */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase text-foreground/70">Payment Type</span>
              <div className="text-sm font-medium">
                {booking.paymentType || "Full"} Payment (₱{payableAmount.toLocaleString()})
              </div>
            </div>

            {/* File Input */}
            <div className="space-y-2">
              <label htmlFor="proof-image" className="text-xs font-semibold uppercase text-foreground/70">Proof Image</label>
              <div className="relative">
                <input
                  id="proof-image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onPaymentFileChange(e.target.files?.[0] || null)}
                  className="w-full text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                  disabled={uploadingProof}
                />
              </div>
              {paymentFile && (
                <p className="text-xs text-foreground/60">
                  Selected: {paymentFile.name}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              size="sm"
              disabled={uploadingProof || !paymentFile}
              className="w-full sm:w-auto"
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploadingProof ? "Uploading..." : "Upload Payment Proof"}
            </Button>
          </form>
        </div>
      )}

      {/* ── Payment Proof Uploaded (Pending status) ── */}
      {status === "Pending" && booking.paymentProofUrl && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-semibold">Payment Proof Submitted</span>
          </div>
          <p className="text-xs text-foreground/70">
            Your payment proof has been uploaded and is awaiting Front Office verification.
          </p>
          {booking.paymentType && (
            <p className="text-xs text-foreground/60">
              Payment Type: <span className="font-medium">{booking.paymentType}</span>
            </p>
          )}
          {booking.proofUploadedAt && (
            <p className="text-xs text-foreground/50">
              Uploaded: {formatDateTime(booking.proofUploadedAt)}
            </p>
          )}
        </div>
      )}

      {/* ── Simulated Payment Completed (Pending status) ── */}
      {status === "Pending" && booking.paymentGateway === "simulated" && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-semibold">Simulated Payment Completed</span>
          </div>
          <p className="text-xs text-foreground/70">
            Your simulated {booking.paymentMethod} payment was received and is awaiting
            Front Office verification.
          </p>
          {booking.gatewayRef && (
            <p className="text-xs text-foreground/60">
              Reference Number:{" "}
              <span className="font-mono font-semibold">{booking.gatewayRef}</span>
            </p>
          )}
        </div>
      )}
    </>
  );
}
