import { useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import RoomsGridView from "@/components/rooms/RoomsGridView";
import RoomsTableView from "@/components/rooms/RoomsTableView";
import demoToast from "../demoToast";
import { useDemo } from "../DemoContext";

const TABS = ["Rooms", "Users", "Analytics"];
const ROOM_VIEWS = ["Grid", "Table"];

export default function DemoAdminPage() {
  const { role, data, admin } = useDemo();
  const [tab, setTab] = useState("Rooms");
  const [roomView, setRoomView] = useState("Grid");
  const [rates, setRates] = useState({});

  if (!role) return <Navigate to="/demo" replace />;

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

  // Archive/restore are disabled in demo.
  function demoDisabled() {
    demoToast();
  }

  function setUserRole(user, nextRole) {
    admin.demoSetUserRole({ userId: user.id, role: nextRole });
    toast.success(`Demo: ${user.fullName} is now ${nextRole} (in-memory only).`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-playfair text-3xl font-semibold">Admin Demo</h1>
        <p className="text-sm text-foreground/70">Sample rooms, users, and analytics. Every change stays in memory.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>

      {tab === "Rooms" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {ROOM_VIEWS.map((v) => (
              <Button key={v} variant={roomView === v ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setRoomView(v)}>
                {v}
              </Button>
            ))}
          </div>
          {roomView === "Grid" ? (
            <RoomsGridView
              rooms={data.rooms}
              onEdit={(room) => setRoomStatus(room, room.status === "Available" ? "Reserved" : "Available")}
              onArchive={demoDisabled}
              onRestore={demoDisabled}
            />
          ) : (
            <RoomsTableView
              rooms={data.rooms}
              onEdit={(room) => setRoomStatus(room, room.status === "Available" ? "Reserved" : "Available")}
              onArchive={demoDisabled}
              onRestore={demoDisabled}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-foreground/60">Edit toggles availability in memory. Archive and restore are disabled in the demo.</span>
          </div>
          <div className="space-y-2">
            {data.rooms.map((room) => (
              <Card key={room.id} className="flex flex-wrap items-center gap-2 p-4">
                <div className="text-sm font-medium">{room.name}</div>
                <Input
                  type="number"
                  min={1}
                  className="h-8 max-w-36 text-xs tabular-nums"
                  defaultValue={room.ratePerNight}
                  onChange={(e) => setRates((prev) => ({ ...prev, [room.id]: e.target.value }))}
                  aria-label={`${room.name} nightly rate`}
                />
                <Button size="sm" className="h-8 text-xs active:scale-[0.96]" onClick={() => saveRate(room)}>Set rate (demo)</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "Users" && (
        <div className="space-y-2">
          {data.users.map((user) => (
            <Card key={user.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <div className="text-sm font-medium">{user.fullName}</div>
                <div className="text-xs text-foreground/60">{user.email}</div>
              </div>
              <div className="flex gap-1.5">
                {["guest", "fo", "admin"].map((r) => (
                  <Button key={r} variant={user.role === r ? "default" : "outline"} size="sm" className="h-7 text-xs"
                    onClick={() => setUserRole(user, r)}>
                    {r}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "Analytics" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Sample rooms", data.rooms.length],
            ["Sample bookings", data.bookings.length],
            ["Sample revenue", `₱${data.payments.reduce((s, p) => s + Number(p.amount ?? 0), 0).toLocaleString()}`],
          ].map(([label, value]) => (
            <Card key={label} className="p-4 text-center">
              <div className="text-2xl font-bold tabular-nums">{value}</div>
              <div className="text-xs text-foreground/60">{label}</div>
            </Card>
          ))}
          <p className="text-xs text-foreground/50 sm:col-span-3">View-only aggregates from the sample data.</p>
        </div>
      )}
    </div>
  );
}
