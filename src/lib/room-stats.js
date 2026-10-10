// Single source of truth for the admin room inventory stats.
//
// - cleaning = every room that needs cleaner/inspector attention: Dirty,
//   Being Cleaned, and Pending Approval (awaiting inspection).
// - A mid-stay request flips the room to Dirty, so it counts as cleaning;
//   `midStay` reports how many of those came from guest requests.
// - "Occupied / Checked In" is a legacy status string still present in older
//   room docs and mid-stay flows — it counts as occupied.
import {
  Archive,
  CalendarClock,
  Check,
  Circle,
  Hourglass,
  Sparkles,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";

export const OCCUPIED_STATUSES = ["Occupied", "Occupied / Checked In"];

export const CLEANING_STATUSES = [
  "Dirty / Needs Cleaning",
  "Being Cleaned",
  "Pending Approval",
];

// Single visual mapping for room statuses: the legend and the table status
// cells share it so icons, colors, and meanings always match. Same icons and
// colors as the housekeeping views.
export function statusVisual(status) {
  switch (status) {
    case "Available":
      return { Icon: Check, label: "Available", className: "text-success" };
    case "Occupied":
    case "Occupied / Checked In":
      return { Icon: Users, label: "Occupied", className: "text-destructive" };
    case "Reserved":
      return { Icon: CalendarClock, label: "Reserved", className: "text-info" };
    case "Dirty / Needs Cleaning":
      return { Icon: TriangleAlert, label: "Dirty", className: "text-destructive" };
    case "Being Cleaned":
      return { Icon: Sparkles, label: "Being Cleaned", className: "text-warning" };
    case "Pending Approval":
      return { Icon: Hourglass, label: "Pending Approval", className: "text-info" };
    case "Out of Order":
      return { Icon: Wrench, label: "Out of Order", className: "text-foreground/50" };
    case "Archived":
      return { Icon: Archive, label: "Archived", className: "text-foreground/40" };
    default:
      return { Icon: Circle, label: status || "Unknown", className: "text-foreground/40" };
  }
}

export function computeRoomStats(rooms = []) {
  const total = rooms.length;
  const active = rooms.filter((r) => r.isActive !== false);
  const available = active.filter((r) => r.status === "Available").length;
  const occupied = active.filter((r) => OCCUPIED_STATUSES.includes(r.status)).length;
  const reserved = active.filter((r) => r.status === "Reserved").length;
  const cleaningRooms = active.filter((r) => CLEANING_STATUSES.includes(r.status));
  const cleaning = cleaningRooms.length;
  const midStay = cleaningRooms.filter((r) => r.isMidStayRequest === true).length;
  const outOfOrder = active.filter((r) => r.status === "Out of Order").length;
  const archived = rooms.filter((r) => r.isActive === false).length;
  // Sellable = active rooms that could host a guest tonight.
  const sellable = active.filter((r) => r.status !== "Out of Order").length;
  const occupancyRate = sellable > 0 ? Math.round((occupied / sellable) * 100) : 0;
  const availabilityRate = sellable > 0 ? Math.round((available / sellable) * 100) : 0;
  return {
    total,
    available,
    availabilityRate,
    occupied,
    occupancyRate,
    reserved,
    cleaning,
    midStay,
    outOfOrder,
    archived,
  };
}
