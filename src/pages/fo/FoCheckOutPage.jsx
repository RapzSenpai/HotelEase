import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { CheckCircle, AlertTriangle, CalendarPlus, DollarSign, Calendar, ArrowUpDown, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { listRooms } from "@/services/roomsService";
import { listUsers } from "@/services/userService";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent, GA_EVENTS } from "@/services/gaService";
import { toast } from "sonner";
import CheckoutBookingList from "@/components/fo/CheckoutBookingList";

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
  const [newCheckOutDate, setNewCheckOutDate] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState(null);

  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [customFeeAmount, setCustomFeeAmount] = useState("");
  const [customFeeReason, setCustomFeeReason] = useState("Overstay / Late Check-Out Fee");
  const [addingFee, setAddingFee] = useState(false);
  const [feeError, setFeeError] = useState(null);

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
  async function handleExtendStay() {
    if (!selectedBookingId || !newCheckOutDate) {
      setExtendError("Please select a new check-out date.");
      return;
    }
    const currentOut = selectedBooking.checkOutDate?.toDate?.() || new Date(selectedBooking.checkOutDate);
    const chosenOut = new Date(`${newCheckOutDate}T00:00:00`);
    if (chosenOut <= currentOut) {
      setExtendError("New check-out date must be after current check-out date.");
      return;
    }

    const room = roomById.get(selectedBooking.roomId);
    const dailyRate = room?.ratePerNight ? Number(room.ratePerNight) : 0;
    const addedDays = Math.round((chosenOut.getTime() - currentOut.getTime()) / (1000 * 60 * 60 * 24));
    const additionalCost = dailyRate * Math.max(1, addedDays);

    try {
      setExtending(true);
      setExtendError(null);
      await extendStayBooking(selectedBookingId, {
        newCheckOutDate: chosenOut,
        additionalCost,
        trainingMode,
      });
      toast.success(`Stay extended by ${addedDays} night(s). Folio updated.`);
      setExtendDialogOpen(false);
      setNewCheckOutDate("");
      await refreshAll(selectedBookingId);
    } catch (e) {
      setExtendError(e?.message || "Failed to extend stay.");
    } finally {
      setExtending(false);
    }
  }

  // ── Add Overstay / Late Fee handler ───────────────────────────────────────
  async function handleAddOverstayFee() {
    const fee = Number(customFeeAmount);
    if (!Number.isFinite(fee) || fee <= 0) {
      setFeeError("Please enter a valid positive fee amount.");
      return;
    }

    try {
      setAddingFee(true);
      setFeeError(null);
      await addOverstayFee(selectedBookingId, {
        feeAmount: fee,
        feeReason: customFeeReason,
        trainingMode,
      });
      toast.success(`Added ₱${fee.toLocaleString()} fee to guest folio.`);
      setFeeDialogOpen(false);
      setCustomFeeAmount("");
      await refreshAll(selectedBookingId);
    } catch (e) {
      setFeeError(e?.message || "Failed to add overstay fee.");
    } finally {
      setAddingFee(false);
    }
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
                {/* Overdue Warning Callout */}
                {selectedBooking.isOverdue && (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Overdue Stay Alert: {selectedBooking.overdueDays} day(s) past check-out deadline</span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      This guest was scheduled to check out on{" "}
                      <strong>
                        {selectedBooking.checkOutDate?.toDate
                          ? selectedBooking.checkOutDate.toDate().toLocaleDateString()
                          : new Date(selectedBooking.checkOutDate).toLocaleDateString()}
                      </strong>
                      . You can contact the guest, add an overstay penalty fee, extend their stay if the room is free, or finalize their checkout.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex items-center gap-1.5 border-destructive/30 hover:bg-destructive/15 text-destructive"
                        onClick={() => {
                          setFeeDialogOpen(true);
                          setFeeError(null);
                        }}
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        Add Overstay Fee
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex items-center gap-1.5 border-primary/40 hover:bg-primary/10 text-primary"
                        onClick={() => {
                          setExtendDialogOpen(true);
                          setExtendError(null);
                        }}
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Extend Stay
                      </Button>
                    </div>
                  </div>
                )}

                {/* Folio summary */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <CardHeader className="p-0">
                      <div className="font-semibold text-base">Folio Summary</div>
                    </CardHeader>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex items-center gap-1"
                        onClick={() => {
                          setExtendDialogOpen(true);
                          setExtendError(null);
                        }}
                      >
                        <CalendarPlus className="h-3 w-3" />
                        Extend Stay
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex items-center gap-1"
                        onClick={() => {
                          setFeeDialogOpen(true);
                          setFeeError(null);
                        }}
                      >
                        <DollarSign className="h-3 w-3" />
                        Add Fee
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-0 space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <Card className="rounded-lg bg-background/50 p-3">
                        <CardContent className="p-0">
                          <div className="text-xs text-foreground/50 mb-1">
                            Total
                          </div>
                          <div className="font-semibold text-sm">
                            PHP{" "}
                            {Number(
                              selectedBooking.totalCost ?? 0,
                            ).toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="rounded-lg bg-background/50 p-3">
                        <CardContent className="p-0">
                          <div className="text-xs text-foreground/50 mb-1">
                            Paid
                          </div>
                          <div className="font-semibold text-sm text-success">
                            PHP{" "}
                            {Number(
                              selectedBooking.payment?.deposit ?? 0,
                            ).toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="rounded-lg bg-background/50 p-3">
                        <CardContent className="p-0">
                          <div className="text-xs text-foreground/50 mb-1">
                            Outstanding
                          </div>
                          <div
                            className={`font-semibold text-sm ${
                              selectedBalance > 0
                                ? "text-destructive"
                                : "text-success"
                            }`}
                          >
                            PHP {selectedBalance.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Folio itemized breakdown */}
                    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-foreground/70">
                        <span>Base Room Rate ({selectedBooking.nights} night{selectedBooking.nights !== 1 ? "s" : ""}):</span>
                        <span className="font-medium">
                          PHP {Number(selectedBooking.baseTotal ?? (selectedBooking.totalCost - (selectedBooking.extraPaxTotal || 0) - (selectedBooking.overstayFee || 0))).toLocaleString()}
                        </span>
                      </div>
                      {selectedBooking.extraPaxTotal > 0 && (
                        <div className="flex items-center justify-between text-primary font-medium">
                          <span>Extra Guests ({selectedBooking.extraPaxCount} pax):</span>
                          <span>+PHP {Number(selectedBooking.extraPaxTotal).toLocaleString()}</span>
                        </div>
                      )}
                      {selectedBooking.overstayFee > 0 && (
                        <div className="flex items-center justify-between text-destructive font-semibold">
                          <span>{selectedBooking.overstayReason || "Overstay / Late Fee"}:</span>
                          <span>+PHP {Number(selectedBooking.overstayFee).toLocaleString()}</span>
                        </div>
                      )}
                      {selectedBooking.isExtended && (
                        <div className="flex items-center justify-between text-info text-[11px]">
                          <span>Stay Extension:</span>
                          <span>+{selectedBooking.extendedNights || 1} extended night(s)</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

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
                <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                  <div className="font-semibold">Payment History</div>

                  {paymentsLoading ? (
                    <div className="text-sm text-foreground/50">
                      Loading payments...
                    </div>
                  ) : paymentsError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
                      <p className="font-medium">
                        Could not load payment history.
                      </p>
                      <p className="mt-0.5 text-foreground/70">
                        {paymentsError}
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
      <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              Extend Guest Stay
            </DialogTitle>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4 py-2 text-sm">
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-foreground/60">Guest:</span>
                  <span className="font-semibold">{guestsMap[selectedBooking.guestId]?.fullName || selectedBooking.guestName || "Guest"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Room:</span>
                  <span className="font-semibold">{roomById.get(selectedBooking.roomId)?.name || selectedBooking.roomId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/60">Current Check-out:</span>
                  <span className="font-semibold">
                    {selectedBooking.checkOutDate?.toDate
                      ? selectedBooking.checkOutDate.toDate().toLocaleDateString()
                      : new Date(selectedBooking.checkOutDate).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newCheckOutDate">New Check-out Date</Label>
                <Input
                  id="newCheckOutDate"
                  type="date"
                  min={(() => {
                    const d = selectedBooking.checkOutDate?.toDate
                      ? selectedBooking.checkOutDate.toDate()
                      : new Date(selectedBooking.checkOutDate);
                    const nextDay = new Date(d);
                    nextDay.setDate(nextDay.getDate() + 1);
                    return nextDay.toISOString().split("T")[0];
                  })()}
                  value={newCheckOutDate}
                  onChange={(e) => {
                    setNewCheckOutDate(e.target.value);
                    if (extendError) setExtendError(null);
                  }}
                />
              </div>

              {newCheckOutDate && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1 text-xs">
                  {(() => {
                    const currentOut = selectedBooking.checkOutDate?.toDate
                      ? selectedBooking.checkOutDate.toDate()
                      : new Date(selectedBooking.checkOutDate);
                    const chosenOut = new Date(`${newCheckOutDate}T00:00:00`);
                    const addedNights = Math.max(0, Math.round((chosenOut.getTime() - currentOut.getTime()) / (1000 * 60 * 60 * 24)));
                    const room = roomById.get(selectedBooking.roomId);
                    const dailyRate = Number(room?.ratePerNight ?? 0);
                    const addedTotal = dailyRate * addedNights;

                    return (
                      <>
                        <div className="flex justify-between text-foreground/70">
                          <span>Additional Nights:</span>
                          <span className="font-semibold">{addedNights} night{addedNights !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex justify-between text-foreground/70">
                          <span>Nightly Rate:</span>
                          <span>PHP {dailyRate.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-primary font-bold border-t border-border/40 pt-1">
                          <span>Additional Charge:</span>
                          <span>+PHP {addedTotal.toLocaleString()}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {extendError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                  {extendError}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExtendDialogOpen(false)}
              disabled={extending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleExtendStay}
              disabled={extending || !newCheckOutDate}
            >
              {extending ? "Extending..." : "Confirm Extension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Overstay Fee Dialog ── */}
      <Dialog open={feeDialogOpen} onOpenChange={setFeeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-destructive" />
              Add Overstay / Late Check-Out Fee
            </DialogTitle>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4 py-2 text-sm">
              <p className="text-xs text-foreground/70 leading-relaxed">
                Add an incidental charge or late checkout penalty to this booking folio. It will be added to the outstanding balance and itemized on the official receipt.
              </p>

              <div className="space-y-2">
                <Label htmlFor="feeReason">Fee Reason / Description</Label>
                <Input
                  id="feeReason"
                  value={customFeeReason}
                  onChange={(e) => setCustomFeeReason(e.target.value)}
                  placeholder="e.g. Overstay Penalty / Late Departure Fee"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feeAmount">Fee Amount (PHP)</Label>
                <Input
                  id="feeAmount"
                  type="number"
                  min={1}
                  value={customFeeAmount}
                  onChange={(e) => {
                    setCustomFeeAmount(e.target.value);
                    if (feeError) setFeeError(null);
                  }}
                  placeholder="e.g. 500"
                />
              </div>

              {/* Quick suggestion buttons */}
              <div className="space-y-1">
                <span className="text-[11px] text-foreground/50">Quick amounts:</span>
                <div className="flex gap-2">
                  {[300, 500, 1000].map((amt) => (
                    <Button
                      key={amt}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2.5"
                      onClick={() => setCustomFeeAmount(String(amt))}
                    >
                      ₱{amt.toLocaleString()}
                    </Button>
                  ))}
                  {roomById.get(selectedBooking.roomId)?.ratePerNight && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2.5"
                      onClick={() => {
                        const halfDay = Math.round(Number(roomById.get(selectedBooking.roomId).ratePerNight) / 2);
                        setCustomFeeAmount(String(halfDay));
                        setCustomFeeReason("Late Check-Out Fee (Half Day)");
                      }}
                    >
                      Half Day (₱{Math.round(Number(roomById.get(selectedBooking.roomId).ratePerNight) / 2).toLocaleString()})
                    </Button>
                  )}
                </div>
              </div>

              {feeError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                  {feeError}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFeeDialogOpen(false)}
              disabled={addingFee}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleAddOverstayFee}
              disabled={addingFee || !customFeeAmount}
            >
              {addingFee ? "Adding..." : "Add Fee to Folio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
