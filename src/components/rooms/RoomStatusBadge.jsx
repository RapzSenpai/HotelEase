import { Badge } from "@/components/ui/badge";

function normalizeStatus(status) {
  return (status || "").trim();
}

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

