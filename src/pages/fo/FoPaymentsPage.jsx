import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "radix-ui";
import { listBookingsByStatuses } from "@/services/bookingsService";
import {
  listPaymentsForBooking,
  recordPayment,
} from "@/services/paymentsService";
import { listRooms } from "@/services/roomsService";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import { useAuth } from "@/contexts/AuthContext";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(tsLike) {
  try {
    const d = tsLike?.toDate ? tsLike.toDate() : new Date(tsLike);
    if (!d || isNaN(d)) return "—";
    return d.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function formatDateTime(tsLike) {
  try {
    const d = tsLike?.toDate ? tsLike.toDate() : new Date(tsLike);
    if (!d || isNaN(d)) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

/**
 * Build a human-readable reference string from a payment record.
 * Checks the top-level `note` field first (written by the updated service),
 * then falls back to legacy `methodDetails` sub-fields for older records.
 */
function paymentNote(p) {
  return (
    p.note ||
    p.methodDetails?.referenceNumber ||
    p.methodDetails?.checkNumber ||
    p.methodDetails?.cardLast4 ||
    null
  );
}

const METHOD_OPTIONS = ["Cash", "GCash", "Check", "Credit Card"];

// ── Main component ─────────────────────────────────────────────────────────────

export default function FoPaymentsPage() {
  const { trainingMode } = useAuth();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedBookingId, setSelectedBookingId] = useState("");

  const selectedBooking = useMemo(
    () => bookings.find((b) => b.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId],
  );

  // ── Payment history ───────────────────────────────────────────────────────
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState(null);

  // ── Payment form ──────────────────────────────────────────────────────────
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Derived folio values ──────────────────────────────────────────────────
  const depositFromBooking = Number(selectedBooking?.payment?.deposit ?? 0);
  const total = Number(selectedBooking?.totalCost ?? 0);
  const balance = Math.max(0, total - depositFromBooking);

  // ── Load bookings + rooms ─────────────────────────────────────────────────
  async function refreshBookings() {
    setLoading(true);
    setError(null);
    try {
      const [roomData, bookingData] = await Promise.all([
        listRooms(),
        listBookingsByStatuses(["Approved", "Checked In"], { trainingMode }),
      ]);
      setRooms(roomData);
      setBookings(bookingData);

      // Auto-select the first booking only on initial load
      if (!selectedBookingId && bookingData.length > 0) {
        setSelectedBookingId(bookingData[0].id);
      }
    } catch (e) {
      setError(e?.message || "Failed to load payments page.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingMode]);

  // ── Load payment history ──────────────────────────────────────────────────
  // Extracted into a named function so it can be called both from the
  // useEffect (on booking selection change) AND manually after recording.
  async function reloadPayments(bookingId) {
    const bid = bookingId ?? selectedBookingId;
    if (!bid) {
      setPayments([]);
      setPaymentsError(null);
      return;
    }
    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      const data = await listPaymentsForBooking(bid, { trainingMode });
      console.log(
        `[FoPaymentsPage] reloadPayments — bookingId: "${bid}", records: ${data.length}`,
        data,
      );
      setPayments(data);
    } catch (err) {
      console.error("[FoPaymentsPage] reloadPayments failed:", err);
      setPaymentsError(err?.message || "Failed to load payment history.");
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  }

  useEffect(() => {
    reloadPayments(selectedBookingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBookingId, trainingMode]);

  // ── Room lookup map ───────────────────────────────────────────────────────
  const roomById = useMemo(() => {
    const map = new Map();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  // ── Record payment ────────────────────────────────────────────────────────
  async function onAddPayment() {
    const amt = Number(amount);
    if (!selectedBookingId) return;
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Please enter a valid payment amount.");
      return;
    }
    if (amt > balance + 0.01) {
      setError(`Payment amount cannot exceed the remaining balance of ₱${balance.toLocaleString()}.`);
      return;
    }
    if (!method.trim()) {
      setError("Please select a payment method.");
      return;
    }

    try {
      setError(null);
      setSubmitting(true);

      console.log("[FoPaymentsPage] onAddPayment — calling recordPayment", {
        bookingId: selectedBookingId,
        amount: amt,
        method: method.trim(),
        note: note.trim() || null,
        trainingMode,
      });

      const result = await recordPayment({
        bookingId: selectedBookingId,
        amount: amt,
        method: method.trim(),
        // `note` covers any free-text reference regardless of method
        note: note.trim() || null,
        // Legacy per-method fields kept so older records are still usable
        referenceNumber: method === "GCash" ? note.trim() || null : null,
        checkNumber: method === "Check" ? note.trim() || null : null,
        trainingMode,
      });

      console.log("[FoPaymentsPage] recordPayment succeeded:", result);

      // 1. Reload bookings so the folio totals update
      await refreshBookings();

      // 2. Reload the payment history for this booking.
      //    refreshBookings() does NOT change selectedBookingId, so the
      //    useEffect above does NOT re-fire — we must call this explicitly.
      await reloadPayments(selectedBookingId);

      // 3. Clear form fields
      setAmount("");
      setNote("");
    } catch (e) {
      console.error("[FoPaymentsPage] onAddPayment error:", e);
      setError(e?.message || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Total paid derived from payment records (source of truth) ────────────
  const totalPaidFromRecords = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [payments],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Payments</h1>
        <p className="text-foreground/80">
          Record remaining balance payments and on-site charges for checked-in guests.
        </p>
      </div>

      {/* Error banner */}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-background p-5 text-sm text-foreground/70">
          Loading…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Left: booking list ── */}
          <div className="lg:col-span-2 space-y-3">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="font-semibold">Active Bookings</div>
              <div className="text-sm text-foreground/70 mt-1">
                Select a booking to record payment.
              </div>
            </div>

            {bookings.length === 0 ? (
              <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                No active bookings found.
              </div>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => {
                  const isActive = b.id === selectedBookingId;
                  const room = roomById.get(b.roomId);
                  const roomStatus = room?.status || "Available";
                  const bTotal = Number(b.totalCost ?? 0);
                  const bPaid = Number(b.payment?.deposit ?? 0);
                  const bBalance = Math.max(0, bTotal - bPaid);

                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setSelectedBookingId(b.id);
                        setError(null);
                      }}
                      className={`w-full text-left rounded-xl border border-border bg-background p-4 space-y-1.5 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        isActive ? "ring-2 ring-primary/40 shadow-sm" : ""
                      }`}
                    >
                      {/* Room name + status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold truncate">
                          {room?.name || room?.type || b.roomId}
                        </div>
                        <RoomStatusBadge status={roomStatus} />
                      </div>

                      {/* Dates */}
                      <div className="text-sm text-foreground/70">
                        {formatDate(b.checkInDate)} →{" "}
                        {formatDate(b.checkOutDate)}
                      </div>


                      {/* Balance */}
                      <div
                        className={`text-sm font-semibold ${
                          bBalance > 0 ? "text-destructive" : "text-success"
                        }`}
                      >
                        {bBalance > 0
                          ? `PHP ${bBalance.toLocaleString()} outstanding`
                          : "Paid in full"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: payment entry + history ── */}
          <div className="lg:col-span-3 space-y-4">
            {selectedBooking ? (
              <>
                {/* ── Folio summary ── */}
                <Card className="p-4 space-y-3">
                  <CardHeader className="p-0">
                    <div className="font-semibold">Folio Summary</div>
                  </CardHeader>
                  <CardContent className="p-0 space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <Card className="rounded-lg bg-background/50 p-3">
                        <CardContent className="p-0">
                          <div className="text-xs text-foreground/50 mb-1">
                            Total
                          </div>
                          <div className="text-sm font-semibold">
                            PHP {total.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="rounded-lg bg-background/50 p-3">
                        <CardContent className="p-0">
                          <div className="text-xs text-foreground/50 mb-1">
                            Paid
                          </div>
                          <div className="text-sm font-semibold text-success">
                            PHP {depositFromBooking.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="rounded-lg bg-background/50 p-3">
                        <CardContent className="p-0">
                          <div className="text-xs text-foreground/50 mb-1">
                            Outstanding
                          </div>
                          <div
                            className={`text-sm font-semibold ${
                              balance > 0 ? "text-destructive" : "text-success"
                            }`}
                          >
                            PHP {balance.toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {selectedBooking.nights ? (
                      <div className="text-xs text-center text-foreground/40">
                        {selectedBooking.nights} night
                        {selectedBooking.nights !== 1 ? "s" : ""} ·{" "}
                        {selectedBooking.paxCount ?? 1} pax ·{" "}
                        {selectedBooking.bookingType || "Online"}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {/* ── Record payment ── */}
                <Card className="p-4 space-y-4">
                  <CardHeader className="p-0">
                    <div className="font-semibold">Record Payment</div>
                  </CardHeader>
                  <CardContent className="p-0 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Amount */}
                      <div className="space-y-2">
                        <Label htmlFor="payAmount">Amount (PHP)</Label>
                        <Input
                          id="payAmount"
                          type="number"
                          min={1}
                          placeholder="e.g. 2500"
                          value={amount}
                          onChange={(e) => {
                            setAmount(e.target.value);
                            if (error) setError(null);
                          }}
                          disabled={submitting || balance <= 0}
                        />
                      </div>

                      {/* Method */}
                      <div className="space-y-2">
                        <Label htmlFor="payMethod">Method</Label>
                        <Select.Root
                          value={method}
                          onValueChange={(value) => setMethod(value)}
                          disabled={submitting || balance <= 0}
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

                    {/* Reference / Note */}
                    <div className="space-y-2">
                      <Label htmlFor="payNote">
                        {method === "GCash"
                          ? "GCash Reference Number"
                          : method === "Check"
                            ? "Check Number"
                            : method === "Credit Card"
                              ? "Last 4 Digits"
                              : "Reference / Note (optional)"}
                      </Label>
                      <Input
                        id="payNote"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={
                          method === "GCash"
                            ? "e.g. 09123456789-ref"
                            : method === "Check"
                              ? "e.g. CHK-00421"
                              : method === "Credit Card"
                                ? "e.g. 4242"
                                : "Optional note or reference"
                        }
                        disabled={submitting || balance <= 0}
                      />
                    </div>

                    <Button
                      className="w-full"
                      onClick={onAddPayment}
                      disabled={submitting || balance <= 0}
                    >
                      {submitting
                        ? "Recording…"
                        : balance <= 0
                          ? "Balance Fully Settled"
                          : "Add Payment"}
                    </Button>

                    {balance <= 0 ? (
                      <p className="text-xs text-center text-success">
                        This booking is fully paid and ready for checkout.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                {/* ── Payment history ── */}
                <Card className="p-4 space-y-3">
                  <CardHeader className="p-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">Payment History</div>
                      {payments.length > 0 ? (
                        <Badge variant="primary">
                          {payments.length} record
                          {payments.length !== 1 ? "s" : ""}
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 space-y-3">
                    {paymentsLoading ? (
                      <div className="text-sm text-foreground/50">
                        Loading payment records…
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
                        {payments.map((p, idx) => {
                          const ref = paymentNote(p);
                          const ts = formatDateTime(p.createdAt);
                          const isLatest = idx === 0;
                          const source = p.source || "fo_manual";

                          return (
                            <div
                              key={p.id}
                              className={`rounded-lg border bg-background/50 p-3 space-y-1 ${
                                isLatest ? "border-primary/30" : "border-border"
                              }`}
                            >
                              {/* Amount + method */}
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-sm">
                                  PHP {Number(p.amount ?? 0).toLocaleString()}
                                </span>
                                <span className="text-xs rounded-full bg-primary/15 border border-primary/20 px-2 py-0.5 font-medium">
                                  {p.method || "—"}
                                </span>
                              </div>

                              {/* Source badge */}
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant={source === "guest_proof" ? "success" : "outline"} 
                                  className="text-[10px]"
                                >
                                  {source === "guest_proof" ? "Guest Upload" : "Front Desk"}
                                </Badge>
                              </div>

                              {/* Reference / note */}
                              {ref ? (
                                <div className="text-xs text-foreground/60">
                                  Ref: {ref}
                                </div>
                              ) : null}

                              {/* Timestamp */}
                              <div className="text-xs text-foreground/40">
                                {ts}
                              </div>
                            </div>
                          );
                        })}

                        {/* Running total from payment records */}
                        <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                          <span className="text-foreground/70">
                            Total recorded
                          </span>
                          <span>PHP {totalPaidFromRecords.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="rounded-xl border border-border bg-background p-8 text-center text-sm text-foreground/50">
                Select a booking from the left to record payments and view
                history.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
