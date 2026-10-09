import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  listBookingsByStatuses,
  checkOutBooking,
  extendStayBooking,
  addOverstayFee,
  getOverdueDays} from "@/services/bookingsService";
import {
  listPaymentsForBooking,
  recordPayment} from "@/services/paymentsService";
import { generateReceipt } from "@/services/receiptService";
import { listRooms } from "@/services/roomsService";
import { getUserDoc } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent, GA_EVENTS } from "@/services/gaService";
import { toast } from "sonner";
import { roomLabel } from "@/lib/room-label";
import CheckoutBookingList from "@/components/fo/CheckoutBookingList";
import CheckoutExtendStayDialog from "@/components/fo/CheckoutExtendStayDialog";
import CheckoutOverstayFeeDialog from "@/components/fo/CheckoutOverstayFeeDialog";
import CheckoutPaymentHistory from "@/components/fo/CheckoutPaymentHistory";
import CheckoutFolioPanel from "@/components/fo/CheckoutFolioPanel";
import CheckoutPaymentPanel from "@/components/fo/CheckoutPaymentPanel";

export default function FoCheckOutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomIdParam = searchParams.get("roomId");
  const { profile} = useAuth();

  // ── Bookings + rooms ──────────────────────────────────────────────────────
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [guestsMap, setGuestsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // P2 scalability: on-demand guest objects instead of the whole users list.
  // Shape matches the old map ({ id, fullName, email, ... }); null = resolved.
  const guestsMapRef = useRef({});
  // Generation guard: reset bumps this, so a slow lookup resolving after a
  // training-mode switch can't write stale names into the fresh cache.
  const guestsGenRef = useRef(0);

  async function ensureGuestObjects(list) {
    const missing = [...new Set(list.map((b) => b.guestId).filter(Boolean))]
      .filter((id) => !(id in guestsMapRef.current));
    if (missing.length === 0) return;
    const gen = guestsGenRef.current;
    const entries = await Promise.all(
      missing.map(async (id) => {
        try {
          const d = await getUserDoc(id);
          return [id, d ? { id, ...d } : null];
        } catch {
          return [id, null];
        }
      }));
    if (gen !== guestsGenRef.current) return;
    entries.forEach(([id, obj]) => {
      guestsMapRef.current[id] = obj;
    });
    setGuestsMap({ ...guestsMapRef.current });
  }

  // ── Selected booking ──────────────────────────────────────────────────────
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  // ── Payment form fields ───────────────────────────────────────────────────
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  // One key per form intent: double-clicks share it and collapse to one doc.
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [lastReceiptData, setLastReceiptData] = useState(null);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  // ── Payment history for selected booking ──────────────────────────────────
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState(null);

  // Live paid totals per booking id (sum of payment records). Single money
  // source for every balance shown — never booking.payment.deposit.
  // ponytail: one query per visible booking, per-list map if this ever pages.
  const [paidTotals, setPaidTotals] = useState({});

  async function refreshPaidTotals(list) {
    if (!list.length) {
      setPaidTotals({});
      return;
    }
    try {
      const entries = await Promise.all(
        list.map(async (b) => {
          try {
            const recs = await listPaymentsForBooking(b.id);
            return [b.id, recs.reduce((s, p) => s + Number(p.amount ?? 0), 0)];
          } catch {
            return [b.id, 0];
          }
        }));
      setPaidTotals(Object.fromEntries(entries));
    } catch {
      setPaidTotals({});
    }
  }

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        // Guest cache is per-mode: a uid can exist in both collections.
        guestsGenRef.current += 1;
        guestsMapRef.current = {};
        setGuestsMap({});
        const [roomData, bookingData] = await Promise.all([
          listRooms(),
          listBookingsByStatuses(["Checked In"]),
        ]);
        if (!isMounted) return;
        setRooms(roomData);
        const visible = roomIdParam
          ? bookingData.filter((b) => b.roomId === roomIdParam)
          : bookingData;
        setBookings(visible);
        ensureGuestObjects(visible);
        refreshPaidTotals(visible);
      } catch (e) {
        if (!isMounted) return;
        setError(e?.message || "Failed to load check-out data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
    // ensureGuestObjects is a stable per-render helper over refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdParam]);

  // ── Load payment history whenever selected booking changes ────────────────
  useEffect(() => {
    if (!selectedBookingId) {
      setPayments([]);
      setPaymentsLoading(false);
      setPaymentsError(null);
      return;
    }
    let isMounted = true;
    async function loadPayments() {
      setPaymentsLoading(true);
      setPaymentsError(null);
      try {
        const data = await listPaymentsForBooking(selectedBookingId);
        if (!isMounted) return;
        setPayments(data);
      } catch (err) {
        if (!isMounted) return;
        console.error("[FoCheckOutPage] loadPayments failed:", err);
        setPaymentsError(err?.message || "Failed to load payment history.");
        setPayments([]);
      } finally {
        if (isMounted) setPaymentsLoading(false);
      }
    }
    loadPayments();
    return () => {
      isMounted = false;
    };
  }, [selectedBookingId]);

  // ── Stay Extension & Overstay Fee Modal State ─────────────────────────────
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);

  const [feeDialogOpen, setFeeDialogOpen] = useState(false);

  const [filterMode, setFilterMode] = useState("all"); // "all" | "overdue"

  // ── Derived ───────────────────────────────────────────────────────────────
  const roomById = useMemo(() => {
    const map = new Map();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  // Enrich bookings with overdue info and sort overdue to top
  const enrichedBookings = useMemo(() => {
    return bookings.map((b) => {
      const overdueDays = getOverdueDays(b.checkOutDate);
      return {
        ...b,
        isOverdue: overdueDays > 0,
        overdueDays};
    }).sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return (b.overdueDays || 0) - (a.overdueDays || 0);
    });
  }, [bookings]);

  const displayedBookings = useMemo(() => {
    if (filterMode === "overdue") {
      return enrichedBookings.filter((b) => b.isOverdue);
    }
    return enrichedBookings;
  }, [enrichedBookings, filterMode]);

  const overdueCount = useMemo(() => {
    return enrichedBookings.filter((b) => b.isOverdue).length;
  }, [enrichedBookings]);

  const selectedBooking = useMemo(
    () =>
      selectedBookingId
        ? (enrichedBookings.find((b) => b.id === selectedBookingId) ?? null)
        : null,
    [selectedBookingId, enrichedBookings]);

  // Single money source: live payments sum for this booking. Folio
  // Outstanding, gate, prefill and receipt all derive from here so
  // list/detail/history can't disagree.
  const selectedPaid = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [payments]);

  const selectedBalance = useMemo(() => {
    const total = Number(selectedBooking?.totalCost ?? 0);
    return Math.max(0, total - selectedPaid);
  }, [selectedBooking, selectedPaid]);

  // Build receipt data from booking and payment records
  function buildReceiptData(booking, paymentRecords) {
    const guest = guestsMap[booking.guestId];
    const room = roomById.get(booking.roomId);
    const totalPaid = paymentRecords.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const latestPayment = paymentRecords.length > 0 ? paymentRecords[0] : null;
    
    return {
      receiptNo: latestPayment?.receiptNo || "RCP-" + Date.now(),
      guestName: guest?.fullName || guest?.email || booking.guestName || "Guest",
      guestEmail: guest?.email || booking.guestEmail || "",
      roomName: room?.name || "Room",
      roomType: room?.type || "",
      checkIn: booking.checkInDate?.toDate?.() || booking.checkInDate,
      checkOut: booking.checkOutDate?.toDate?.() || booking.checkOutDate,
      numberOfNights: booking.nights,
      ratePerNight: booking.nights > 0 ? Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0) - (booking.overstayFee || 0))) / booking.nights : 0,
      baseTotal: Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0) - (booking.overstayFee || 0))),
      extraPaxCount: Number(booking.extraPaxCount ?? 0),
      extraPaxFee: Number(booking.extraPaxFee ?? 0),
      extraPaxTotal: Number(booking.extraPaxTotal ?? 0),
      total: booking.totalCost,
      subtotal: booking.totalCost,
      overstayFee: Number(booking.overstayFee ?? 0),
      overstayReason: booking.overstayReason || "Late checkout fee",
      amountPaid: totalPaid,
      balance: Math.max(0, booking.totalCost - totalPaid),
      paymentMethod: latestPayment?.method || booking.payment?.method || "N/A",
      gatewayRef: booking.gatewayRef || null,
      bankRef: booking.bankRef || null,
      reference: latestPayment?.note || latestPayment?.methodDetails?.referenceNumber || latestPayment?.methodDetails?.checkNumber || latestPayment?.methodDetails?.cardLast4 || null,
      simulated: paymentRecords.some((p) => p.source === "simulated_gateway") || booking.paymentGateway === "simulated",
      paymentDate: latestPayment?.createdAt?.toDate?.() || new Date(),
      processedBy: latestPayment?.processedBy || profile?.fullName || profile?.email || "Front Office Staff"};
  }

  // Pre-fill payment amount with outstanding balance when booking is selected
  useEffect(() => {
    if (paymentsLoading || paymentsError || selectedBookingId === null) return;
    if (selectedBookingId) {
      setPaymentAmount(String(selectedBalance > 0 ? selectedBalance : ""));
    }
  }, [selectedBookingId, selectedBalance, paymentsLoading, paymentsError]);

  // ── Refresh bookings list + payment history ───────────────────────────────
  async function refreshAll(bookingId) {
    const [roomData, bookingData] = await Promise.all([
      listRooms(),
      listBookingsByStatuses(["Checked In"]),
    ]);
    setRooms(roomData);
    const visible = roomIdParam
      ? bookingData.filter((b) => b.roomId === roomIdParam)
      : bookingData;
    setBookings(visible);
    ensureGuestObjects(visible);
    refreshPaidTotals(visible);

    // Reload payment history for the same booking.
    // Explicit null skips the reload (used after checkout clears selection).
    const bid = bookingId !== undefined ? bookingId : selectedBookingId;
    if (bid) {
      setPaymentsLoading(true);
      setPaymentsError(null);
      try {
        const data = await listPaymentsForBooking(bid);
        setPayments(data);
        setPaymentsError(null);
      } catch (err) {
        console.error(
          "[FoCheckOutPage] refreshAll payment reload failed:",
          err);
        setPaymentsError(err?.message || "Failed to load payment history.");
        setPayments([]);
      } finally {
        setPaymentsLoading(false);
      }
    }
  }

  // ── Extend Stay handler ───────────────────────────────────────────────────
  // The dialog owns the date field, its validation and the cost preview; this
  // stays the write, and must reject so the dialog can show the failure.
  async function handleExtendStay({ checkOutDate, addedNights, dailyRate, expectedCheckOutDate = null }) {
    const rate = Number(dailyRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("Room rate is missing — cannot price the extension.");
    }
    const billed = Math.max(1, addedNights);
    await extendStayBooking(selectedBookingId, {
      newCheckOutDate: checkOutDate,
      additionalCost: rate * billed,
      expectedCheckOutDate});
    toast.success(`Stay extended by ${billed} night(s). Folio updated.`);
    setExtendDialogOpen(false);
    await refreshAll(selectedBookingId);
  }

  // ── Add Overstay / Late Fee handler ───────────────────────────────────────
  // The dialog owns the fields, the quick amounts and the validation; this
  // stays the write, and must reject so the dialog can show the failure.
  async function handleAddOverstayFee({ amount, reason }) {
    await addOverstayFee(selectedBookingId, {
      feeAmount: amount,
      feeReason: reason});
    toast.success(`Added ₱${amount.toLocaleString()} fee to guest folio.`);
    setFeeDialogOpen(false);
    await refreshAll(selectedBookingId);
  }

  // ── Record payment ────────────────────────────────────────────────────────
  async function onRecordPayment() {
    if (!selectedBookingId) return;
    if (paymentsLoading) {
      setError("Payment history is still loading.");
      return;
    }
    if (paymentsError) {
      setError("Payment history could not be loaded. Please retry before recording payment.");
      return;
    }
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Please enter a valid payment amount.");
      return;
    }
    if (amount > selectedBalance + 0.01) {
      setError(`Payment amount cannot exceed the remaining balance of ₱${selectedBalance.toLocaleString()}.`);
      return;
    }

    try {
      setError(null);
      setSubmitting(true);

      const guest = guestsMap[selectedBooking.guestId];
      const room = roomById.get(selectedBooking.roomId);

      const result = await recordPayment({
        bookingId: selectedBookingId,
        amount,
        method: paymentMethod,
        // Pass as both `note` (new field) and `referenceNumber` (legacy)
        note: paymentRef || null,
        referenceNumber: paymentRef || null,
        idempotencyKey: idempotencyKeyRef.current,
        // Receipt info
        guestName: guest?.fullName || guest?.email || selectedBooking.guestName || "Guest",
        guestEmail: guest?.email || "",
        roomName: room?.name || "Room",
        roomType: room?.type || "",
        processedBy: profile?.fullName || profile?.email || "Front Office Staff"});

      setLastReceiptData(result.receiptData);
      setPaymentRef("");
      idempotencyKeyRef.current = crypto.randomUUID();
      await refreshAll(selectedBookingId);
    } catch (e) {
      console.error("[FoCheckOutPage] onRecordPayment error:", e);
      setError(e?.message || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Generate receipt on-demand ─────────────────────────────────────────────
  // Folio for receipt actions: fresh payment first, else built from records.
  function getFolioForReceipt() {
    if (lastReceiptData) return lastReceiptData;
    if (selectedBooking && payments.length > 0) {
      return buildReceiptData(selectedBooking, payments);
    }
    return null;
  }

  async function onDownloadReceipt() {
    if (!selectedBooking) return;
    try {
      setGeneratingReceipt(true);
      const receiptData = getFolioForReceipt();

      if (receiptData) {
        generateReceipt(receiptData);
      } else {
        setError("No payment data available to generate receipt.");
      }
    } catch (e) {
      console.error("[FoCheckOutPage] onDownloadReceipt error:", e);
      setError(e?.message || "Failed to generate receipt.");
    } finally {
      setGeneratingReceipt(false);
    }
  }

  // ── Check out ─────────────────────────────────────────────────────────────
  async function onCheckOut() {
    if (!selectedBookingId) return;
    if (selectedBalance > 0) {
      setError("Outstanding balance remains. Record payment first.");
      return;
    }

    try {
      setError(null);
      setCheckingOut(true);
      await checkOutBooking(selectedBookingId);
      trackEvent(GA_EVENTS.CHECK_OUT, { booking_id: selectedBookingId });
      setSelectedBookingId(null);
      await refreshAll(null);
      setPayments([]);
      setPaymentsError(null);
      setLastReceiptData(null);
      navigate(`/fo/housekeeping?roomId=${roomIdParam || ""}`);
    } catch (e) {
      setError(e?.message || "Check-out failed.");
    } finally {
      setCheckingOut(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Check-Out</h1>
        <p className="text-foreground/80">
          Settle the guest folio, record payment, and finalize checkout.
        </p>
      </div>

      {/* Error banner */}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">
          Loading bookings...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Left panel: booking list ── */}
          <CheckoutBookingList
            roomIdParam={roomIdParam}
            totalCount={enrichedBookings.length}
            overdueCount={overdueCount}
            filterMode={filterMode}
            onFilterChange={setFilterMode}
            bookings={displayedBookings}
            selectedBookingId={selectedBookingId}
            paidTotals={paidTotals}
            onSelect={(id) => {
              if (selectedBookingId !== id) {
                setPayments([]);
                setPaymentsLoading(true);
                setPaymentsError(null);
              }
              setSelectedBookingId(id);
              setError(null);
              setLastReceiptData(null);
            }}
            guestsMap={guestsMap}
            roomById={roomById}
          />

          {/* ── Right panel: folio + payment ── */}
          <div className="lg:col-span-3 space-y-3">
            {selectedBooking ? (
              <>
                {/* Overdue callout + folio summary */}
                <CheckoutFolioPanel
                  booking={selectedBooking}
                  balance={selectedBalance}
                  paid={selectedPaid}
                  onExtendStay={() => setExtendDialogOpen(true)}
                  onAddFee={() => setFeeDialogOpen(true)}
                />

                {/* Record payment or Success state */}
                <CheckoutPaymentPanel
                  balance={selectedBalance}
                  submitting={submitting}
                  loading={paymentsLoading || !!paymentsError}
                  hasReceipt={!!lastReceiptData}
                  generatingReceipt={generatingReceipt}
                  values={{ amount: paymentAmount, method: paymentMethod, ref: paymentRef }}
                  onChange={{
                    amount: setPaymentAmount,
                    method: setPaymentMethod,
                    ref: setPaymentRef}}
                  onSubmit={onRecordPayment}
                  onDownloadReceipt={onDownloadReceipt}
                  onDismissReceipt={() => setLastReceiptData(null)}
                />

                {/* Payment history */}
                <CheckoutPaymentHistory
                  payments={payments}
                  loading={paymentsLoading}
                  error={paymentsError}
                />

                {/* Finalize checkout */}
                <div className="rounded-xl border border-border bg-background p-4 space-y-2">
                  <div className="font-semibold">Finalize Checkout</div>
                  {selectedBalance > 0 ? (
                    <p className="text-sm text-destructive/80">
                      Cannot check out — PHP {selectedBalance.toLocaleString()}{" "}
                      still outstanding.
                    </p>
                  ) : null}
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={onCheckOut}
                    disabled={checkingOut || submitting || selectedBalance > 0}
                  >
                    {checkingOut ? "Checking out..." : "Check Out"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/fo")}
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-border bg-background p-8 text-center text-sm text-foreground/50">
                Select a checked-in booking from the left to view its folio and
                record payment.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Extend Stay Dialog ── */}
      <CheckoutExtendStayDialog
        open={extendDialogOpen}
        onOpenChange={setExtendDialogOpen}
        booking={selectedBooking}
        guestName={selectedBooking?.guestId && !(selectedBooking.guestId in guestsMap) ? "…" : (guestsMap[selectedBooking?.guestId]?.fullName || selectedBooking?.guestName || "Guest")}
        roomName={roomLabel(roomById.get(selectedBooking?.roomId), "—")}
        dailyRate={Number(roomById.get(selectedBooking?.roomId)?.ratePerNight ?? 0)}
        onSubmit={handleExtendStay}
      />

      {/* ── Add Overstay Fee Dialog ── */}
      <CheckoutOverstayFeeDialog
        open={feeDialogOpen}
        onOpenChange={setFeeDialogOpen}
        booking={selectedBooking}
        roomRate={Number(roomById.get(selectedBooking?.roomId)?.ratePerNight ?? 0)}
        onSubmit={handleAddOverstayFee}
      />

    </div>
  );
}
