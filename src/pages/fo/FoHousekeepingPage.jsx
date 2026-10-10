import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { StarRating } from "@/components/common/StarRating";
import { subscribeToRooms } from "@/services/roomsService";
import { listStaffUsers } from "@/services/userService";
import { isOnlineNow } from "@/services/presenceService";
import HousekeepingKanban from "@/components/housekeeping/HousekeepingKanban";
import HousekeepingList from "@/components/housekeeping/HousekeepingList";
import HousekeepingPhotoUpload from "@/components/housekeeping/HousekeepingPhotoUpload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle} from "@/components/ui/dialog";
import {
  updateRoomStatus,
  assignHousekeepingStaff,
  bulkUpdateRoomStatus,
  saveHousekeepingPhotos,
  subscribeToHousekeepingLogsForRoom} from "@/services/housekeepingService";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

function getStaffLabel(user) {
  return user.fullName || user.email || user.id;
}

function toDateSafe(v) {
  if (!v) return null;
  try {
    const d = v?.toDate?.() || new Date(v);
    return d instanceof Date && !isNaN(d) ? d : null;
  } catch {
    return null;
  }
}

const MID_STAY_URGENT_MS = 2 * 60 * 60 * 1000;

export default function FoHousekeepingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomIdParam = searchParams.get("roomId");
  const { user, profile } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [verificationPhotosByRoom, setVerificationPhotosByRoom] = useState({});
  const [selectedRoomIds, setSelectedRoomIds] = useState(new Set());

  const [approveRoom, setApproveRoom] = useState(null);
  const [approvePhotos, setApprovePhotos] = useState([]);
  const [approveOthersOnline, setApproveOthersOnline] = useState(false);
  const [approveChecking, setApproveChecking] = useState(false);

  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsRequestId, setLogsRequestId] = useState(0);
  const [viewMode, setViewMode] = useState("kanban");
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("turnover");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [tabOverrideRoomId, setTabOverrideRoomId] = useState(null);

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
      });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

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
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadStaff() {
      try {
        // P2 scalability: staff-only query instead of the whole users list.
        const users = await listStaffUsers();
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
  }, []);

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

  const turnoverRooms = useMemo(
    () => visibleRooms.filter((r) => !r.isMidStayRequest),
    [visibleRooms]);

  const midStayRooms = useMemo(
    () => visibleRooms.filter((r) => r.isMidStayRequest === true),
    [visibleRooms]);

  const hasMidStayPending = useMemo(
    () =>
      rooms.some(
        (r) =>
          r.isActive !== false &&
          r.isMidStayRequest === true &&
          r.status === "Dirty / Needs Cleaning"),
    [rooms]);

  // Display-only urgency: wait > 2h surfaces via the existing midStayNote line.
  // No schema change, no priority field write.
  const midStayDisplayRooms = useMemo(() => {
    return midStayRooms.map((room) => {
      const requestedAt = toDateSafe(room.midStayRequestedAt);
      if (!requestedAt) return { ...room, midStayUrgency: "" };
      const elapsedMs = nowMs - requestedAt.getTime();
      if (elapsedMs <= MID_STAY_URGENT_MS) return { ...room, midStayUrgency: "" };
      const hours = Math.floor(elapsedMs / 3600000);
      return { ...room, midStayUrgency: `URGENT — waiting ${hours}h` };
    });
  }, [midStayRooms, nowMs]);

  const filteredRoom = useMemo(
    () =>
      rooms.find((r) => r.id === roomIdParam && r.isActive !== false) || null,
    [rooms, roomIdParam]);
  const deepLinkTab = filteredRoom
    ? filteredRoom.isMidStayRequest === true
      ? "midstay"
      : "turnover"
    : null;
  const visibleActiveTab =
    deepLinkTab && tabOverrideRoomId !== roomIdParam
      ? deepLinkTab
      : activeTab;

  function selectActiveTab(tab) {
    if (roomIdParam) setTabOverrideRoomId(roomIdParam);
    setActiveTab(tab);
  }

  // Clear a stale/invalid ?roomId= deep-link once rooms have loaded.
  useEffect(() => {
    if (!loading && roomIdParam && !filteredRoom) {
      navigate("/fo/housekeeping", { replace: true });
    }
  }, [loading, roomIdParam, filteredRoom, navigate]);

  useEffect(() => {
    if (!selectedRoomId) return;
    let active = true;
    const unsub = subscribeToHousekeepingLogsForRoom(
      selectedRoomId,
      (data) => {
        if (!active) return;
        setLogs(data);
        setLogsLoading(false);
      });
    return () => {
      active = false;
      unsub();
    };
  }, [selectedRoomId, logsRequestId]);

  // Stored assignment only — no FO self-default. An empty room shows the
  // "Cleaner name" placeholder instead of the current user. The starter is
  // tracked separately (cleaningStartedBy*) for the approval gate.
  function getAssignmentForRoom(room) {
    if (assignments[room.id]) return assignments[room.id];
    if (room.assignedToUserId || room.assignedToName) {
      return {
        userId: room.assignedToUserId || null,
        name: room.assignedToName || "Assigned staff"};
    }
    return { userId: null, name: "" };
  }

  function setAssignmentForRoom(roomId, userId, name) {
    setAssignments((prev) => ({
      ...prev,
      [roomId]: { userId, name }}));
  }

  function toggleSelectRoom(roomId) {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

  // Single logs opener for every view (midstay/table/kanban dots). Bumps a
  // request nonce so the loader effect refires even when the room is already
  // selected — setSelectedRoomId alone is a no-op for the same id, which used
  // to strand the dialog on "Loading..." forever.
  function openLogsFor(room) {
    const nextRoomId = room?.id ?? room;
    setSelectedRoomId(nextRoomId);
    setLogs([]);
    setLogsLoading(true);
    setLogsRequestId((n) => n + 1);
    setLogsDialogOpen(true);
  }

  function handleVerificationPhotosChange(roomId, photos) {
    setVerificationPhotosByRoom((prev) => ({ ...prev, [roomId]: photos }));
    // Persist immediately so a page reload or status move never loses photos.
    saveHousekeepingPhotos({ roomId, photoUrls: photos}).catch(() => {
      // Non-fatal: the in-memory draft is kept; the next change retries.
    });
  }

  // Four-eyes helpers: the starter is whoever clicked Start Clean.
  function isSelfStarted(room) {
    return !!(
      room?.cleaningStartedByUserId &&
      user?.uid &&
      room.cleaningStartedByUserId === user.uid
    );
  }

  // Fresh presence check so a just-logged-in FO is never missed.
  // Returns null when the check itself fails — callers fail closed.
  async function otherFoOnDuty() {
    try {
      const users = await listStaffUsers();
      setStaffUsers(users);
      return users.some(
        (u) => u.role === "fo" && u.id !== user?.uid && isOnlineNow(u),
      );
    } catch {
      return null;
    }
  }

  async function moveRoom(room, nextStatus, opts = {}) {
    try {
      setError(null);
      const assignment = getAssignmentForRoom(room);
      const photoUrls = effectiveVerificationPhotosByRoom[room.id] || [];
      const inspectionPhotos = opts.inspectionPhotos || [];

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
            : nextStatus === "Available" && inspectionPhotos.length > 0
              ? inspectionPhotos
              : [],
        otherFoOnline:
          nextStatus === "Available" ? !!opts.otherFoOnline : false});

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
        `${room.name || room.roomNumber || "Room"} moved to ${nextStatus}`);
    } catch (e) {
      setError(e?.message || "Failed to update room status.");
      toast.error(e?.message || "Failed to update room status.");
    }
  }

  // Assignment is a cleaner NAME (crew has no accounts). A staff uid still
  // resolves to its label for back-compat; anything else is a cleaner name.
  async function onReassign(roomId, value) {
    const staff = staffUsers.find((u) => u.id === value);
    const userId = staff ? staff.id : null;
    const name = staff ? getStaffLabel(staff) : String(value || "").trim();
    setAssignmentForRoom(roomId, userId, name);
    try {
      setError(null);
      await assignHousekeepingStaff({
        roomId,
        assignedToUserId: userId,
        assignedToName: name});
      if (name) toast.success(`Cleaner assigned: ${name}`);
    } catch (e) {
      setError(e?.message || "Failed to assign staff.");
    }
  }

  // Approve entry point for every view: second-person approves in one
  // click; self-approval goes through the inspection dialog instead.
  async function handleApprove(room) {
    if (!isSelfStarted(room)) {
      moveRoom(room, "Available");
      return;
    }
    // Open first so the dialog shows its checking state while presence
    // resolves; the confirm button stays disabled until then.
    setApproveRoom(room);
    setApproveChecking(true);
    setApprovePhotos([]);
    try {
      const others = await otherFoOnDuty();
      if (others === null) {
        // Presence check failed — fail closed instead of assuming solo.
        setApproveRoom(null);
        toast.error("Could not verify on-duty staff. Try approving again.");
        return;
      }
      setApproveOthersOnline(others);
    } finally {
      setApproveChecking(false);
    }
  }

  async function confirmSelfApprove() {
    if (!approveRoom) return;
    await moveRoom(approveRoom, "Available", {
      inspectionPhotos: approvePhotos,
      otherFoOnline: approveOthersOnline,
    });
    setApproveRoom(null);
    setApprovePhotos([]);
  }

  async function handleBulkApprove() {
    const sourceRooms =
      visibleActiveTab === "midstay" ? midStayRooms : turnoverRooms;
    const pendingSelected = sourceRooms.filter(
      (room) =>
        room.status === "Pending Approval" && selectedRoomIds.has(room.id),
    );
    // Bulk cannot attach per-room inspection photos, so self-started rooms
    // are always skipped here — approve those one by one instead.
    const skippedSelf = pendingSelected.filter((room) => isSelfStarted(room));
    const roomIds = pendingSelected
      .filter((room) => !isSelfStarted(room))
      .map((room) => room.id);

    if (roomIds.length === 0) {
      if (skippedSelf.length > 0) {
        toast.message(
          "Bulk approve skipped rooms you started — approve those one by one.",
        );
      }
      return;
    }

    try {
      setError(null);
      const { succeeded, failed } = await bulkUpdateRoomStatus({
        roomIds,
        newStatus: "Available",
        changedByRole: "fo",
        changedByUserId: user?.uid || null,
        changedByName: currentStaffName});

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
      if (skippedSelf.length > 0) {
        toast.message(
          `Skipped ${skippedSelf.length} room(s) you started — approve those one by one.`,
        );
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
        {visibleActiveTab === "turnover" ? (
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
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => selectActiveTab("turnover")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            visibleActiveTab === "turnover"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
          }`}
        >
          Turnover
        </button>
        <button
          type="button"
          onClick={() => selectActiveTab("midstay")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            visibleActiveTab === "midstay"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
          }`}
        >
          Mid-stay Requests
          {hasMidStayPending ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          ) : null}
        </button>
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
            {visibleActiveTab === "midstay" ? (
              midStayDisplayRooms.length === 0 ? (
                <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                  No mid-stay requests right now.
                </div>
              ) : (
                <HousekeepingList
                  mode="midstay"
                  rooms={midStayDisplayRooms}
                  getAssignmentForRoom={getAssignmentForRoom}
                  staffUsers={staffUsers}
                  onReassign={onReassign}
                  verificationPhotosByRoom={effectiveVerificationPhotosByRoom}
                  onVerificationPhotosChange={handleVerificationPhotosChange}
                  onOpenLogs={openLogsFor}
                  onMoveRoom={moveRoom}
                  onApproveRoom={handleApprove}
                />
              )
            ) : turnoverRooms.length === 0 ? (
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
                rooms={turnoverRooms}
                getAssignmentForRoom={getAssignmentForRoom}
                verificationPhotosByRoom={effectiveVerificationPhotosByRoom}
                onVerificationPhotosChange={handleVerificationPhotosChange}
                selectedRoomIds={selectedRoomIds}
                onToggleSelect={toggleSelectRoom}
                onSelectRoom={setSelectedRoomId}
                onOpenLogs={openLogsFor}
                onMoveRoom={moveRoom}
                onBulkApprove={handleBulkApprove}
                onApproveRoom={handleApprove}
                staffUsers={staffUsers}
                onReassign={onReassign}
              />
            ) : (
              <HousekeepingList
                rooms={turnoverRooms}
                getAssignmentForRoom={getAssignmentForRoom}
                staffUsers={staffUsers}
                onReassign={onReassign}
                verificationPhotosByRoom={effectiveVerificationPhotosByRoom}
                onVerificationPhotosChange={handleVerificationPhotosChange}
                onOpenLogs={openLogsFor}
                onMoveRoom={moveRoom}
                onApproveRoom={handleApprove}
              />
            )}
          </div>
        </div>
      )}

      {/* Housekeeping Logs Dialog */}
      {/* Self-approval dialog: four-eyes check with a solo-shift bypass.
          Another FO online → blocked, ask them to inspect. Solo → at least
          1 inspection photo required as second-eyes evidence. */}
      <Dialog
        open={!!approveRoom}
        onOpenChange={(open) => {
          if (!open) {
            setApproveRoom(null);
            setApprovePhotos([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Approve {approveRoom?.name || approveRoom?.roomNumber || "room"}?
            </DialogTitle>
            <DialogDescription>
              You started this cleaning job. Ask another FO to inspect and approve it.
            </DialogDescription>
          </DialogHeader>
          {approveChecking ? (
            <p className="text-sm text-foreground/60">
              Checking who else is on duty...
            </p>
          ) : approveOthersOnline ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground/80">
              Another FO is on duty. Ask them to inspect and approve this room.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="rounded-lg border border-border bg-background p-3 text-sm text-foreground/70">
                You&apos;re the only FO on duty. Add at least one inspection
                photo to approve your own work. This is logged as a solo approval.
              </p>
              <HousekeepingPhotoUpload
                photos={approvePhotos}
                onChange={setApprovePhotos}
                label="Inspection photo"
                compact
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setApproveRoom(null);
                setApprovePhotos([]);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={approveChecking || approveOthersOnline || approvePhotos.length === 0}
              onClick={confirmSelfApprove}
            >
              Approve
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Housekeeping Logs</DialogTitle>
          </DialogHeader>
          {selectedRoomId ? (
            logsLoading ? (
              <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                Loading logs for this room...
              </div>
            ) : logs.length === 0 ? (
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
