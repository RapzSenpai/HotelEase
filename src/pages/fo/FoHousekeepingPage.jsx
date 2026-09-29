import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { StarRating } from "@/components/common/StarRating";
import { subscribeToRooms } from "@/services/roomsService";
import { listStaffUsers } from "@/services/userService";
import HousekeepingKanban from "@/components/housekeeping/HousekeepingKanban";
import HousekeepingList from "@/components/housekeeping/HousekeepingList";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateRoomStatus,
  assignHousekeepingStaff,
  bulkUpdateRoomStatus,
  saveHousekeepingPhotos,
  subscribeToHousekeepingLogsForRoom,
} from "@/services/housekeepingService";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

function getStaffLabel(user) {
  return user.fullName || user.email || user.id;
}

export default function FoHousekeepingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [viewMode, setViewMode] = useState("kanban");
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);

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

  // Photos are persisted to the room doc as they upload, so after a reload the
  // in-memory draft is empty but the room still has them. Merge room.photoUrls
  // with the live draft (draft wins) at render time — no effect needed.
  const effectiveVerificationPhotosByRoom = useMemo(() => {
    const merged = {};
    rooms.forEach((room) => {
      if (Array.isArray(room.photoUrls) && room.photoUrls.length > 0) {
        merged[room.id] = room.photoUrls;
      }
    });
    return { ...merged, ...verificationPhotosByRoom };
  }, [rooms, verificationPhotosByRoom]);

  useEffect(() => {
    let isMounted = true;
    async function loadStaff() {
      try {
        // P2 scalability: staff-only query instead of the whole users list.
        const users = await listStaffUsers({ trainingMode: !!trainingMode });
        if (!isMounted) return;
        setStaffUsers(users);
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

  const filteredRoom = useMemo(
    () =>
      rooms.find((r) => r.id === roomIdParam && r.isActive !== false) || null,
    [rooms, roomIdParam],
  );

  // Clear a stale/invalid ?roomId= deep-link once rooms have loaded.
  useEffect(() => {
    if (!loading && roomIdParam && !filteredRoom) {
      navigate("/fo/housekeeping", { replace: true });
    }
  }, [loading, roomIdParam, filteredRoom, navigate]);

    // Reset logs when the selected room clears (during render, not in the effect).
  const [prevSelectedRoomId, setPrevSelectedRoomId] = useState(selectedRoomId);
  if (prevSelectedRoomId !== selectedRoomId) {
    setPrevSelectedRoomId(selectedRoomId);
    if (!selectedRoomId) {
      setLogs([]);
    }
  }

  useEffect(() => {
    if (!selectedRoomId) return;
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
    // Persist immediately so a page reload or status move never loses photos.
    saveHousekeepingPhotos({ roomId, photoUrls: photos, trainingMode }).catch(() => {
      // Non-fatal: the in-memory draft is kept; the next change retries.
    });
  }

  async function moveRoom(room, nextStatus) {
    try {
      setError(null);
      const assignment = getAssignmentForRoom(room);
      const photoUrls = effectiveVerificationPhotosByRoom[room.id] || [];

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

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-3xl font-semibold">Housekeeping</h1>
          <p className="text-foreground/80">
            Manage room cleaning status, assign staff, and approve completed cleanings.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-border/30 p-1 rounded-lg border border-border/50 shrink-0 self-start sm:self-auto">
          <Button
            variant={viewMode === "kanban" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("kanban")}
            className="h-8 text-xs font-semibold px-3"
          >
            Kanban Board
          </Button>
          <Button
            variant={viewMode === "table" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            className="h-8 text-xs font-semibold px-3"
          >
            Table List
          </Button>
        </div>
      </div>

      {filteredRoom && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span>Currently filtering by Room: <span className="font-semibold text-primary">{filteredRoom.name || roomIdParam}</span></span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/fo/housekeeping")}
            className="h-8 text-xs"
          >
            Show All Rooms
          </Button>
        </div>
      )}

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
        <div className="space-y-4">
          <div className="space-y-3">
            {visibleRooms.length === 0 ? (
              filteredRoom ? (
                <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                  {filteredRoom.name || roomIdParam} is not currently in the
                  housekeeping workflow.
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                  No rooms in housekeeping workflow right now.
                </div>
              )
            ) : viewMode === "kanban" ? (
              <HousekeepingKanban
                rooms={visibleRooms}
                getAssignmentForRoom={getAssignmentForRoom}
                verificationPhotosByRoom={effectiveVerificationPhotosByRoom}
                onVerificationPhotosChange={handleVerificationPhotosChange}
                selectedRoomIds={selectedRoomIds}
                onToggleSelect={toggleSelectRoom}
                onSelectRoom={setSelectedRoomId}
                onMoveRoom={moveRoom}
                onBulkApprove={handleBulkApprove}
                onApproveRoom={(room) => moveRoom(room, "Available")}
                staffUsers={staffUsers}
                onReassign={onReassign}
              />
            ) : (
              <HousekeepingList
                rooms={visibleRooms}
                getAssignmentForRoom={getAssignmentForRoom}
                staffUsers={staffUsers}
                onReassign={onReassign}
                verificationPhotosByRoom={effectiveVerificationPhotosByRoom}
                onVerificationPhotosChange={handleVerificationPhotosChange}
                selectedRoomIds={selectedRoomIds}
                onToggleSelect={toggleSelectRoom}
                onSelectRoom={setSelectedRoomId}
                onMoveRoom={moveRoom}
                onBulkApprove={handleBulkApprove}
                onApproveRoom={(room) => moveRoom(room, "Available")}
                selectedRoomId={selectedRoomId}
              />
            )}
          </div>

          {/* View Logs button */}
          {selectedRoomId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogsDialogOpen(true)}
              className="gap-2"
            >
              <History className="h-4 w-4" />
              View Housekeeping Logs
            </Button>
          )}
        </div>
      )}

      {/* Housekeeping Logs Dialog */}
      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Housekeeping Logs</DialogTitle>
          </DialogHeader>
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
                      {l.rating ? (
                        <div className="pt-1 flex items-center gap-2 text-sm">
                          <StarRating
                            rating={Math.min(5, Math.max(1, Number(l.rating) || 0))}
                            starClassName="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                          />
                          <span className="font-normal text-foreground/60">
                            Guest housekeeping rating
                          </span>
                          {l.ratingFeedback ? (
                            <span className="block text-xs italic font-normal text-foreground/70">
                              &ldquo;{l.ratingFeedback}&rdquo;
                            </span>
                          ) : null}
                        </div>
                      ) : null}
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
          ) : (
            <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
              Select a room to view logs.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
