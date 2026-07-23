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

function formatDate(tsLike) {
  try {
    const d = tsLike?.toDate ? tsLike.toDate() : tsLike;
    if (!d) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

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
  const [paymentSuccess, setPaymentSuccess] = useState(false);
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
        console.log(
          `[FoCheckOutPage] loadPayments — bookingId: "${selectedBookingId}", records: ${data.length}`,
          data,
        );
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const roomById = useMemo(() => {
    const map = new Map();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  const selectedBooking = useMemo(
    () =>
      selectedBookingId
        ? (bookings.find((b) => b.id === selectedBookingId) ?? null)
        : null,
    [selectedBookingId, bookings],
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
      ratePerNight: booking.nights > 0 ? booking.totalCost / booking.nights : 0,
      total: booking.totalCost,
      subtotal: booking.totalCost,
      amountPaid: totalPaid,
      balance: Math.max(0, booking.totalCost - totalPaid),
      paymentMethod: latestPayment?.method || booking.payment?.method || "N/A",
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
        console.log(
          `[FoCheckOutPage] refreshAll — reloaded payments for "${bid}", records: ${data.length}`,
          data,
        );
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

      console.log("[FoCheckOutPage] onRecordPayment — calling recordPayment", {
        bookingId: selectedBookingId,
        amount,
        method: paymentMethod,
        note: paymentRef || null,
        trainingMode,
      });

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

      console.log("[FoCheckOutPage] recordPayment succeeded:", result);

      setLastReceiptData(result.receiptData);
      setPaymentSuccess(true);
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
          <div className="lg:col-span-2 space-y-3">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="font-semibold">Checked-in bookings</div>
              <div className="mt-1 text-sm text-foreground/70">
                {roomIdParam ? "Filtered by room." : "All rooms."}
              </div>
            </div>

            {bookings.length === 0 ? (
              <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                No bookings to check out.
              </div>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => {
                  const room = roomById.get(b.roomId);
                  const total = Number(b.totalCost ?? 0);
                  const paid = Number(b.payment?.deposit ?? 0);
                  const balance = Math.max(0, total - paid);
                  const active = selectedBookingId === b.id;
                  const guestName =
                    guestsMap[b.guestId]?.fullName ||
                    guestsMap[b.guestId]?.email ||
                    b.guestName ||
                    "Guest";
                  const roomName = room?.name || room?.type || b.roomId;

                  return (
                    <div
                      key={b.id}
                      className={`rounded-xl border border-border bg-background p-3 space-y-2 transition-shadow ${
                        active ? "ring-2 ring-primary/40 shadow-sm" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-semibold text-sm truncate">
                            {guestName}
                          </div>
                          <div className="text-xs text-foreground/55 truncate">
                            {roomName}
                          </div>
                        </div>
                        <div
                          className={`text-xs font-semibold shrink-0 ${
                            balance > 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          {balance > 0
                            ? `PHP ${balance.toLocaleString()} due`
                            : "Paid"}
                        </div>
                      </div>

                      <Button
                        variant={active ? "default" : "outline"}
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSelectedBookingId(b.id);
                          setError(null);
                        }}
                      >
                        {active ? "Selected" : "Select for Checkout"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right panel: folio + payment ── */}
          <div className="lg:col-span-3 space-y-3">
            {selectedBooking ? (
              <>
                {/* Folio summary */}
                <Card className="p-4 space-y-3">
                  <CardHeader className="p-0">
                    <div className="font-semibold">Folio Summary</div>
                  </CardHeader>
                  <CardContent className="p-0">
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
                  </CardContent>

                  {selectedBooking.nights ? (
                    <div className="text-xs text-foreground/50 text-center">
                      {selectedBooking.nights} night
                      {selectedBooking.nights !== 1 ? "s" : ""} ·{" "}
                      {selectedBooking.paxCount ?? 1} pax
                    </div>
                  ) : null}
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
                        onClick={() => setPaymentSuccess(false)}
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
    </div>
  );
}
