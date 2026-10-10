import { useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import DemoBookingCard from "../DemoBookingCard";
import { useDemo } from "../DemoContext";
import { balanceOf, byNewest, payableBookings } from "./guestDemoData";

const METHODS = ["GCash", "Over-the-Counter", "Cash"];

export default function DemoGuestBookings() {
  const { data, guest } = useDemo();
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
  const bookings = byNewest(data.bookings);
  const payable = payableBookings(data);
  const [activeId, setActiveId] = useState(payable[0]?.id ?? null);
  const active = payable.find((b) => b.id === activeId) ?? payable[0] ?? null;
  const [amount, setAmount] = useState(() =>
    active ? String(balanceOf(active, data.payments)) : "",
  );
  const [method, setMethod] = useState(METHODS[0]);

  function pick(booking) {
    setActiveId(booking.id);
    setAmount(String(balanceOf(booking, data.payments)));
  }

  function pay() {
    if (!active) return;
    const value = Number(amount);
    const due = balanceOf(active, data.payments);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (value > due + 0.01) {
      toast.error(`That is more than the ${formatCurrency(due)} balance due.`);
      return;
    }
    guest.demoPayBooking({ bookingId: active.id, amount: value, method });
    toast.success(
      `Demo payment of ${formatCurrency(value)} recorded. Nothing was charged — Front Office verifies it in the real flow.`,
    );
    setAmount("");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-playfair text-3xl font-semibold">My bookings</h1>
        <p className="text-sm text-foreground/70">
          Every booking below is sample data. Cancelling or paying here only changes this demo.
        </p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Simulated payment</h2>
        </div>

        {!active ? (
          <p className="text-sm text-foreground/60">
            Nothing left to pay in the sample data — every booking is settled.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {payable.map((booking) => (
                <Button
                  key={booking.id}
                  variant={booking.id === active.id ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => pick(booking)}
                >
                  {roomLabelFrom(roomsById, booking.roomId)} ·{" "}
                  {formatCurrency(balanceOf(booking, data.payments))}
                </Button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="demo-pay-amount"
                className="text-xs text-foreground/60"
              >
                Amount to pay (balance {formatCurrency(balanceOf(active, data.payments))})
              </label>
              <Input
                id="demo-pay-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-label="Payment amount"
                className="h-9 max-w-40 text-sm tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-foreground/60">Method</span>
              <div className="flex flex-wrap gap-1.5">
                {METHODS.map((option) => (
                  <Button
                    key={option}
                    variant={method === option ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setMethod(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>

            <Button size="sm" className="w-full active:scale-[0.96] sm:w-auto" onClick={pay}>
              Pay {amount ? formatCurrency(Number(amount)) : ""} (demo)
            </Button>
          </>
        )}
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          {bookings.length} sample booking{bookings.length === 1 ? "" : "s"}
        </h2>
        {bookings.map((booking) => (
          <DemoBookingCard
            key={booking.id}
            booking={booking}
            room={data.rooms.find((r) => r.id === booking.roomId)}
            payments={data.payments.filter((p) => p.bookingId === booking.id)}
            onCancel={(bookingId) => {
              guest.demoCancelBooking({ bookingId });
              toast.success("Demo booking cancelled. Nothing was saved.");
            }}
          />
        ))}
      </section>
    </div>
  );
}
