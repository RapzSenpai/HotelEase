import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "radix-ui";
import {
  listBookingsByStatuses,
  checkOutBooking,
  extendStayBooking,
  addOverstayFee,
  getOverdueDays,
} from "@/services/bookingsService";
import {
  listPaymentsForBooking,
  recordPayment,
} from "@/services/paymentsService";
import { generateReceipt } from "@/services/receiptService";
import { CheckCircle } from "lucide-react";
import { listRooms } from "@/services/roomsService";
import { listUsers } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent, GA_EVENTS } from "@/services/gaService";
import { toast } from "sonner";
import CheckoutBookingList from "@/components/fo/CheckoutBookingList";
import CheckoutExtendStayDialog from "@/components/fo/CheckoutExtendStayDialog";
import CheckoutOverstayFeeDialog from "@/components/fo/CheckoutOverstayFeeDialog";
import CheckoutPaymentHistory from "@/components/fo/CheckoutPaymentHistory";
import CheckoutFolioPanel from "@/components/fo/CheckoutFolioPanel";

const METHOD_OPTIONS = ["Cash", "GCash", "Check", "Credit Card"];

export default function FoCheckOutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomIdParam = searchParams.get("roomId");
  const { profile, trainingMode } = useAuth();

  // ── Bookings + rooms ──────────────────────────────────────────────────────
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [guestsMap, setGuestsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Selected booking ──────────────────────────────────────────────────────
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  // ── Payment form fields ───────────────────────────────────────────────────
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastReceiptData, setLastReceiptData] = useState(null);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  // ── Payment history for selected booking ──────────────────────────────────
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState(null);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [roomData, bookingData, userData] = await Promise.all([
          listRooms(),
          listBookingsByStatuses(["Checked In"], { trainingMode }),
          listUsers({ trainingMode }),
        ]);
        if (!isMounted) return;
        setRooms(roomData);

        const gMap = {};
        userData.forEach((u) => {
          gMap[u.id || u.uid] = u;
        });
        setGuestsMap(gMap);
        setBookings(
          roomIdParam
            ? bookingData.filter((b) => b.roomId === roomIdParam)
            : bookingData,
        );
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
  }, [roomIdParam, trainingMode]);

  // ── Load payment history whenever selected booking changes ────────────────
  useEffect(() => {
    if (!selectedBookingId) {
      setPayments([]);
      setPaymentsError(null);
      return;
    }
    let isMounted = true;
    async function loadPayments() {
      setPaymentsLoading(true);
      setPaymentsError(null);
      try {
        const data = await listPaymentsForBooking(selectedBookingId, {
          trainingMode,
        });
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
  }, [selectedBookingId, trainingMode]);

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
        overdueDays,
      };
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
    [selectedBookingId, enrichedBookings],
  );

  const selectedBalance = useMemo(() => {
    const total = Number(selectedBooking?.totalCost ?? 0);
    const paid = Number(selectedBooking?.payment?.deposit ?? 0);
    return Math.max(0, total - paid);
  }, [selectedBooking]);

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
      ratePerNight: booking.nights > 0 ? Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0))) / booking.nights : 0,
      baseTotal: Number(booking.baseTotal ?? (booking.totalCost - (booking.extraPaxTotal || 0))),
      extraPaxCount: Number(booking.extraPaxCount ?? 0),
      extraPaxFee: Number(booking.extraPaxFee ?? 0),
      extraPaxTotal: Number(booking.extraPaxTotal ?? 0),
      total: booking.totalCost,
      subtotal: booking.totalCost,
      overstayFee: Number(booking.overstayFee ?? 0),
      overstayReason: booking.overstayReason || "Overstay / Late Check-Out Fee",
      amountPaid: totalPaid,
      balance: Math.max(0, booking.totalCost - totalPaid),
      paymentMethod: latestPayment?.method || booking.payment?.method || "N/A",
      simulated: paymentRecords.some((p) => p.source === "simulated_gateway") || booking.paymentGateway === "simulated",
      paymentDate: latestPayment?.createdAt?.toDate?.() || new Date(),
      processedBy: latestPayment?.processedBy || profile?.fullName || profile?.email || "Front Office Staff",
    };
  }

  // Pre-fill payment amount with outstanding balance when booking is selected
  useEffect(() => {
    if (selectedBookingId) {
      setPaymentAmount(String(selectedBalance > 0 ? selectedBalance : ""));
    }
  }, [selectedBookingId, selectedBalance]);

  // ── Refresh bookings list + payment history ───────────────────────────────
  async function refreshAll(bookingId) {
    const [roomData, bookingData] = await Promise.all([
      listRooms(),
      listBookingsByStatuses(["Checked In"], { trainingMode }),
    ]);
    setRooms(roomData);
    setBookings(
      roomIdParam
        ? bookingData.filter((b) => b.roomId === roomIdParam)
        : bookingData,
    );

    // Reload payment history for the same booking
    const bid = bookingId ?? selectedBookingId;
    if (bid) {
      try {
        const data = await listPaymentsForBooking(bid, { trainingMode });
        setPayments(data);
        setPaymentsError(null);
      } catch (err) {
        console.error(
          "[FoCheckOutPage] refreshAll payment reload failed:",
          err,
        );
        setPaymentsError(err?.message || "Failed to load payment history.");
        setPayments([]);
      }
    }
  }

  // ── Extend Stay handler ───────────────────────────────────────────────────
  // The dialog owns the date field, its validation and the cost preview; this
  // stays the write, and must reject so the dialog can show the failure.
  async function handleExtendStay({ checkOutDate, addedNights, dailyRate }) {
    await extendStayBooking(selectedBookingId, {
      newCheckOutDate: checkOutDate,
      additionalCost: dailyRate * Math.max(1, addedNights),
      trainingMode,
    });
    toast.success(`Stay extended by ${addedNights} night(s). Folio updated.`);
    setExtendDialogOpen(false);
    await refreshAll(selectedBookingId);
  }

  // ── Add Overstay / Late Fee handler ───────────────────────────────────────
  // The dialog owns the fields, the quick amounts and the validation; this
  // stays the write, and must reject so the dialog can show the failure.
  async function handleAddOverstayFee({ amount, reason }) {
    await addOverstayFee(selectedBookingId, {
      feeAmount: amount,
      feeReason: reason,
      trainingMode,
    });
    toast.success(`Added ₱${amount.toLocaleString()} fee to guest folio.`);
    setFeeDialogOpen(false);
    await refreshAll(selectedBookingId);
  }

  // ── Record payment ────────────────────────────────────────────────────────
  async function onRecordPayment() {
    if (!selectedBookingId) return;
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
        trainingMode,
        // Receipt info
        guestName: guest?.fullName || guest?.email || selectedBooking.guestName || "Guest",
        guestEmail: guest?.email || "",
        roomName: room?.name || "Room",
        roomType: room?.type || "",
        processedBy: profile?.fullName || profile?.email || "Front Office Staff",
      });

      setLastReceiptData(result.receiptData);
      setPaymentRef("");
      await refreshAll(selectedBookingId);
    } catch (e) {
      console.error("[FoCheckOutPage] onRecordPayment error:", e);
      setError(e?.message || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Generate receipt on-demand ─────────────────────────────────────────────
  async function onDownloadReceipt() {
    if (!selectedBooking) return;
    
    try {
      setGeneratingReceipt(true);
      
      // Use existing receipt data if available (from recent payment), otherwise build from payment records
      let receiptData = lastReceiptData;
      if (!receiptData && payments.length > 0) {
        receiptData = buildReceiptData(selectedBooking, payments);
      }
      
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
      setSubmitting(true);
      await checkOutBooking(selectedBookingId, { trainingMode });
      trackEvent(GA_EVENTS.CHECK_OUT, { booking_id: selectedBookingId });
      const finishedId = selectedBookingId;
      setSelectedBookingId(null);
      setPayments([]);
      await refreshAll(finishedId);
      navigate(`/fo/housekeeping?roomId=${roomIdParam || ""}`);
    } catch (e) {
      setError(e?.message || "Check-out failed.");
    } finally {
      setSubmitting(false);
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
            onSelect={(id) => {
              setSelectedBookingId(id);
              setError(null);
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
                  onExtendStay={() => setExtendDialogOpen(true)}
                  onAddFee={() => setFeeDialogOpen(true)}
                />

                {/* Record payment or Success state */}
                {selectedBalance <= 0 ? (
                  <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center space-y-4">
                    <div className="flex justify-center">
                      <CheckCircle className="h-12 w-12 text-success" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-success">
                        Payment Successful!
                      </h3>
                      <p className="text-sm text-foreground/70">
                        You can now download the official receipt or proceed to checkout.
                      </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={onDownloadReceipt}
                        disabled={generatingReceipt}
                      >
                        {generatingReceipt ? "Generating..." : "Download Receipt"}
                      </Button>
                      <Button
                        variant="default"
                        className="flex-1"
                        onClick={() => setLastReceiptData(null)}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-background p-4 space-y-4">
                    <div className="font-semibold">Record Payment</div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="payAmount">Amount (PHP)</Label>
                        <Input
                          id="payAmount"
                          type="number"
                          min={1}
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          disabled={submitting || selectedBalance <= 0}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payMethod">Method</Label>
                        <Select.Root
                          value={paymentMethod}
                          onValueChange={(value) => setPaymentMethod(value)}
                          disabled={submitting || selectedBalance <= 0}
                        >
                          <Select.Trigger
                            id="payMethod"
                            className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                          >
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                              <Select.Viewport>
                                {METHOD_OPTIONS.map((m) => (
                                  <Select.Item
                                    key={m}
                                    value={m}
                                    className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                                  >
                                    <Select.ItemText>{m}</Select.ItemText>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="payRef">
                        {paymentMethod === "GCash"
                          ? "GCash Reference Number"
                          : paymentMethod === "Check"
                            ? "Check Number"
                            : paymentMethod === "Credit Card"
                              ? "Last 4 Digits"
                              : "Reference / Note (optional)"}
                      </Label>
                      <Input
                        id="payRef"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        placeholder={
                          paymentMethod === "GCash"
                            ? "e.g. 09123456789-ref"
                            : paymentMethod === "Check"
                              ? "e.g. CHK-00421"
                              : paymentMethod === "Credit Card"
                                ? "e.g. 4242"
                                : "Optional note or reference"
                        }
                        disabled={submitting || selectedBalance <= 0}
                       />
                    </div>

                    <Button
                      variant="default"
                      className="w-full"
                      onClick={onRecordPayment}
                      disabled={submitting || selectedBalance <= 0}
                    >
                      {submitting ? "Processing..." : "Record Payment"}
                    </Button>
                  </div>
                )}

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
                    disabled={submitting || selectedBalance > 0}
                  >
                    {submitting ? "Checking out..." : "Check Out"}
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
        guestName={guestsMap[selectedBooking?.guestId]?.fullName || selectedBooking?.guestName || "Guest"}
        roomName={roomById.get(selectedBooking?.roomId)?.name || selectedBooking?.roomId}
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
