import { useMemo, useState } from "react";
import { Popover } from "radix-ui";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Check, User, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  HOUSEKEEPING_KANBAN_COLUMNS,
  isValidHousekeepingTransition,
  resolveDropStatus,
} from "@/lib/room-status-transitions";
import { getStatusCardClasses } from "@/components/rooms/roomStatusHelpers";
import StaffAssignmentBadge from "@/components/rooms/StaffAssignmentBadge";
import CleaningTimer from "@/components/rooms/CleaningTimer";
import HousekeepingPhotoUpload from "@/components/housekeeping/HousekeepingPhotoUpload";

function KanbanColumn({ status, label, count, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { columnStatus: status },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[400px] flex-col rounded-xl border border-border bg-background transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground/60">
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
    </div>
  );
}

function KanbanCardContent({
  room,
  assignment,
  verificationPhotos,
  onVerificationPhotosChange,
  showPhotoUpload,
  isSelected,
  onToggleSelect,
  showCheckbox,
  onSelectRoom,
  onApproveRoom,
  staffUsers,
  onReassign,
  isOverlay = false,
}) {
  return (
    <div
      className={`space-y-4 rounded-xl border p-5 shadow-sm bg-background transition-all hover:shadow-md ${getStatusCardClasses(room.status)} ${
        isOverlay ? "rotate-2 shadow-lg" : ""
      } ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""}`}
    >
      <div className="flex items-start gap-3">
        {showCheckbox && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect?.(room.id);
            }}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background"
            }`}
            aria-label={isSelected ? "Deselect room" : "Select room"}
          >
            {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <button
            type="button"
            onClick={() => onSelectRoom?.(room.id)}
            className="text-left text-sm font-semibold leading-tight hover:underline text-foreground"
          >
            {room.name || room.type || "Room"}
            {room.roomNumber ? ` • #${room.roomNumber}` : null}
          </button>
          {room.isMidStayRequest && (
            <div className="pt-1 space-y-1">
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 border border-amber-500/20">
                ✨ Mid-Stay Request
              </span>
              {room.midStayNote && (
                <p className="text-[11px] italic text-foreground/75 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/10">
                  "{room.midStayNote}"
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-foreground/45">
            {room.floor && <span>Floor {room.floor}</span>}
            {room.floor && (assignment?.name || room.assignedToName) && <span>·</span>}
            {staffUsers && staffUsers.length > 0 && !isOverlay && (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground/70 transition-colors"
                  >
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[110px]">
                      {assignment?.name || room.assignedToName || "Assign"}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="z-50 w-40 rounded-md border border-border bg-background p-1 shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
                    side="bottom"
                    align="start"
                  >
                    <div className="space-y-1">
                      {staffUsers.map((staff) => (
                        <button
                          key={staff.id}
                          type="button"
                          onClick={() => onReassign?.(room.id, staff.id)}
                          className="w-full rounded-sm px-2 py-1.5 text-xs text-left hover:bg-muted data-[highlighted]:bg-muted"
                        >
                          {staff.fullName || staff.email || staff.id}
                        </button>
                      ))}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
            {(!staffUsers || staffUsers.length === 0 || isOverlay) && (assignment?.name || room.assignedToName) && (
              <span className="truncate max-w-[110px]" title={assignment?.name || room.assignedToName}>
                Assigned: {assignment?.name || room.assignedToName}
              </span>
            )}
          </div>
          {room.status === "Being Cleaned" && (
            <div className="pt-1">
              <CleaningTimer startedAt={room.cleaningStartedAt} />
            </div>
          )}
        </div>
      </div>

      {showPhotoUpload && !isOverlay && (
        <HousekeepingPhotoUpload
          photos={verificationPhotos}
          onChange={onVerificationPhotosChange}
          label="Before / after photos"
          maxPhotos={4}
        />
      )}

      {room.status === "Pending Approval" && onApproveRoom && !isOverlay && (
        <Button
          type="button"
          size="sm"
          className="h-9 w-full text-xs"
          onClick={(event) => {
            event.stopPropagation();
            onApproveRoom(room);
          }}
        >
          Approve
        </Button>
      )}
    </div>
  );
}

function DraggableKanbanCard({
  room,
  assignment,
  verificationPhotos,
  onVerificationPhotosChange,
  showPhotoUpload,
  isSelected,
  onToggleSelect,
  showCheckbox,
  onSelectRoom,
  onApproveRoom,
  staffUsers,
  onReassign,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: room.id,
      data: { room, columnStatus: room.status },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <div className="relative">
        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded p-1 text-foreground/35 hover:bg-background/80 hover:text-foreground/70"
          aria-label="Drag room card"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <KanbanCardContent
          room={room}
          assignment={assignment}
          verificationPhotos={verificationPhotos}
          onVerificationPhotosChange={onVerificationPhotosChange}
          showPhotoUpload={showPhotoUpload}
          isSelected={isSelected}
          onToggleSelect={onToggleSelect}
          showCheckbox={showCheckbox}
          onSelectRoom={onSelectRoom}
          onApproveRoom={onApproveRoom}
          staffUsers={staffUsers}
          onReassign={onReassign}
        />
      </div>
    </div>
  );
}

export default function HousekeepingKanban({
  rooms,
  getAssignmentForRoom,
  verificationPhotosByRoom,
  onVerificationPhotosChange,
  selectedRoomIds,
  onToggleSelect,
  onSelectRoom,
  onMoveRoom,
  onBulkApprove,
  onApproveRoom,
  staffUsers,
  onReassign,
}) {
  const [activeRoom, setActiveRoom] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const roomsByStatus = useMemo(() => {
    const map = Object.fromEntries(
      HOUSEKEEPING_KANBAN_COLUMNS.map((col) => [col.id, []]),
    );
    rooms.forEach((room) => {
      if (map[room.status]) map[room.status].push(room);
    });
    return map;
  }, [rooms]);

  const pendingSelectedCount = useMemo(
    () =>
      rooms.filter(
        (room) =>
          room.status === "Pending Approval" && selectedRoomIds.has(room.id),
      ).length,
    [rooms, selectedRoomIds],
  );

  function handleDragStart(event) {
    const room = event.active.data.current?.room;
    if (room) setActiveRoom(room);
  }

  function handleDragEnd(event) {
    setActiveRoom(null);
    const { active, over } = event;
    if (!over) return;

    const room = active.data.current?.room;
    const targetStatus = resolveDropStatus(over);
    if (!room || !targetStatus || room.status === targetStatus) return;

    if (!isValidHousekeepingTransition(room.status, targetStatus)) {
      toast.error(`Cannot move from ${room.status} to ${targetStatus}`);
      return;
    }

    onMoveRoom(room, targetStatus);
  }

  return (
    <div className="space-y-3">
      {pendingSelectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
          <span className="text-sm text-foreground/70">
            {pendingSelectedCount} room{pendingSelectedCount !== 1 ? "s" : ""}{" "}
            selected for approval
          </span>
          <Button size="sm" onClick={onBulkApprove}>
            Approve selected
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-5 md:grid-cols-3">
          {HOUSEKEEPING_KANBAN_COLUMNS.map((column) => {
            const columnRooms = roomsByStatus[column.id] || [];
            const isPendingColumn = column.id === "Pending Approval";

            return (
              <KanbanColumn
                key={column.id}
                status={column.id}
                label={column.label}
                count={columnRooms.length}
              >
                {columnRooms.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-foreground/40">
                    Drop rooms here
                  </p>
                ) : (
                  columnRooms.map((room) => (
                    <DraggableKanbanCard
                      key={room.id}
                      room={room}
                      assignment={getAssignmentForRoom(room)}
                      verificationPhotos={
                        verificationPhotosByRoom[room.id] || []
                      }
                      onVerificationPhotosChange={(photos) =>
                        onVerificationPhotosChange(room.id, photos)
                      }
                      showPhotoUpload={room.status === "Being Cleaned"}
                      isSelected={selectedRoomIds.has(room.id)}
                      onToggleSelect={onToggleSelect}
                      showCheckbox={isPendingColumn}
                      onSelectRoom={onSelectRoom}
                      onApproveRoom={onApproveRoom}
                      staffUsers={staffUsers}
                      onReassign={onReassign}
                    />
                  ))
                )}
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeRoom ? (
            <KanbanCardContent
              room={activeRoom}
              assignment={getAssignmentForRoom(activeRoom)}
              staffUsers={staffUsers}
              onReassign={onReassign}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
