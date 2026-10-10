import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";
import { balanceOf, byCheckIn } from "./foDemoData";

export default function DemoFoCheckOut() {
  const { data, fo } = useDemo();
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
  const inHouse = byCheckIn(data.bookings.filter((b) => b.status === "Checked In"));

  function checkOut(booking) {
    const balance = balanceOf(booking, data.payments);
    if (balance > 0) {
      // Same rule as the real checkout screen: unpaid balance blocks the release.
      toast.error(`Settle the ${formatCurrency(balance)} balance before check-out.`);
      return;
    }
    fo.demoCheckOut({ bookingId: booking.id });
    toast.success("Demo: guest checked out. Room sent to housekeeping.");
  }

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Check-Out"
        role="fo"
        description="Guests in house. A booking with an outstanding balance cannot be checked out — same rule as the real screen."
      />
      {inHouse.length === 0 ? (
        <p className="text-sm text-foreground/60">No guests in house in the sample data.</p>
      ) : (
        <div className="space-y-2">
          {inHouse.map((booking) => {
            const balance = balanceOf(booking, data.payments);
            return (
              <Card key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{roomLabelFrom(roomsById, booking.roomId)}</div>
                  <div className="text-xs text-foreground/60">
                    Departs {formatDate(booking.checkOutDate.toDate())} · balance{" "}
                    <span className="tabular-nums">{formatCurrency(balance)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={balance > 0 ? "outline" : "primary"} className="text-xs">
                    {balance > 0 ? "Balance due" : "Settled"}
                  </Badge>
                  <Button size="sm" className="h-8 text-xs" onClick={() => checkOut(booking)}>
                    Check out (demo)
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
