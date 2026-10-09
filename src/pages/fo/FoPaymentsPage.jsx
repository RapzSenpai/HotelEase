import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { roomLabel as roomNameFor } from "@/lib/room-label";
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
import { getUserDoc } from "@/services/userService";
import { Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent, GA_EVENTS } from "@/services/gaService";

// ── Helpers ────────────────────────────────────────────────────────────────────



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

// Short "Oct 6" form — the list column is narrow and full dates crop the total.
function formatShortDate(v) {
  const d = v?.toDate?.() || (v ? new Date(v) : null);
  if (!(d instanceof Date) || isNaN(d)) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  const [searchQuery, setSearchQuery] = useState("");

  // Guest-name cache mirror (same pattern as FoBookingsPage): on-demand
  // getUserDoc per visible guest so the list shows people, not rooms.
  const [guestsMap, setGuestsMap] = useState({});
  const guestsMapRef = useRef({});
  const guestsGenerationRef = useRef(0);

  async function ensureGuestNames(list) {
    const generation = guestsGenerationRef.current;
    const missing = [...new Set(list.map((b) => b.guestId).filter(Boolean))]
      .filter((id) => !(id in guestsMapRef.current));
    if (missing.length === 0) return;
    const entries = await Promise.all(
      missing.map(async (id) => {
        try {
          const d = await getUserDoc(id, { preferTraining: trainingMode });
          return [id, d?.fullName || d?.email || ""];
        } catch {
          return [id, ""];
        }
      }),
    );
    if (generation !== guestsGenerationRef.current) return;
    entries.forEach(([id, name]) => {
      guestsMapRef.current[id] = name;
    });
    setGuestsMap({ ...guestsMapRef.current });
  }

  const selectedBooking = useMemo(
    () => bookings.find((b) => b.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId],
  );

  // ── Payment history ───────────────────────────────────────────────────────
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState(null);
  const paymentsRequestRef = useRef(0);

  // Live paid totals per booking id (sum of payment records). Single money
  // source for every balance shown — never booking.payment.deposit.
  // ponytail: one query per visible booking, per-list map if this ever pages.
  const [paidTotals, setPaidTotals] = useState({});

  // ── Payment form ──────────────────────────────────────────────────────────
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // One key per form intent: double-clicks share it and collapse to one doc.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  // ── Derived folio values (live payment records are the source of truth) ──
  const total = Number(selectedBooking?.totalCost ?? 0);
  const totalPaidFromRecords = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [payments],
  );
  const balance = Math.max(0, total - totalPaidFromRecords);

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
      ensureGuestNames(bookingData);
      try {
        const entries = await Promise.all(
          bookingData.map(async (b) => {
            try {
              const recs = await listPaymentsForBooking(b.id, {
                trainingMode,
              });
              return [b.id, recs.reduce((s, p) => s + Number(p.amount ?? 0), 0)];
            } catch {
              return [b.id, 0];
            }
          }),
        );
        setPaidTotals(Object.fromEntries(entries));
      } catch {
        setPaidTotals({});
      }

      // Auto-select the first booking only on initial load.
      // Flag the payment list loading synchronously: the prefill effect
      // below must not run against the stale (empty) records and lock the
      // amount to the full total before the reload lands.
      if (!selectedBookingId && bookingData.length > 0) {
        setPaymentsLoading(true);
        setSelectedBookingId(bookingData[0].id);
      }
    } catch (e) {
      setError(e?.message || "Failed to load payments page.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    guestsGenerationRef.current += 1;
    guestsMapRef.current = {};
    setGuestsMap({});
    refreshBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingMode]);

  // ── Load payment history ──────────────────────────────────────────────────
  // Extracted into a named function so it can be called both from the
  // useEffect (on booking selection change) AND manually after recording.
  async function reloadPayments(bookingId) {
    const requestId = ++paymentsRequestRef.current;
    const bid = bookingId ?? selectedBookingId;
    if (!bid) {
      setPayments([]);
      setPaymentsError(null);
      setPaymentsLoading(false);
      return;
    }
    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      const data = await listPaymentsForBooking(bid, { trainingMode });
      if (requestId !== paymentsRequestRef.current) return;
      setPayments(data);
    } catch (err) {
      if (requestId !== paymentsRequestRef.current) return;
      console.error("[FoPaymentsPage] reloadPayments failed:", err);
      setPaymentsError(err?.message || "Failed to load payment history.");
      setPayments([]);
    } finally {
      if (requestId === paymentsRequestRef.current) setPaymentsLoading(false);
    }
  }

  useEffect(() => {
    reloadPayments(selectedBookingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBookingId, trainingMode]);

  // Pre-fill the amount with the outstanding balance once records load —
  // FO usually collects the full remainder. Never overwrites typed input.
  useEffect(() => {
    if (paymentsLoading || !selectedBooking || amount !== "") return;
    const owed = Math.round((total - totalPaidFromRecords) * 100) / 100;
    if (owed > 0) setAmount(String(owed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentsLoading, payments, selectedBookingId]);

  // ── Room lookup map ───────────────────────────────────────────────────────
  const roomById = useMemo(() => {
    const map = new Map();
    for (const r of rooms) map.set(r.id, r);
    return map;
  }, [rooms]);

  function mapBalance(b) {
    return Math.max(
      0,
      Number(b.totalCost ?? 0) - Number(paidTotals[b.id] ?? 0),
    );
  }

  // ── Sorted + filtered list ────────────────────────────────────────────────
  // Outstanding balances stay on top, Paid in Full below. The balance key
  // comes from the paidTotals map for EVERY row (never the detail records),
  // so ordering never jumps when selecting a booking or recording a payment
  // — refreshBookings() refreshes the map after each payment.
  const visibleBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const toMs = (v) => {
      const d = v?.toDate?.() || (v ? new Date(v) : null);
      const ms = d instanceof Date && !isNaN(d) ? d.getTime() : 0;
      return ms;
    };
    return bookings
      .filter((b) => {
        if (!q) return true;
        const guest = guestsMap[b.guestId] || b.guestName || "";
        const room = roomById.get(b.roomId);
        const roomLabel = roomNameFor(room, "");
        return (
          String(guest).toLowerCase().includes(q) ||
          String(b.guestId || "").toLowerCase().includes(q) ||
          String(roomLabel).toLowerCase().includes(q) ||
          String(b.id || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aOwes = mapBalance(a) > 0.005 ? 0 : 1;
        const bOwes = mapBalance(b) > 0.005 ? 0 : 1;
        if (aOwes !== bOwes) return aOwes - bOwes;
        const dt = toMs(a.checkInDate) - toMs(b.checkInDate);
        if (dt !== 0) return dt;
        return String(a.id).localeCompare(String(b.id));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, paidTotals, guestsMap, rooms, searchQuery]);

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

      await recordPayment({
        bookingId: selectedBookingId,
        amount: amt,
        method: method.trim(),
        // `note` covers any free-text reference regardless of method
        note: note.trim() || null,
        // Legacy per-method fields kept so older records are still usable
        referenceNumber: method === "GCash" ? note.trim() || null : null,
        checkNumber: method === "Check" ? note.trim() || null : null,
        trainingMode,
        idempotencyKey: idempotencyKeyRef.current,
      });

      trackEvent(GA_EVENTS.PAYMENT_SUCCESS, {
        booking_id: selectedBookingId,
        currency: "PHP",
        value: amt,
        payment_method: method.trim(),
      });

      // 1. Reload bookings so the folio totals update
      await refreshBookings();

      // 2. Reload the payment history for this booking.
      //    refreshBookings() does NOT change selectedBookingId, so the
      //    useEffect above does NOT re-fire — we must call this explicitly.
      await reloadPayments(selectedBookingId);

      // 3. Clear form fields
      setAmount("");
      setNote("");
      idempotencyKeyRef.current = crypto.randomUUID();
    } catch (e) {
      console.error("[FoPaymentsPage] onAddPayment error:", e);
      setError(e?.message || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  }

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
            <div className="font-semibold">
              Active Bookings{bookings.length > 0 ? ` (${bookings.length})` : ""}
            </div>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40 pointer-events-none group-focus-within:text-primary transition-colors" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guest or room…"
                className="pl-9 border-border bg-background text-sm"
                aria-label="Search bookings"
              />
            </div>

            {visibleBookings.length === 0 ? (
              <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                {bookings.length === 0
                  ? "No active bookings found."
                  : "No bookings match your search."}
              </div>
            ) : (
              <div className="space-y-2">
                {visibleBookings.map((b) => {
                  const isActive = b.id === selectedBookingId;
                  const room = roomById.get(b.roomId);
                  const bTotal = Number(b.totalCost ?? 0);
                  const bPaid =
                    b.id === selectedBookingId && !paymentsLoading
                      ? totalPaidFromRecords
                      : Number(paidTotals[b.id] ?? 0);
                  const bBalance = Math.max(0, bTotal - bPaid);
                  const guestName =
                    guestsMap[b.guestId] || b.guestName || b.guestId || "—";
                  const payState =
                    bBalance <= 0.005
                      ? "paid"
                      : bPaid <= 0.005
                        ? "unpaid"
                        : "partial";

                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        if (b.id === selectedBookingId) return;
                        setSelectedBookingId(b.id);
                        setPayments([]);
                        setPaymentsError(null);
                        // Same race guard as auto-select: hold the prefill
                        // until the fresh records land, or a partial payment
                        // would preload as the full total.
                        setPaymentsLoading(true);
                        setAmount("");
                        setError(null);
                      }}
                      className={`w-full text-left rounded-xl border border-border bg-background p-4 space-y-1 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        isActive ? "ring-2 ring-primary/40 shadow-sm" : ""
                      }`}
                    >
                      {/* Guest name + payment status */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold truncate">
                          {guestName}
                        </div>
                        <Badge
                          variant={
                            payState === "paid"
                              ? "success"
                              : payState === "partial"
                                ? "warning"
                                : "danger"
                          }
                          className="shrink-0"
                        >
                          {payState === "paid"
                            ? "Paid in full"
                            : payState === "partial"
                              ? "Partial"
                              : "Unpaid"}
                        </Badge>
                      </div>

                      {/* Room + dates + total */}
                      <div className="text-[13px] text-foreground/70 truncate tabular-nums">
                        {roomNameFor(room)} ·{" "}
                        {formatShortDate(b.checkInDate)} →{" "}
                        {formatShortDate(b.checkOutDate)} · PHP {bTotal.toLocaleString()}
                      </div>

                      {/* Outstanding amount (only when owed) */}
                      {bBalance > 0.005 ? (
                        <div className="text-sm font-semibold text-destructive tabular-nums">
                          PHP {bBalance.toLocaleString()} outstanding
                        </div>
                      ) : null}
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
                      <div className="rounded-lg border border-border bg-background/50 p-3">
                        <div className="text-xs text-foreground/50 mb-1">
                          Total
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          PHP {total.toLocaleString()}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-background/50 p-3">
                        <div className="text-xs text-foreground/50 mb-1">
                          Paid
                        </div>
                        <div className="text-sm font-semibold text-success tabular-nums">
                          {paymentsLoading ? "…" : `PHP ${totalPaidFromRecords.toLocaleString()}`}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-background/50 p-3">
                        <div className="text-xs text-foreground/50 mb-1">
                          Outstanding
                        </div>
                        <div
                          className={`text-sm font-semibold tabular-nums ${
                            paymentsLoading
                              ? "text-foreground/40"
                              : balance > 0
                                ? "text-destructive"
                                : "text-success"
                          }`}
                        >
                          {paymentsLoading ? "…" : `PHP ${balance.toLocaleString()}`}
                        </div>
                      </div>
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
                          disabled={submitting || paymentsLoading || balance <= 0}
                        />
                      </div>

                      {/* Method */}
                      <div className="space-y-2">
                        <Label htmlFor="payMethod">Method</Label>
                        <Select.Root
                          value={method}
                          onValueChange={(value) => setMethod(value)}
                          disabled={submitting || paymentsLoading || balance <= 0}
                        >
                          <Select.Trigger
                            id="payMethod"
                            className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                          >
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content position="popper" side="bottom" align="start" sideOffset={4} className="z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                              <Select.Viewport>
                                {METHOD_OPTIONS.map((m) => (
                                  <Select.Item
                                    key={m}
                                    value={m}
                                    className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground"
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
                        disabled={submitting || paymentsLoading || balance <= 0}
                      />
                    </div>

                    <Button
                      className="w-full"
                      onClick={onAddPayment}
                      disabled={submitting || paymentsLoading || balance <= 0}
                    >
                      {submitting
                        ? "Recording…"
                        : paymentsLoading
                          ? "Loading folio…"
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
