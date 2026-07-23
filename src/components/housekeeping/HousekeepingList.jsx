import { useMemo } from "react";
import { Check, Play, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CleaningTimer from "@/components/rooms/CleaningTimer";
import HousekeepingPhotoUpload from "@/components/housekeeping/HousekeepingPhotoUpload";

export default function HousekeepingList({
  rooms,
  getAssignmentForRoom,
  staffUsers,
  onReassign,
  verificationPhotosByRoom,
  onVerificationPhotosChange,
  selectedRoomIds,
  onToggleSelect,
  onSelectRoom,
  onMoveRoom,
  onBulkApprove,
  onApproveRoom,
  selectedRoomId,
}) {
  const pendingSelectedCount = useMemo(
    () =>
      rooms.filter(
        (room) =>
          room.status === "Pending Approval" && selectedRoomIds.has(room.id),
      ).length,
    [rooms, selectedRoomIds],
  );

  return (
    <div className="space-y-4">
      {/* Bulk Approval Bar */}
      {pendingSelectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-medium text-foreground/80">
              {pendingSelectedCount} room{pendingSelectedCount !== 1 ? "s" : ""}{" "}
              selected for approval
            </span>
          </div>
          <Button size="sm" onClick={onBulkApprove} className="gap-1.5 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Approve Selected
          </Button>
        </div>
      )}

      {/* Rooms Table */}
      <Card>
        <CardContent className="pt-6">
        <Table className="min-w-[920px] table-fixed">
          <colgroup>
            <col style={{ width: "52px" }} />
            <col style={{ width: "160px" }} />
            <col style={{ width: "220px" }} />
            <col style={{ width: "168px" }} />
            <col style={{ width: "auto" }} />
            <col style={{ width: "148px" }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">
                {/* Select All checkbox for Pending rooms only */}
              </TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned Staff</TableHead>
              <TableHead>Verification Photos</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => {
              const assignment = getAssignmentForRoom(room);
              const isSelected = selectedRoomId === room.id;
              const isChecked = selectedRoomIds.has(room.id);
              const isPending = room.status === "Pending Approval";
              const isCleaning = room.status === "Being Cleaned";
              const isDirty = room.status === "Dirty / Needs Cleaning";
              const draftPhotos = verificationPhotosByRoom[room.id] || [];
              const savedPhotos = Array.isArray(room.photoUrls)
                ? room.photoUrls
                : [];

              let statusBadgeVariant = "muted";
              if (isDirty) statusBadgeVariant = "danger";
              if (isCleaning) statusBadgeVariant = "warning";
              if (isPending) statusBadgeVariant = "info";

              return (
                <TableRow
                  key={room.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectRoom?.(room.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectRoom?.(room.id);
                    }
                  }}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                      : ""
                  }`}
                >
                  {/* Selection Checkbox */}
                  <TableCell
                    className="py-4 text-center align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isPending ? (
                      <button
                        type="button"
                        onClick={() => onToggleSelect?.(room.id)}
                        className={`mx-auto flex h-4.5 w-4.5 items-center justify-center rounded border transition-colors ${
                          isChecked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary/50"
                        }`}
                        aria-label={isChecked ? "Deselect room" : "Select room"}
                      >
                        {isChecked ? <Check className="h-3 w-3" /> : null}
                      </button>
                    ) : null}
                  </TableCell>

                  {/* Room Details */}
                  <TableCell className="py-4 align-middle">
                    <div className="font-semibold text-sm leading-snug">
                      {room.name || room.type || "Room"}
                      {room.roomNumber ? ` · #${room.roomNumber}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-foreground/45">
                      Floor {room.floor || "—"}
                    </div>
                  </TableCell>

                  {/* Status badge & cleaning timer */}
                  <TableCell className="py-4 align-middle">
                    <div className="flex flex-col items-start gap-2">
                      <Badge
                        variant={statusBadgeVariant}
                        className="whitespace-nowrap px-3 py-1 text-[11px] font-semibold leading-none"
                      >
                        {room.status}
                      </Badge>
                      {isCleaning && room.cleaningStartedAt ? (
                        <CleaningTimer startedAt={room.cleaningStartedAt} />
                      ) : null}
                    </div>
                  </TableCell>

                  {/* Assigned Staff — primary place for assignment in table view */}
                  <TableCell
                    className="py-4 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(isDirty || isCleaning) && staffUsers.length > 0 ? (
                      <select
                        value={assignment?.userId || ""}
                        onChange={(e) => onReassign(room.id, e.target.value)}
                        className="h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-xs text-foreground shadow-sm transition-colors hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="" disabled>
                          Select Staff
                        </option>
                        {staffUsers.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.fullName || staff.email || staff.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="block truncate text-xs font-medium text-foreground/70"
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

                  {/* Verification Photos column */}
                  <TableCell
                    className="py-4 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isCleaning ? (
                      <HousekeepingPhotoUpload
                        photos={draftPhotos}
                        onChange={(updatedPhotos) =>
                          onVerificationPhotosChange(room.id, updatedPhotos)
                        }
                        label="Upload proof"
                        maxPhotos={4}
                        compact
                      />
                    ) : savedPhotos.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {savedPhotos.map((url, idx) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block h-9 w-9 overflow-hidden rounded-md border border-border outline outline-1 outline-black/10 transition-opacity hover:opacity-80"
                          >
                            <img
                              src={url}
                              alt={`Verification ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs italic text-foreground/35">
                        No photos
                      </span>
                    )}
                  </TableCell>

                  {/* Actions column */}
                  <TableCell
                    className="py-4 text-right align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-2">
                      {isDirty && (
                        <Button
                          size="sm"
                          className="h-9 gap-1.5 px-3 text-xs shadow-sm"
                          onClick={() => onMoveRoom(room, "Being Cleaned")}
                        >
                          <Play className="h-3 w-3" />
                          Start Clean
                        </Button>
                      )}
                      {isCleaning && (
                        <Button
                          size="sm"
                          className="h-9 gap-1.5 px-3 text-xs shadow-sm"
                          onClick={() => onMoveRoom(room, "Pending Approval")}
                        >
                          <Send className="h-3 w-3" />
                          Submit Review
                        </Button>
                      )}
                      {isPending && onApproveRoom && (
                        <Button
                          size="sm"
                          className="h-9 gap-1.5 bg-success px-3 text-xs shadow-sm hover:bg-success/90"
                          onClick={() => onApproveRoom(room)}
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </CardContent>
      </Card>
    </div>
  );
}
