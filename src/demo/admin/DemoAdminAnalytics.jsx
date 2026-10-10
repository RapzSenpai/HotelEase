import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";
import { collected, openAlerts, occupancy, outstanding, pendingTestimonials, revenueByRoomType } from "./adminDemoData";

export default function DemoAdminAnalytics() {
  const { data } = useDemo();
  const use = occupancy(data.rooms);

  const metrics = [
    ["Sample rooms", data.rooms.length],
    ["Sample bookings", data.bookings.length],
    ["Collected (sample)", formatCurrency(collected(data.payments))],
    ["Outstanding (sample)", formatCurrency(outstanding(data.bookings, data.payments))],
    ["Occupancy now", `${use.pct}%`],
    ["Open alerts", openAlerts(data.alerts).length],
    ["Testimonials awaiting review", pendingTestimonials(data.testimonials).length],
  ];

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Analytics"
        role="admin"
        description="Every figure is computed from the sample fixtures — view only, and never a real report."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {metrics.map(([label, value]) => (
          <Card key={label} className="p-4 text-center">
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            <div className="text-xs text-foreground/60">{label}</div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room type</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">Collected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {revenueByRoomType(data).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-sm font-medium">{row.type}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{row.bookings}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatCurrency(row.revenue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-foreground/50">
        The real screen charts live Firestore aggregates over a date range; the demo shows fixed samples.
      </p>
    </div>
  );
}
