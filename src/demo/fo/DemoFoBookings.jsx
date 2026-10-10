import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { roomLabelFrom } from "@/lib/room-label";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";
import { balanceOf } from "./foDemoData";

export default function DemoFoBookings() {
  const { data, fo } = useDemo();
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
  const bookings = [...data.bookings].sort(
    (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis(),
  );

  function approve(bookingId) {
    fo.demoApproveBooking({ bookingId });
    toast.success("Demo: booking approved. Guest inbox notified.");
  }

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Bookings"
        role="fo"
        description="Sample booking queue. Approving flips the row in memory and drops a notification into the simulated guest inbox."
      />
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead>Stay</TableHead>
              <TableHead className="text-right">Nights</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell className="text-sm font-medium">
                  {roomLabelFrom(roomsById, booking.roomId)}
                </TableCell>
                <TableCell className="text-xs text-foreground/60">
                  {formatDate(booking.checkInDate.toDate())} – {formatDate(booking.checkOutDate.toDate())}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{booking.nights}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatCurrency(booking.totalCost)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatCurrency(balanceOf(booking, data.payments))}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{booking.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {booking.status === "Pending" ? (
                    <Button size="sm" className="h-8 text-xs" onClick={() => approve(booking.id)}>
                      Approve (demo)
                    </Button>
                  ) : (
                    <span className="text-xs text-foreground/40">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-foreground/50">
        In the real app this queue is live and approving writes to Firestore. Here everything stays in memory.
      </p>
    </div>
  );
}
