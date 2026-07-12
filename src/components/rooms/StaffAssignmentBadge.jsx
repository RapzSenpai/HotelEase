function getInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function StaffAssignmentBadge({ name, compact = false }) {
  if (!name) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
      title={`Assigned to ${name}`}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary ${
          compact ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]"
        }`}
      >
        {getInitials(name)}
      </span>
      <span className="truncate font-medium text-foreground/70">{name}</span>
    </div>
  );
}
