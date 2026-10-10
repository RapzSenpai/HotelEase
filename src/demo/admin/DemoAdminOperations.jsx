import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import demoToast from "../demoToast";
import DemoSectionHeader from "../DemoSectionHeader";
import { useDemo } from "../DemoContext";

const STATUS_OPTIONS = [
  "Available",
  "Reserved",
  "Being Cleaned",
  "Out of Order",
  "Dirty / Needs Cleaning",
];

export default function DemoAdminOperations() {
  const { data, admin } = useDemo();
  const [selected, setSelected] = useState([]);
  const [status, setStatus] = useState("Available");

  function toggle(roomId) {
    setSelected((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId],
    );
  }

  function apply() {
    if (!selected.length) {
      toast.error("Select at least one room.");
      return;
    }
    // In-memory only: the demo reducer writes to the fixture copy, never Firestore.
    for (const roomId of selected) admin.demoUpdateRoom({ roomId, patch: { status } });
    toast.success(`Demo: ${selected.length} room(s) set to ${status}. Nothing was saved.`);
    setSelected([]);
  }

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Operations"
        role="admin"
        description="Bulk room status applies to the sample rooms in memory. Exports and emergency overrides are disabled in the demo."
      />
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Set selected rooms to</span>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((option) => (
              <Button
                key={option}
                variant={status === option ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setStatus(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          {data.rooms.map((room) => (
            <label
              key={room.id}
              className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm hover:bg-surface-hover"
            >
              <Checkbox
                checked={selected.includes(room.id)}
                onCheckedChange={() => toggle(room.id)}
                aria-label={`Select ${room.name}`}
              />
              <span className="flex-1 truncate">{room.name}</span>
              <Badge variant="outline" className="text-xs">{room.status}</Badge>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8 text-xs" onClick={apply}>
            Apply to {selected.length || "0"} room(s)
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => demoToast()}>
            Export rooms CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => demoToast()}>
            Export users CSV
          </Button>
        </div>
      </Card>
      <p className="text-xs text-foreground/50">
        In the real app these writes go to Firestore with an audit entry each; here the audit log stays as seeded.
      </p>
    </div>
  );
}
