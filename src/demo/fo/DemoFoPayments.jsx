import { useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";
import { balanceOf, paidFor } from "./foDemoData";

const METHODS = ["Cash", "GCash", "Check", "Credit Card"];

export default function DemoFoPayments() {
  const { data, fo } = useDemo();
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
  const payable = data.bookings.filter(
    (b) => b.status === "Approved" || b.status === "Checked In",
  );
  const [selectedId, setSelectedId] = useState(payable[0]?.id ?? null);
  // Mirrors the real screen: the amount box opens prefilled with the balance.
  const [amount, setAmount] = useState(() =>
    payable[0] ? String(balanceOf(payable[0], data.payments) || "") : "",
  );
  const [method, setMethod] = useState("Cash");

  const booking = data.bookings.find((b) => b.id === selectedId) ?? payable[0] ?? null;
  const balance = booking ? balanceOf(booking, data.payments) : 0;

  function select(id) {
    setSelectedId(id);
    const target = data.bookings.find((b) => b.id === id);
    // Mirror the real screen: the amount box opens prefilled with the balance.
    if (target) setAmount(String(balanceOf(target, data.payments) || ""));
  }

  function record() {
    const value = Number(amount);
    if (!booking || !Number.isFinite(value) || value <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }
    if (value > balance + 0.01) {
      toast.error(
        `Payment amount cannot exceed the remaining balance of ${formatCurrency(balance)}.`,
      );
      return;
    }
    fo.demoRecordPayment({ bookingId: booking.id, amount: value, method });
    toast.success(`Demo: ${formatCurrency(value)} recorded. Nothing was charged.`);
    setAmount("");
  }

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Payments"
        role="fo"
        description="Record a counter payment against a booking. The amount is capped at the outstanding balance, exactly like the live screen."
      />
      <Card className="space-y-3 p-4">
        <div className="text-sm font-semibold">Record payment (demo)</div>
        <div className="flex flex-wrap gap-1.5">
          {payable.map((b) => (
            <Button
              key={b.id}
              variant={booking?.id === b.id ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => select(b.id)}
            >
              {roomLabelFrom(roomsById, b.roomId)}
            </Button>
          ))}
        </div>
        {booking ? (
          <>
            <p className="text-xs text-foreground/60 tabular-nums">
              Total {formatCurrency(booking.totalCost)} · Paid{" "}
              {formatCurrency(paidFor(data.payments, booking.id))} · Balance{" "}
              {formatCurrency(balance)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                className="max-w-40"
                aria-label="Payment amount"
              />
              <Button size="sm" onClick={record}>Record (demo)</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <Button
                  key={m}
                  variant={method === m ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMethod(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-foreground/60">No payable booking in the sample data.</p>
        )}
      </Card>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Recorded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="text-sm">
                  {roomLabelFrom(roomsById, data.bookings.find((b) => b.id === payment.bookingId)?.roomId)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatCurrency(payment.amount)}
                </TableCell>
                <TableCell className="text-sm">{payment.method}</TableCell>
                <TableCell className="text-xs text-foreground/60">
                  {payment.source === "fo_manual" ? "Front desk" : "Guest proof"}
                </TableCell>
                <TableCell className="text-xs text-foreground/60">
                  {formatDate(payment.createdAt.toDate())}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
