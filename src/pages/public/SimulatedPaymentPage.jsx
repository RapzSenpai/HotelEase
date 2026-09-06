import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageLoader from "@/components/common/PageLoader";
import { useAuth } from "@/contexts/AuthContext";
import { getBooking } from "@/services/bookingsService";
import { getRoom } from "@/services/roomsService";
import { completeSimulatedPayment } from "@/services/paymentGatewayService";
import { calculatePartialPayment } from "@/lib/paymentDetails";
import { mapFirebaseError } from "@/lib/errors";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";

function formatDate(tsLike) {
  try {
    const d = tsLike?.toDate ? tsLike.toDate() : new Date(tsLike);
    if (!d || isNaN(d)) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
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
  const { trainingMode } = useAuth();

  const [booking, setBooking] = useState(null);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [successRef, setSuccessRef] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const b = await getBooking(bookingId, { trainingMode });
        if (cancelled) return;
        if (!b) {
          toast.error("Booking not found.");
          navigate("/my-bookings", { replace: true });
          return;
        }
        setBooking(b);
        if (b.roomId) {
          const r = await getRoom(b.roomId, { trainingMode }).catch(() => null);
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
  }, [bookingId, trainingMode, navigate]);

  const amountDue = booking
    ? booking.paymentType === "Partial"
      ? calculatePartialPayment(Number(booking.totalCost ?? 0))
      : Number(booking.totalCost ?? 0)
    : 0;

  async function handleConfirmPayment() {
    setProcessing(true);
    try {
      const res = await completeSimulatedPayment({ bookingId, trainingMode });
      // Brief pause so the processing state reads as a gateway handshake.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setSuccessRef(res.gatewayRef);
      toast.success("Payment successful!");
    } catch (e) {
      toast.error(mapFirebaseError(e) || "Payment failed. Please try again.");
    } finally {
      setProcessing(false);
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
          <CheckCircle2 className="h-14 w-14 text-success mx-auto" />
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
  return (
    <div className="mx-auto max-w-lg px-4 py-10 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/my-bookings")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Simulated Payment</h1>
        <Badge variant="warning" className="ml-auto">
          Sandbox
        </Badge>
      </div>

      {/* Sandbox notice */}
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground/70">
        <ShieldCheck className="h-4 w-4 shrink-0 text-warning mt-0.5" />
        <p>
          This is a <span className="font-semibold">simulated checkout</span> for demonstration
          purposes — no real money will be charged and no external payment platform is contacted.
        </p>
      </div>

      {/* Booking summary */}
      <div className="rounded-xl border border-border bg-background p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="text-base font-semibold">Payment Summary</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="space-y-0.5">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">Room</p>
            <p className="font-medium">{room?.name || room?.type || "Room"}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-foreground/50 uppercase tracking-wide">Booking ID</p>
            <p className="font-mono font-medium text-sm">{bookingId}</p>
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
            <p className="font-medium">{booking.paymentMethod}</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/10 p-3">
          <div>
            <p className="text-xs text-foreground/50 uppercase tracking-wide">
              Amount Due ({booking.paymentType || "Full"} Payment)
            </p>
            <p className="text-2xl font-bold tabular-nums">
              PHP {amountDue.toLocaleString()}
            </p>
          </div>
          <Clock className="h-5 w-5 text-foreground/30" />
        </div>
      </div>

      {/* Confirm */}
      <div className="rounded-xl border border-border bg-background p-5 space-y-3">
        <Button
          size="lg"
          className="w-full"
          disabled={processing}
          onClick={handleConfirmPayment}
        >
          {processing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing payment…
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Confirm Payment — PHP {amountDue.toLocaleString()}
            </>
          )}
        </Button>
        <p className="text-xs text-foreground/50 text-center">
          By confirming, a payment reference will be generated and your booking will move
          to <span className="font-medium">Pending</span> for Front Office verification.
        </p>
      </div>
    </div>
  );
}
