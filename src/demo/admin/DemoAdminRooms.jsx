import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import RoomsGridView from "@/components/rooms/RoomsGridView";
import RoomsTableView from "@/components/rooms/RoomsTableView";
import demoToast from "../demoToast";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";

const ROOM_VIEWS = ["Grid", "Table"];

export default function DemoAdminRooms() {
  const { data, admin } = useDemo();
  const [roomView, setRoomView] = useState("Grid");
  const [rates, setRates] = useState({});

  function saveRate(room) {
    const value = Number(rates[room.id] ?? room.ratePerNight);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid nightly rate.");
      return;
    }
    admin.demoUpdateRoom({ roomId: room.id, patch: { ratePerNight: value } });
    toast.success(`Demo: ${room.name} rate set to ₱${value.toLocaleString()}. Nothing was saved.`);
  }

  function setRoomStatus(room, status) {
    admin.demoUpdateRoom({ roomId: room.id, patch: { status } });
    toast.success(`Demo: ${room.name} marked ${status}.`);
  }

  // Edit toggles availability only — deeper states (Dirty, Being Cleaned,
  // Occupied) belong to the cleaning cycle, not the room form.
  function toggleAvailability(room) {
    if (room.status === "Available") {
      setRoomStatus(room, "Reserved");
    } else if (room.status === "Reserved") {
      setRoomStatus(room, "Available");
    } else {
      demoToast();
    }
  }

  const views = {
    rooms: data.rooms,
    onEdit: (room) => toggleAvailability(room),
    onArchive: () => demoToast(),
    onRestore: () => demoToast(),
  };

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Room Management"
        role="admin"
        description="The real room grid and table with sample rooms behind them. Edits toggle availability in memory; archive and restore are disabled."
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {ROOM_VIEWS.map((view) => (
          <Button
            key={view}
            variant={roomView === view ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setRoomView(view)}
          >
            {view}
          </Button>
        ))}
      </div>
      {roomView === "Grid" ? <RoomsGridView {...views} /> : <RoomsTableView {...views} />}
      <div className="space-y-2">
        {data.rooms.map((room) => (
          <Card key={room.id} className="flex flex-wrap items-center gap-2 p-4">
            <div className="text-sm font-medium">{room.name}</div>
            <Input
              type="number"
              min={1}
              className="h-8 max-w-36 text-xs tabular-nums"
              defaultValue={room.ratePerNight}
              onChange={(event) =>
                setRates((prev) => ({ ...prev, [room.id]: event.target.value }))
              }
              aria-label={`${room.name} nightly rate`}
            />
            <Button size="sm" className="h-8 text-xs active:scale-[0.96]" onClick={() => saveRate(room)}>
              Set rate (demo)
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
