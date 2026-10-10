import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";
import { balanceOf, byCheckIn } from "./foDemoData";

export default function DemoFoCheckIn() {
  const { data, fo } = useDemo();
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
  const arrivals = byCheckIn(data.bookings.filter((b) => b.status === "Approved"));

  function checkIn(bookingId) {
    fo.demoCheckIn({ bookingId });
    toast.success("Demo: guest checked in. Room marked occupied.");
  }

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Check-In"
        role="fo"
        description="Approved arrivals waiting for check-in. Real check-in also flips the room to occupied and starts the stay timer."
      />
      {arrivals.length === 0 ? (
        <p className="text-sm text-foreground/60">No approved arrivals in the sample data.</p>
      ) : (
        <div className="space-y-2">
          {arrivals.map((booking) => (
            <Card key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium">{roomLabelFrom(roomsById, booking.roomId)}</div>
                <div className="text-xs text-foreground/60">
                  {formatDate(booking.checkInDate.toDate())} – {formatDate(booking.checkOutDate.toDate())} ·{" "}
                  {booking.nights} night{booking.nights === 1 ? "" : "s"} ·{" "}
                  {formatCurrency(balanceOf(booking, data.payments))} balance
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{booking.status}</Badge>
                <Button size="sm" className="h-8 text-xs" onClick={() => checkIn(booking.id)}>
                  Check in (demo)
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
