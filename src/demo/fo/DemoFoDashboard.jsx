import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import RoomScheduleTape from "@/components/dashboard/RoomScheduleTape";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";
import { dirtyRooms } from "./foDemoData";

export default function DemoFoDashboard() {
  const navigate = useNavigate();
  const { data } = useDemo();

  const metrics = [
    ["Available rooms", data.rooms.filter((r) => r.status === "Available").length],
    ["Pending bookings", data.bookings.filter((b) => b.status === "Pending").length],
    ["Checked in", data.bookings.filter((b) => b.status === "Checked In").length],
    ["Rooms needing cleaning", dirtyRooms(data.rooms).length],
  ];

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Dashboard"
        role="fo"
        description="Simulated operations on sample data — no bookings, payments, or notifications are real."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {metrics.map(([label, value]) => (
          <Card key={label} className="p-4 text-center">
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            <div className="text-xs text-foreground/60">{label}</div>
          </Card>
        ))}
      </div>
      <RoomScheduleTape
        rooms={data.rooms}
        bookings={data.bookings}
        onSelectBooking={() => navigate("/demo/fo/bookings")}
      />
    </div>
  );
}
