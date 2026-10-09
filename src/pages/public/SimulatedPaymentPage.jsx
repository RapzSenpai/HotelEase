import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PageLoader from "@/components/common/PageLoader";
import { getBooking } from "@/services/bookingsService";
import { getRoom } from "@/services/roomsService";
import { completeSimulatedPayment } from "@/services/paymentGatewayService";
import { calculatePartialPayment, getPaymentDetails } from "@/lib/paymentDetails";
import PaymentMethodIcon from "@/components/common/PaymentMethodIcon";
import { mapFirebaseError } from "@/lib/errors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Landmark,
  Loader2,
  ShieldCheck,
  Users} from "lucide-react";


/**
 * Bank details + reference input. Bank Transfer only.
 * Same card shape as the rest of checkout so the UI stays consistent.
 */
function BankTransferPanel({
  amountDue,
  bankRef,
  bankRefError,
  processing,
  onBankRefChange,
  onCopy,
  onConfirm}) {
  const details = getPaymentDetails("Bank Transfer");
  return (
    <div className="rounded-xl border border-border bg-background p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-primary" />
        <span className="text-base font-semibold">Hotel Bank Details</span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground/50">Bank</span>
          <span className="font-medium text-right">{details.bankName}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground/50">Account number</span>
          <span className="flex items-center gap-2">
            <span className="font-mono font-semibold">{details.accountNumber}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onCopy(details.accountNumber)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground/50">Account name</span>
          <span className="font-medium text-right">{details.accountName}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground/50">Amount to send</span>
          <span className="font-semibold">PHP {amountDue.toLocaleString()}</span>
        </div>
      </div>
      <ol className="space-y-1.5 text-sm text-foreground/70">
        <li>1. Copy the account details above for practice.</li>
        <li>2. Type any demo reference below. No real transfer happens here.</li>
        <li>3. Confirm to finish the demo payment.</li>
      </ol>
      <div className="space-y-2">
        <Label htmlFor="bankRef" className="text-sm font-medium">
          Your bank reference number
        </Label>
        <Input
          id="bankRef"
          placeholder="e.g. 1234567890"
          maxLength={32}
          value={bankRef}
          onChange={(e) => onBankRefChange(e.target.value)}
          disabled={processing}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
          }}
        />
        {bankRefError ? (
          <p className="text-xs text-destructive">{bankRefError}</p>
        ) : (
          <p className="text-xs text-foreground/50">Demo only. 4 to 32 characters.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Simulated gateway checkout (sandbox provider).
 *
 * Mimics the GCash / Bank Transfer payment flow entirely inside HotelEase —
 * no real money moves and no external API is called. Branded as "Simulated
 * Payment" so it can never be mistaken for a real GCash/bank page.
 */
export default function SimulatedPaymentPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [successRef, setSuccessRef] = useState(null);
  const [bankRef, setBankRef] = useState("");
  const [bankRefError, setBankRefError] = useState(null);
  const [successBankRef, setSuccessBankRef] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const b = await getBooking(bookingId);
        if (cancelled) return;
        if (!b) {
          toast.error("Booking not found.");
          navigate("/my-bookings", { replace: true });
          return;
        }
        setBooking(b);
        if (b.roomId) {
          const r = await getRoom(b.roomId).catch(() => null);
          if (!cancelled) setRoom(r);
        }
      } catch (e) {
        if (!cancelled) toast.error(mapFirebaseError(e) || "Failed to load booking.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [bookingId, navigate]);

  const amountDue = booking
    ? booking.paymentType === "Partial"
      ? calculatePartialPayment(Number(booking.totalCost ?? 0))
      : Number(booking.totalCost ?? 0)
    : 0;

  const isBank = booking?.paymentMethod === "Bank Transfer";

  async function handleConfirmPayment() {
    if (isBank) {
      const trimmed = bankRef.trim();
      if (trimmed.length < 4 || trimmed.length > 32) {
        setBankRefError("Enter a demo reference, 4 to 32 characters.");
        return;
      }
      setBankRefError(null);
    }
    setProcessing(true);
    try {
      const res = await completeSimulatedPayment({
        bookingId,
        userBankRef: isBank ? bankRef.trim() : undefined});
      // Brief pause so the processing state reads as a gateway handshake.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setSuccessRef(res.gatewayRef);
      setSuccessBankRef(res.bankRef || (isBank ? bankRef.trim() : null));
      toast.success("Payment successful!");
    } catch (e) {
      toast.error(mapFirebaseError(e) || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  function handleCopy(text) {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast.success("Copied."),
        () => toast.error("Copy failed. Copy it manually.")
      );
    }
  }

  if (loading) {
    return <PageLoader />;
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (successRef) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-xl border border-success/30 bg-success/10 p-8 space-y-4 text-center">
          <div className="flex justify-center">
            <PaymentMethodIcon method={booking?.paymentMethod} className="h-14 w-14" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Payment Successful</h1>
            <p className="text-sm text-foreground/70">
              Your simulated {booking?.paymentMethod} payment was completed.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3 space-y-1">
            <p className="text-xs uppercase tracking-wide text-foreground/50">
              Reference Number
            </p>
            <p className="font-mono font-semibold text-lg">{successRef}</p>
            {successBankRef ? (
              <p className="text-xs text-foreground/60">
                Bank ref: <span className="font-mono font-semibold">{successBankRef}</span>
              </p>
            ) : null}
          </div>
          <p className="text-xs text-foreground/60">
            Front Office staff will verify your payment and approve the booking. Keep this
            reference number for your records.
          </p>
          <Button className="w-full" onClick={() => navigate("/my-bookings")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to My Bookings
          </Button>
        </div>
      </div>
    );
  }

  // ── Not awaiting payment ────────────────────────────────────────────────
  if (!booking || booking.status !== "Awaiting Payment") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-8 space-y-4 text-center">
          <Clock className="h-12 w-12 text-warning mx-auto" />
          <h1 className="text-xl font-bold">Nothing to pay here</h1>
          <p className="text-sm text-foreground/70">
            This booking is not awaiting payment. It may have already been paid,
            expired, or handled by the Front Office.
          </p>
          <Button variant="outline" className="w-full" onClick={() => navigate("/my-bookings")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to My Bookings
          </Button>
        </div>
      </div>
    );
  }

  // ── Checkout ────────────────────────────────────────────────────────────
  // Bank flow runs two columns on desktop (bank details left, summary
  // right); single column otherwise. GCash keeps the narrow layout.
  return (
    <div className={`mx-auto px-4 py-6 sm:py-10 space-y-4 ${isBank ? "max-w-4xl" : "max-w-lg"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/my-bookings")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Payment Checkout</h1>
        {booking.paymentMethod ? (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-foreground/70">
            <PaymentMethodIcon method={booking.paymentMethod} className="h-4 w-4" />
            {booking.paymentMethod}
          </span>
        ) : null}
      </div>

      {/* Simulated payment notice — single source of truth for the sandbox state */}
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground/70">
        <ShieldCheck className="h-4 w-4 shrink-0 text-warning mt-0.5" />
        <p>
          This is a <span className="font-semibold">simulated checkout</span> for demonstration
          purposes — no real money will be charged and no external payment platform is contacted.
        </p>
      </div>

      {/* Booking summary + bank details: side by side on desktop for bank */}
      <div className={isBank ? "grid gap-4 lg:grid-cols-2 lg:items-stretch" : "space-y-4"}>
      {/* Bank panel first in DOM so visual, tab, and reading order align */}
      {isBank ? (
        <div>
          <BankTransferPanel
            amountDue={amountDue}
            bankRef={bankRef}
            bankRefError={bankRefError}
            processing={processing}
            onBankRefChange={(v) => {
              setBankRef(v);
              if (bankRefError) setBankRefError(null);
            }}
            onCopy={handleCopy}
            onConfirm={handleConfirmPayment}
          />
        </div>
      ) : null}
      <div className="space-y-4">
      <div className="rounded-xl border border-border bg-background p-5 sm:p-6 space-y-4 lg:h-full lg:flex lg:flex-col">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="text-base font-semibold">Payment Summary</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">
          <div className="space-y-0.5">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">Room</p>
            <p className="font-medium">{room?.name || room?.type || "Room"}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">Booking ID</p>
            <p className="font-mono font-medium text-sm break-all min-w-0">{bookingId}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">Check-in</p>
            <p className="font-medium flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-foreground/50" />
              {formatDate(booking.checkInDate)}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">Check-out</p>
            <p className="font-medium flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-foreground/50" />
              {formatDate(booking.checkOutDate)}
            </p>
          </div>
          {booking.paxCount ? (
            <div className="space-y-0.5">
              <p className="text-xs text-foreground/50 uppercase tracking-wide">Guests</p>
              <p className="font-medium flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-foreground/50" />
                {booking.paxCount}
              </p>
            </div>
          ) : null}
          <div className="space-y-0.5">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">Method</p>
            <p className="font-medium flex items-center gap-1.5">
              <PaymentMethodIcon method={booking.paymentMethod} className="h-4 w-4" />
              {booking.paymentMethod}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/10 p-3 sm:p-4">
          <div className="min-w-0">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">
              Amount Due ({booking.paymentType || "Full"} Payment)
            </p>
            <p className="text-xl sm:text-2xl font-bold tabular-nums break-words">
              PHP {amountDue.toLocaleString()}
            </p>
          </div>
          <Clock className="h-5 w-5 shrink-0 text-foreground/30" />
        </div>

        {/* Confirm — merged into the summary card, below Amount Due */}
        <Button
          size="sm"
          className="w-full h-auto min-h-8 whitespace-normal py-1.5 text-center leading-snug lg:mt-auto"
          disabled={processing || (isBank && bankRef.trim().length < 4)}
          onClick={handleConfirmPayment}
        >
          {processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing payment…
            </>
          ) : isBank ? (
            <>
              <Landmark className="mr-2 h-4 w-4 shrink-0" />
              Confirm Bank Transfer
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4 shrink-0" />
              Confirm {booking.paymentMethod} Payment
            </>
          )}
        </Button>
        <p className="text-xs text-foreground/50 text-center">
          By confirming, a payment reference will be generated and your booking will move
          to <span className="font-medium">Pending</span> for Front Office verification.
        </p>
      </div>
      </div>

      </div>
    </div>
  );
}
