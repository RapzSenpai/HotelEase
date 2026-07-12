import { useEffect, useMemo, useState } from "react";
import { Select } from "radix-ui";
import { toast } from "sonner";
import { subscribeToRooms } from "@/services/roomsService";
import { listUsers } from "@/services/userService";
import HousekeepingKanban from "@/components/housekeeping/HousekeepingKanban";
import { Button } from "@/components/ui/button";
import {
  updateRoomStatus,
  assignHousekeepingStaff,
  bulkUpdateRoomStatus,
  subscribeToHousekeepingLogsForRoom,
} from "@/services/housekeepingService";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const SELECT_TRIGGER_CLASS =
  "flex h-9 w-full items-center justify-between rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30";
const SELECT_CONTENT_CLASS =
  "z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md";
const SELECT_ITEM_CLASS =
  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground";

function getStaffLabel(user) {
  return user.fullName || user.email || user.id;
}

export default function FoHousekeepingPage() {
  const [searchParams] = useSearchParams();
  const roomIdParam = searchParams.get("roomId");
  const { trainingMode, user, profile } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [verificationPhotosByRoom, setVerificationPhotosByRoom] = useState({});
  const [selectedRoomIds, setSelectedRoomIds] = useState(new Set());

  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [logs, setLogs] = useState([]);

  const currentStaffName =
    profile?.fullName || user?.displayName || user?.email || "Staff";

  useEffect(() => {
    let settled = false;

    const unsubscribe = subscribeToRooms(
      (data) => {
        setRooms(data);
        if (!settled) {
          settled = true;
          setLoading(false);
        }
      },
      { trainingMode },
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [trainingMode]);

  useEffect(() => {
    let isMounted = true;
    async function loadStaff() {
      try {
        const users = await listUsers({ trainingMode: !!trainingMode });
        if (!isMounted) return;
        setStaffUsers(
          users.filter((u) => u.role === "fo" || u.role === "admin"),
        );
      } catch {
        if (!isMounted) return;
        setStaffUsers([]);
      }
    }
    loadStaff();
    return () => {
      isMounted = false;
    };
  }, [trainingMode]);

  const visibleRooms = useMemo(() => {
    const cleaningStatuses = [
      "Dirty / Needs Cleaning",
      "Being Cleaned",
      "Pending Approval",
    ];
    let data = rooms.filter((r) => r.isActive !== false);
    if (roomIdParam) data = data.filter((r) => r.id === roomIdParam);
    return data.filter((r) => cleaningStatuses.includes(r.status));
  }, [rooms, roomIdParam]);

  useEffect(() => {
    if (!selectedRoomId) {
      setLogs([]);
      return;
    }
    const unsub = subscribeToHousekeepingLogsForRoom(
      selectedRoomId,
      (data) => setLogs(data),
      { trainingMode },
    );
    return () => unsub();
  }, [selectedRoomId, trainingMode]);

  function getAssignmentForRoom(room) {
    if (assignments[room.id]) return assignments[room.id];
    if (room.assignedToUserId) {
      return {
        userId: room.assignedToUserId,
        name: room.assignedToName || "Assigned staff",
      };
    }
    if (user?.uid) {
      return { userId: user.uid, name: currentStaffName };
    }
    return { userId: "", name: "" };
  }

  function setAssignmentForRoom(roomId, userId, name) {
    setAssignments((prev) => ({
      ...prev,
      [roomId]: { userId, name },
    }));
  }

  function toggleSelectRoom(roomId) {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

  function handleVerificationPhotosChange(roomId, photos) {
    setVerificationPhotosByRoom((prev) => ({ ...prev, [roomId]: photos }));
  }

  async function moveRoom(room, nextStatus) {
    try {
      setError(null);
      const assignment = getAssignmentForRoom(room);
      const photoUrls = verificationPhotosByRoom[room.id] || [];

      await updateRoomStatus({
        roomId: room.id,
        newStatus: nextStatus,
        changedByRole: "fo",
        changedByUserId: user?.uid || null,
        changedByName: currentStaffName,
        assignedToUserId:
          nextStatus === "Being Cleaned" ? assignment.userId : undefined,
        assignedToName:
          nextStatus === "Being Cleaned" ? assignment.name : undefined,
        photoUrls:
          nextStatus === "Pending Approval" && photoUrls.length > 0
            ? photoUrls
            : [],
        trainingMode,
      });

      if (nextStatus === "Available" || nextStatus === "Pending Approval") {
        setVerificationPhotosByRoom((prev) => {
          const next = { ...prev };
          delete next[room.id];
          return next;
        });
      }

      if (nextStatus === "Available") {
        setSelectedRoomIds((prev) => {
          const next = new Set(prev);
          next.delete(room.id);
          return next;
        });
      }

      toast.success(
        `${room.name || room.roomNumber || "Room"} moved to ${nextStatus}`,
      );
    } catch (e) {
      setError(e?.message || "Failed to update room status.");
      toast.error(e?.message || "Failed to update room status.");
    }
  }

  async function onReassign(roomId, userId) {
    const staff = staffUsers.find((u) => u.id === userId);
    const name = staff ? getStaffLabel(staff) : "";
    setAssignmentForRoom(roomId, userId, name);
    try {
      setError(null);
      await assignHousekeepingStaff({
        roomId,
        assignedToUserId: userId,
        assignedToName: name,
        trainingMode,
      });
    } catch (e) {
      setError(e?.message || "Failed to assign staff.");
    }
  }

  async function handleBulkApprove() {
    const roomIds = visibleRooms
      .filter(
        (room) =>
          room.status === "Pending Approval" && selectedRoomIds.has(room.id),
      )
      .map((room) => room.id);

    if (roomIds.length === 0) return;

    try {
      setError(null);
      const { succeeded, failed } = await bulkUpdateRoomStatus({
        roomIds,
        newStatus: "Available",
        changedByRole: "fo",
        changedByUserId: user?.uid || null,
        changedByName: currentStaffName,
        trainingMode,
      });

      setSelectedRoomIds((prev) => {
        const next = new Set(prev);
        succeeded.forEach((id) => next.delete(id));
        return next;
      });

      if (succeeded.length > 0) {
        toast.success(`Approved ${succeeded.length} room(s)`);
      }
      if (failed.length > 0) {
        toast.error(`Failed to approve ${failed.length} room(s)`);
      }
    } catch (e) {
      setError(e?.message || "Bulk approve failed.");
      toast.error(e?.message || "Bulk approve failed.");
    }
  }

  const selectedRoom = visibleRooms.find((r) => r.id === selectedRoomId);
  const selectedAssignment = selectedRoom
    ? getAssignmentForRoom(selectedRoom)
    : null;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">Housekeeping</h1>
        <p className="text-foreground/80">
          Drag rooms across columns or use bulk approve for pending rooms.
          Upload photos before sending to review.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-background p-5 text-sm text-foreground/70">
          Loading rooms...
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-7">
          <div className="space-y-3 xl:col-span-5">
            {visibleRooms.length === 0 ? (
              <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                No rooms in housekeeping workflow right now.
              </div>
            ) : (
              <HousekeepingKanban
                rooms={visibleRooms}
                getAssignmentForRoom={getAssignmentForRoom}
                verificationPhotosByRoom={verificationPhotosByRoom}
                onVerificationPhotosChange={handleVerificationPhotosChange}
                selectedRoomIds={selectedRoomIds}
                onToggleSelect={toggleSelectRoom}
                onSelectRoom={setSelectedRoomId}
                onMoveRoom={moveRoom}
                onBulkApprove={handleBulkApprove}
                onApproveRoom={(room) => moveRoom(room, "Available")}
              />
            )}
          </div>

          <div className="space-y-3 xl:col-span-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="font-semibold">Housekeeping Logs</div>
              <div className="mt-1 text-sm text-foreground/70">
                {selectedRoomId
                  ? "Room status history"
                  : "Select a room to view logs"}
              </div>
            </div>

            {selectedRoom &&
              (selectedRoom.status === "Dirty / Needs Cleaning" ||
                selectedRoom.status === "Being Cleaned") &&
              staffUsers.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-border bg-background p-4">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
                    Assign staff
                  </label>
                  <Select.Root
                    value={selectedAssignment?.userId || undefined}
                    onValueChange={(value) => onReassign(selectedRoom.id, value)}
                  >
                    <Select.Trigger className={SELECT_TRIGGER_CLASS}>
                      <Select.Value placeholder="Select staff" />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className={SELECT_CONTENT_CLASS}>
                        <Select.Viewport>
                          {staffUsers.map((staff) => (
                            <Select.Item
                              key={staff.id}
                              value={staff.id}
                              className={SELECT_ITEM_CLASS}
                            >
                              <Select.ItemText>
                                {getStaffLabel(staff)}
                              </Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              )}

            {selectedRoomId ? (
              logs.length === 0 ? (
                <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                  No logs yet for this room.
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.slice(0, 10).map((l) => {
                    const ts = l.createdAt?.toDate
                      ? l.createdAt.toDate()
                      : null;
                    const timeStr = ts ? ts.toLocaleString() : "—";
                    const performer =
                      l.changedByName || l.changedByRole || "—";
                    const photos = Array.isArray(l.photoUrls) ? l.photoUrls : [];

                    return (
                      <div
                        key={l.id}
                        className="space-y-1 rounded-xl border border-border bg-background p-3 text-sm"
                      >
                        <div className="font-semibold">
                          {l.fromStatus} → {l.toStatus}
                        </div>
                        <div className="text-foreground/70">
                          Performed by: {performer}
                        </div>
                        {photos.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {photos.map((url) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="block overflow-hidden rounded-md border border-border"
                              >
                                <img
                                  src={url}
                                  alt="Verification"
                                  className="h-12 w-12 object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                        {l.note ? (
                          <div className="text-foreground/70">
                            Note: {l.note}
                          </div>
                        ) : null}
                        <div className="text-xs text-foreground/50">
                          {timeStr}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
