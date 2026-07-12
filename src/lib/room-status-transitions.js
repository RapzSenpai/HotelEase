export const HOUSEKEEPING_KANBAN_COLUMNS = [
  { id: "Dirty / Needs Cleaning", label: "Dirty", shortLabel: "Dirty" },
  { id: "Being Cleaned", label: "Being Cleaned", shortLabel: "Cleaning" },
  { id: "Pending Approval", label: "Pending Approval", shortLabel: "Review" },
];

const HOUSEKEEPING_TRANSITIONS = {
  "Dirty / Needs Cleaning": ["Being Cleaned"],
  "Being Cleaned": ["Pending Approval", "Dirty / Needs Cleaning"],
  "Pending Approval": ["Being Cleaned"],
};

export function getValidHousekeepingTransitions(fromStatus) {
  return HOUSEKEEPING_TRANSITIONS[fromStatus] || [];
}

export function isValidHousekeepingTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return false;
  return getValidHousekeepingTransitions(fromStatus).includes(toStatus);
}

export const FO_BOARD_COLUMNS = [
  "Available",
  "Reserved",
  "Occupied",
  "Dirty / Needs Cleaning",
  "Being Cleaned",
  "Pending Approval",
  "Out of Order",
];

const FO_STATUS_TRANSITIONS = {
  Available: ["Reserved", "Out of Order"],
  Reserved: ["Available", "Occupied"],
  Occupied: ["Dirty / Needs Cleaning"],
  "Dirty / Needs Cleaning": ["Being Cleaned"],
  "Being Cleaned": ["Pending Approval", "Dirty / Needs Cleaning"],
  "Pending Approval": ["Available", "Being Cleaned"],
  "Out of Order": ["Available"],
};

export function getValidFoTransitions(fromStatus) {
  return FO_STATUS_TRANSITIONS[fromStatus] || [];
}

export function isValidFoTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return false;
  return getValidFoTransitions(fromStatus).includes(toStatus);
}

export function resolveDropStatus(over) {
  if (!over) return null;
  if (over.data?.current?.columnStatus) return over.data.current.columnStatus;
  if (over.data?.current?.room?.status) return over.data.current.room.status;
  if (FO_BOARD_COLUMNS.includes(over.id)) return over.id;
  if (HOUSEKEEPING_KANBAN_COLUMNS.some((col) => col.id === over.id)) return over.id;
  return null;
}
