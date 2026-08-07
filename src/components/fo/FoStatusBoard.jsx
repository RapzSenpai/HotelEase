import { useMemo, useState } from "react";
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
import { GripVertical, BedDouble, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  FO_BOARD_COLUMNS,
  isValidFoTransition,
  resolveDropStatus,
} from "@/lib/room-status-transitions";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import { getStatusCardClasses } from "@/components/rooms/roomStatusHelpers";
import { timeSince, getStatusTimestamp } from "@/lib/time-utils";

function BoardColumn({ status, count, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { columnStatus: status },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-56 shrink-0 flex-col rounded-xl border border-border bg-background md:w-64 ${
        isOver ? "border-primary/50 bg-primary/5" : ""
      }`}
    >
      <div className="space-y-1 border-b border-border/50 px-3 py-2.5">
        <RoomStatusBadge status={status} />
        <p className="text-xs text-foreground/45">{count} rooms</p>
      </div>
      <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto p-3">
        {children}
      </div>
    </div>
  );
}

function getBedInfo(room) {
  const bedAmenity = room.amenities?.find(a => a.toLowerCase().includes('bed'));
  if (bedAmenity) return bedAmenity;
  if (room.type?.toLowerCase().includes('single')) return 'Single';
  if (room.type?.toLowerCase().includes('suite')) return 'Double';
  if (room.type?.toLowerCase().includes('presidential')) return 'King';
  return '1 Bed';
}

function getCapacityInfo(room) {
  const capAmenity = room.amenities?.find(a => a.toLowerCase().includes('pax') || a.toLowerCase().includes('guest') || a.toLowerCase().includes('capacity'));
  if (capAmenity) return capAmenity;
  if (room.type?.toLowerCase().includes('single')) return '2 Pax';
  if (room.type?.toLowerCase().includes('suite')) return '4 Pax';
  if (room.type?.toLowerCase().includes('presidential')) return '6 Pax';
  return '2 Pax';
}

function BoardCardContent({ room, isSelected, isOverlay = false }) {
  const status = room.status || "Available";
  const statusTime = timeSince(getStatusTimestamp(room));

  return (
    <div
      className={`space-y-2 rounded-lg border p-3 text-sm shadow-sm ${getStatusCardClasses(status)} ${
        isOverlay ? "rotate-1 shadow-lg" : ""
      } ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className="font-semibold leading-tight text-xs truncate max-w-[120px]">
          {room.name || room.type || "Room"}
          {room.roomNumber ? ` • #${room.roomNumber}` : ""}
        </p>
        <Badge variant="warning" className="text-[9px] px-1 py-0 font-bold shrink-0">
          PHP {Number(room.ratePerNight ?? 0).toLocaleString()}
        </Badge>
      </div>

      <p className="text-[11px] text-foreground/45">
        Floor {room.floor || "—"} · {getBedInfo(room)} · {getCapacityInfo(room)}
      </p>

      {status !== "Available" && (
        <p className="text-[10px] text-foreground/45 mt-1">Active {statusTime}</p>
      )}
    </div>
  );
}

function DraggableBoardCard({ room, isSelected, onSelectRoom }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: room.id,
      data: { room, columnStatus: room.status },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <div className="relative">
        <button
          type="button"
          className="absolute right-1.5 top-1.5 z-10 rounded p-0.5 text-foreground/35 hover:bg-background/80 hover:text-foreground/60"
          aria-label="Drag room"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="w-full text-left"
          onClick={() => onSelectRoom(room.id)}
        >
          <BoardCardContent room={room} isSelected={isSelected} />
        </button>
      </div>
    </div>
  );
}

export default function FoStatusBoard({
  rooms,
  selectedRoomId,
  onSelectRoom,
  onMoveRoom,
}) {
  const [activeRoom, setActiveRoom] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const roomsByStatus = useMemo(() => {
    const map = Object.fromEntries(FO_BOARD_COLUMNS.map((status) => [status, []]));
    rooms.forEach((room) => {
      const status = room.status || "Available";
      if (map[status]) map[status].push(room);
    });
    return map;
  }, [rooms]);

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

    if (!isValidFoTransition(room.status, targetStatus)) {
      toast.error(`Cannot move from ${room.status} to ${targetStatus}`);
      return;
    }

    onMoveRoom(room, targetStatus);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {FO_BOARD_COLUMNS.map((status) => {
          const columnRooms = roomsByStatus[status] || [];
          return (
            <BoardColumn key={status} status={status} count={columnRooms.length}>
              {columnRooms.length === 0 ? (
                <p className="px-2 py-4 text-center text-[10px] text-foreground/35">
                  Empty
                </p>
              ) : (
                columnRooms.map((room) => (
                  <DraggableBoardCard
                    key={room.id}
                    room={room}
                    isSelected={selectedRoomId === room.id}
                    onSelectRoom={onSelectRoom}
                  />
                ))
              )}
            </BoardColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeRoom ? (
          <BoardCardContent
            room={activeRoom}
            isSelected={selectedRoomId === activeRoom.id}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
