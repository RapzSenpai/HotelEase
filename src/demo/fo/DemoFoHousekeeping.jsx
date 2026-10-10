import { useEffect, useRef } from "react";
import { toast } from "sonner";
import HousekeepingList from "@/components/housekeeping/HousekeepingList";
import DemoSectionHeader from "../DemoSectionHeader";
import demoToast from "../demoToast";
import { useDemo } from "../DemoContext";
import { dirtyRooms } from "./foDemoData";

export default function DemoFoHousekeeping() {
  const { data, fo, demoNotify } = useDemo();
  const timeoutRef = useRef(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function advance(requestId, roomName) {
    fo.demoAdvanceCleaning({ requestId });
    // Simulated async delivery, like the real outbox sweep.
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      demoNotify({
        type: "housekeeping_in_progress",
        title: "Housekeeping update (demo)",
        message: `${roomName} cleaning advanced.`,
        link: "/demo/fo/housekeeping",
      });
      toast.message("Housekeeping update (demo)", { description: `${roomName} cleaning advanced.` });
    }, 3000);
    toast.success("Demo: cleaning advanced. Notification lands in ~3s.");
  }

  function latestRequestId(roomId) {
    const logs = data.housekeepingLogs
      .filter((l) => l.roomId === roomId)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    return logs[0]?.requestId ?? null;
  }

  function moveRoom(room) {
    const requestId = latestRequestId(room.id);
    if (!requestId) {
      toast.message("Demo — no cleaning cycle for this room yet.");
      return;
    }
    advance(requestId, room.name);
  }

  // Reassignment and photo proof are disabled in demo.
  function demoDisabled() {
    demoToast();
  }

  function assignmentFor(room) {
    const latest = data.housekeepingLogs
      .filter((l) => l.roomId === room.id)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];
    if (!latest) return null;
    return { userId: latest.changedByUserId, name: latest.changedByName };
  }

  const rooms = dirtyRooms(data.rooms);
  const staffUsers = data.users.filter((u) => u.role === "fo");

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label="Housekeeping"
        role="fo"
        description="Cleaning cycle for rooms needing turnover — start cleaning, submit for review, approve. Uploads are disabled here."
      />
      {rooms.length === 0 ? (
        <p className="text-sm text-foreground/60">No rooms need cleaning in the sample data.</p>
      ) : (
        <HousekeepingList
          rooms={rooms}
          getAssignmentForRoom={assignmentFor}
          staffUsers={staffUsers}
          onReassign={demoDisabled}
          verificationPhotosByRoom={{}}
          onVerificationPhotosChange={demoDisabled}
          onOpenLogs={(room) => {
            const count = data.housekeepingLogs.filter((l) => l.roomId === room.id).length;
            toast.message(
              `${room.name}: ${count} log entr${count === 1 ? "y" : "ies"} in the sample data.`,
            );
          }}
          onMoveRoom={(room) => moveRoom(room)}
          onApproveRoom={(room) => moveRoom(room)}
          mode="turnover"
          disableUploads
        />
      )}
    </div>
  );
}
