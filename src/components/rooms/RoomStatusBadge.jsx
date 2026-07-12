import { Badge } from "@/components/ui/badge";

function normalizeStatus(status) {
  return (status || "").trim();
}

export function getStatusCardClasses(status) {
  return "border-border bg-background hover:border-border/80";
}

export const HOUSEKEEPING_STEPS = [
  "Dirty / Needs Cleaning",
  "Being Cleaned",
  "Pending Approval",
  "Available",
];

export default function RoomStatusBadge({ status }) {
  const s = normalizeStatus(status);

  const map = {
    Available: "success",
    Reserved: "reserved",
    Occupied: "danger",
    "Being Cleaned": "info",
    "Pending Approval": "warning",
    "Out of Order": "muted",
    "Dirty / Needs Cleaning": "danger",
  };

  const variant = map[s] || "default";

  return (
    <Badge variant={variant}>
      {s || "Unknown"}
    </Badge>
  );
}

