import { useState } from "react";
import { Check, Play, Sparkles, Send, History, EllipsisVertical, TriangleAlert, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CleaningTimer from "@/components/rooms/CleaningTimer";
import CleanerAssignInput from "@/components/housekeeping/CleanerAssignInput";
import HousekeepingPhotoDialog, {
  PhotoCountTrigger,
} from "@/components/housekeeping/HousekeepingPhotoDialog";

// Urgency (>2h wait) comes from the parent's display-only URGENT prefix
// (FoHousekeepingPage) — read it here, don't recompute with Date.now().

function toDateSafe(v) {
  if (!v) return null;
  try {
    const d = v?.toDate?.() || new Date(v);
    return d instanceof Date && !isNaN(d) ? d : null;
  } catch {
    return null;
  }
}

function formatRequestedDate(date) {
  if (!date) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatRequestedTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Parent injects a display-only "URGENT — waiting Xh · " prefix for long
// waits — strip it so the dialog shows the guest's actual note.
function stripUrgentPrefix(text) {
  return (text || "").replace(/^URGENT — waiting \d+h( · )?/, "");
}

export default function HousekeepingList({
  rooms,
  getAssignmentForRoom,
  onReassign,
  verificationPhotosByRoom,
  onVerificationPhotosChange,
  onOpenLogs,
  onMoveRoom,
  onApproveRoom,
  mode = "turnover",
  // Demo preview: real uploads write to prod Cloudinary, so demo callers
  // pass disableUploads to render a disabled note instead. Prod default false.
  disableUploads = false,
}) {
  const isMidstay = mode === "midstay";

  const [requestRoom, setRequestRoom] = useState(null);
  const [photoRoom, setPhotoRoom] = useState(null);

  function photosFor(room) {
    const fromProp = verificationPhotosByRoom?.[room.id];
    if (Array.isArray(fromProp)) return fromProp;
    return Array.isArray(room.photoUrls) ? room.photoUrls : [];
  }

  const photoDialogPhotos = photoRoom ? photosFor(photoRoom) : [];
  const photoDialogEditable = photoRoom
    ? photoRoom.status === "Dirty / Needs Cleaning" ||
      photoRoom.status === "Being Cleaned"
    : false;
  const photoDialogTitle = photoRoom
    ? `${photoRoom.name || photoRoom.type || "Room"}${photoRoom.roomNumber ? ` · #${photoRoom.roomNumber}` : ""}`
    : "Verification photos";

  const requestDialogDate = requestRoom
    ? toDateSafe(requestRoom.midStayRequestedAt)
    : null;
  const requestDialogNote = requestRoom
    ? stripUrgentPrefix(requestRoom.midStayNote).trim()
    : "";
  const requestUrgency = requestRoom?.midStayUrgency || "";

  return (
    <div className="space-y-4">
      {/* Rooms Table */}
      <Card>
        <CardContent className="px-4 py-4">
        {isMidstay ? (
        <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-3 text-[11px] text-foreground/60">
          <span className="inline-flex items-center gap-1.5">
            <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
            Dirty / Needs Cleaning
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-warning" />
            Being Cleaned
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Hourglass className="h-3.5 w-3.5 text-info" />
            Pending Approval
          </span>
        </div>
        <div className="overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Room</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Request</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Requested</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Wait</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Status</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Assigned</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Photos</TableHead>
              <TableHead className="h-12 px-5 text-right text-[11px] uppercase tracking-wide text-foreground/60">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => {
              const assignment = getAssignmentForRoom(room);
              const isPending = room.status === "Pending Approval";
              const isCleaning = room.status === "Being Cleaned";
              const isDirty = room.status === "Dirty / Needs Cleaning";
              const note = stripUrgentPrefix(room.midStayNote).trim();
              const hasNote = note.length > 0;
              const requestedAt = toDateSafe(room.midStayRequestedAt);
              const urgencyText = room.midStayUrgency || "";

              const StatusIcon = isDirty
                ? TriangleAlert
                : isCleaning
                  ? Sparkles
                  : isPending
                    ? Hourglass
                    : null;
              const statusIconClass = isDirty
                ? "text-destructive"
                : isCleaning
                  ? "text-warning"
                  : isPending
                    ? "text-info"
                    : "";

              return (
                <TableRow key={room.id}>
                  {/* Room */}
                  <TableCell className="px-5 py-3 align-middle">
                    <div
                      title={`${room.name || room.type || "Room"}${room.roomNumber ? ` · #${room.roomNumber}` : ""}`}
                      className="max-w-44 truncate font-medium text-[13px] leading-snug"
                    >
                      {room.name || room.type || "Room"}
                      {room.roomNumber ? ` · #${room.roomNumber}` : ""}
                    </div>
                    {room.floor ? (
                      <div className="mt-0.5 text-[11px] text-foreground/60">
                        Floor {room.floor}
                      </div>
                    ) : null}
                  </TableCell>

                  {/* Request — View Request button only, no chips */}
                  <TableCell className="px-5 py-3 align-middle">
                    {hasNote || urgencyText ? (
                      <div className="space-y-1.5">
                        {hasNote ? (
                          <Button
                            size="sm"
                            onClick={() => setRequestRoom(room)}
                            className="h-7 whitespace-nowrap px-2.5 text-xs shadow-sm"
                          >
                            View Request
                          </Button>
                        ) : (
                          <span className="inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                            {urgencyText}
                          </span>
                        )}
                        {urgencyText && hasNote ? (
                          <div className="inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                            {urgencyText}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-foreground/40">—</span>
                    )}
                  </TableCell>

                  {/* Requested — date + time */}
                  <TableCell className="px-5 py-3 align-middle">
                    {requestedAt ? (
                      <>
                        <div className="text-xs text-foreground/70">
                          {formatRequestedDate(requestedAt)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-foreground/60">
                          {formatRequestedTime(requestedAt)}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-foreground/40">—</span>
                    )}
                  </TableCell>

                  {/* Wait — plain elapsed time, no pill */}
                  <TableCell className="px-5 py-3 align-middle">
                    {requestedAt ? (
                      <CleaningTimer
                        startedAt={room.midStayRequestedAt}
                        plain
                      />
                    ) : (
                      <span className="text-xs text-foreground/40">—</span>
                    )}
                  </TableCell>

                  {/* Status — icon in status color, legend above teaches the mapping */}
                  <TableCell className="px-5 py-3 align-middle">
                    <span className="flex justify-center">
                      <span title={room.status} role="img" aria-label={room.status}>
                        {StatusIcon ? (
                          <StatusIcon className={`h-4 w-4 ${statusIconClass}`} />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                        )}
                      </span>
                    </span>
                  </TableCell>

                  {/* Assigned cleaner (name, no account) */}
                  <TableCell className="px-5 py-3 align-middle">
                    {isDirty || isCleaning ? (
                      <CleanerAssignInput
                        value={assignment?.name || room.assignedToName || ""}
                        onCommit={(name) => onReassign(room.id, name)}
                      />
                    ) : (
                      <span
                        className="block truncate text-[13px] font-medium text-foreground/70"
                        title={room.assignedToName || "Unassigned"}
                      >
                        {room.assignedToName || (
                          <span className="text-foreground/40">—</span>
                        )}
                      </span>
                    )}
                  </TableCell>

                  {/* Photos — compact count, dialog for view/manage */}
                  <TableCell className="px-5 py-3 align-middle">
                    <PhotoCountTrigger
                      count={photosFor(room).length}
                      onClick={() => setPhotoRoom(room)}
                      label={`View photos for ${room.name || room.roomNumber || "room"}`}
                    />
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="px-5 py-3 text-right align-middle">
                    <div className="flex items-center justify-end gap-1.5">
                      {isDirty && (
                        <Button
                          size="sm"
                          className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
                          onClick={() => onMoveRoom(room, "Being Cleaned")}
                        >
                          <Play className="h-3 w-3" />
                          Start Clean
                        </Button>
                      )}
                      {isCleaning && (
                        <Button
                          size="sm"
                          className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
                          onClick={() => onMoveRoom(room, "Pending Approval")}
                        >
                          <Send className="h-3 w-3" />
                          Submit Review
                        </Button>
                      )}
                      {isPending && onApproveRoom && (
                        <Button
                          size="sm"
                          className="h-7 gap-1.5 bg-success px-2.5 text-xs shadow-sm hover:bg-success/90"
                          onClick={() => onApproveRoom(room)}
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label={`Actions for ${room.name || room.roomNumber || "room"}`}
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onOpenLogs?.(room)}>
                            <History className="h-3.5 w-3.5" />
                            View Housekeeping logs
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        <Dialog open={!!requestRoom} onOpenChange={(open) => { if (!open) setRequestRoom(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {requestRoom
                  ? `${requestRoom.name || requestRoom.type || "Room"}${requestRoom.roomNumber ? ` · #${requestRoom.roomNumber}` : ""}`
                  : "Guest request"}
              </DialogTitle>
              <DialogDescription>
                <div className="space-y-1">
                  {requestUrgency ? (
                    <div className="inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                      {requestUrgency}
                    </div>
                  ) : null}
                  <div>
                    {[requestRoom?.midStayGuestName,
                      requestDialogDate
                        ? `Requested ${formatRequestedDate(requestDialogDate)} · ${formatRequestedTime(requestDialogDate)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("  ·  ") || "Mid-stay request"}
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>
            {requestRoom ? (
              <div className="space-y-4">
                <p className="whitespace-pre-wrap rounded-lg border border-border p-4 text-sm leading-relaxed text-foreground/90 shadow-sm">
                  {requestDialogNote}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 tabular-nums text-xs text-foreground/60">
                    Wait:
                    {requestDialogDate ? (
                      <CleaningTimer
                        startedAt={requestRoom.midStayRequestedAt}
                        label="Waiting"
                        plain
                      />
                    ) : (
                      "—"
                    )}
                  </span>
                  <Button size="sm" onClick={() => setRequestRoom(null)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
        </>
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-3 text-[11px] text-foreground/60">
          <span className="inline-flex items-center gap-1.5">
            <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
            Dirty / Needs Cleaning
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-warning" />
            Being Cleaned
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Hourglass className="h-3.5 w-3.5 text-info" />
            Pending Approval
          </span>
        </div>
        <div className="overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Room</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Status</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Assigned Staff</TableHead>
              <TableHead className="h-12 px-5 text-[11px] uppercase tracking-wide text-foreground/60">Photos</TableHead>
              <TableHead className="h-12 px-5 text-right text-[11px] uppercase tracking-wide text-foreground/60">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => {
              const assignment = getAssignmentForRoom(room);
              const isPending = room.status === "Pending Approval";
              const isCleaning = room.status === "Being Cleaned";
              const isDirty = room.status === "Dirty / Needs Cleaning";
              const draftPhotos = verificationPhotosByRoom[room.id] || [];
              const savedPhotos = Array.isArray(room.photoUrls)
                ? room.photoUrls
                : [];

              const StatusIcon = isDirty
                ? TriangleAlert
                : isCleaning
                  ? Sparkles
                  : isPending
                    ? Hourglass
                    : null;
              const statusIconClass = isDirty
                ? "text-destructive"
                : isCleaning
                  ? "text-warning"
                  : isPending
                    ? "text-info"
                    : "";

              return (
                <TableRow key={room.id}>
                  {/* Room Details */}
                  <TableCell className="px-5 py-3 align-middle">
                    <div
                      title={`${room.name || room.type || "Room"}${room.roomNumber ? ` · #${room.roomNumber}` : ""}`}
                      className="max-w-44 truncate font-medium text-[13px] leading-snug"
                    >
                      {room.name || room.type || "Room"}
                      {room.roomNumber ? ` · #${room.roomNumber}` : ""}
                    </div>
                    {room.isMidStayRequest && (
                      <div className="mt-1 space-y-1">
                        <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                          <Sparkles className="h-3 w-3" />
                          Mid-Stay Request
                        </span>
                        {room.midStayNote && (
                          <p className="max-w-[180px] truncate text-[11px] italic text-foreground/75" title={room.midStayNote}>
                            "{room.midStayNote}"
                          </p>
                        )}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-foreground/60">
                      Floor {room.floor || "—"}
                    </div>
                  </TableCell>

                  {/* Status icon & cleaning timer */}
                  <TableCell className="px-5 py-3 align-middle">
                    <span className="flex justify-center">
                      <span title={room.status} role="img" aria-label={room.status}>
                        {StatusIcon ? (
                          <StatusIcon className={`h-4 w-4 ${statusIconClass}`} />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                        )}
                      </span>
                    </span>
                    {isCleaning && room.cleaningStartedAt ? (
                      <span className="mt-1 flex justify-center tabular-nums text-xs text-foreground/60">
                        <CleaningTimer startedAt={room.cleaningStartedAt} plain />
                      </span>
                    ) : null}
                  </TableCell>

                  {/* Assigned cleaner (name, no account) */}
                  <TableCell className="px-5 py-3 align-middle">
                    {isDirty || isCleaning ? (
                      <CleanerAssignInput
                        value={assignment?.name || room.assignedToName || ""}
                        onCommit={(name) => onReassign(room.id, name)}
                      />
                    ) : (
                      <span
                        className="block truncate text-[13px] font-medium text-foreground/70"
                        title={room.assignedToName || "Unassigned"}
                      >
                        {room.assignedToName || (
                          <span className="italic text-foreground/40">
                            Unassigned
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>

                  {/* Photos — compact count, dialog for view/manage */}
                  <TableCell className="px-5 py-3 align-middle">
                    <PhotoCountTrigger
                      count={(draftPhotos.length > 0 ? draftPhotos : savedPhotos).length}
                      onClick={() => setPhotoRoom(room)}
                      label={`View photos for ${room.name || room.roomNumber || "room"}`}
                    />
                  </TableCell>

                  {/* Actions column */}
                  <TableCell className="px-5 py-3 text-right align-middle">
                    <div className="flex items-center justify-end gap-1.5">
                      {isDirty && (
                        <Button
                          size="sm"
                          className="h-7 whitespace-nowrap px-2.5 text-xs shadow-sm"
                          onClick={() => onMoveRoom(room, "Being Cleaned")}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Start Clean
                        </Button>
                      )}
                      {isCleaning && (
                        <Button
                          size="sm"
                          className="h-7 whitespace-nowrap px-2.5 text-xs shadow-sm"
                          onClick={() => onMoveRoom(room, "Pending Approval")}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Submit Review
                        </Button>
                      )}
                      {isPending && onApproveRoom && (
                        <Button
                          size="sm"
                          className="h-7 whitespace-nowrap bg-success px-2.5 text-xs shadow-sm hover:bg-success/90"
                          onClick={() => onApproveRoom(room)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label={`Actions for ${room.name || room.roomNumber || "room"}`}
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onOpenLogs?.(room)}>
                            <History className="h-3.5 w-3.5" />
                            View Housekeeping logs
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        </>
        )}
        </CardContent>
      </Card>
      <HousekeepingPhotoDialog
        open={!!photoRoom}
        onOpenChange={(open) => {
          if (!open) setPhotoRoom(null);
        }}
        title={photoDialogTitle}
        photos={photoDialogPhotos}
        editable={photoDialogEditable}
        disableUploads={disableUploads}
        onChange={(next) => {
          if (photoRoom) onVerificationPhotosChange(photoRoom.id, next);
        }}
      />
    </div>
  );
}
