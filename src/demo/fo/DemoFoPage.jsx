import { useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import HousekeepingList from "@/components/housekeeping/HousekeepingList";
import RoomScheduleTape from "@/components/dashboard/RoomScheduleTape";
import demoToast from "../demoToast";
import { roomLabel } from "@/lib/room-label";
import { useDemo } from "../DemoContext";

const TABS = ["Dashboard", "Bookings", "Payments", "Housekeeping"];

function paidFor(payments, bookingId) {
  return payments.filter((p) => p.bookingId === bookingId).reduce((s, p) => s + Number(p.amount ?? 0), 0);
}

export default function DemoFoPage() {
  const { role, data, fo, demoNotify } = useDemo();
  const [tab, setTab] = useState("Dashboard");
  const [payBookingId, setPayBookingId] = useState("demo-bk-approved");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");

  if (!role) return <Navigate to="/demo" replace />;

  const roomsById = new Map(data.rooms.map((r) => [r.id, r]));
  const pending = data.bookings.filter((b) => b.status === "Pending");
  const approved = data.bookings.filter((b) => b.status === "Approved");
  const checkedIn = data.bookings.filter((b) => b.status === "Checked In");
  const payBooking = data.bookings.find((b) => b.id === payBookingId) ?? approved[0] ?? checkedIn[0];
  const balance = payBooking ? Math.max(0, Number(payBooking.totalCost ?? 0) - paidFor(data.payments, payBooking.id)) : 0;
  const dirtyRooms = data.rooms.filter((r) => ["Dirty / Needs Cleaning", "Being Cleaned", "Pending Approval"].includes(r.status));

  function approve(id) {
    fo.demoApproveBooking({ bookingId: id });
    toast.success("Demo: booking approved. Guest inbox notified.");
  }

  function checkIn(id) {
    fo.demoCheckIn({ bookingId: id });
    toast.success("Demo: guest checked in.");
  }

  function selectPay(id) {
    setPayBookingId(id);
    const b = data.bookings.find((x) => x.id === id);
    if (b) setAmount(String(Math.max(0, Number(b.totalCost ?? 0) - paidFor(data.payments, b.id))));
  }

  function record() {
    const amt = Number(amount);
    if (!payBooking || !Number.isFinite(amt) || amt <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }
    if (amt > balance + 0.01) {
      toast.error(`Payment amount cannot exceed the remaining balance of ₱${balance.toLocaleString()}.`);
      return;
    }
    fo.demoRecordPayment({ bookingId: payBooking.id, amount: amt, method });
    toast.success(`Demo: ₱${amt.toLocaleString()} recorded. Nothing was charged.`);
    setAmount("");
  }

  function advance(requestId, roomName) {
    fo.demoAdvanceCleaning({ requestId });
    // Simulated async delivery, like the real outbox sweep.
    setTimeout(() => {
      demoNotify({ type: "housekeeping_in_progress", title: "Housekeeping update (demo)", message: `${roomName} cleaning advanced.`, link: "/demo/fo" });
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

  // Assignments and photo drafts are disabled in demo.
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

  const staffUsers = data.users.filter((u) => u.role === "fo");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-playfair text-3xl font-semibold">Front Office Demo</h1>
        <p className="text-sm text-foreground/70">Simulated operations on sample data. No bookings, payments, or notifications are real.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>

      {tab === "Dashboard" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Available rooms", data.rooms.filter((r) => r.status === "Available").length],
            ["Pending bookings", pending.length],
            ["Checked in", checkedIn.length],
            ["Rooms needing cleaning", dirtyRooms.length],
          ].map(([label, value]) => (
            <Card key={label} className="p-4 text-center">
              <div className="text-2xl font-bold tabular-nums">{value}</div>
              <div className="text-xs text-foreground/60">{label}</div>
            </Card>
          ))}
          <div className="sm:col-span-2">
            <RoomScheduleTape
              rooms={data.rooms}
              bookings={data.bookings}
              onSelectBooking={(booking) => {
                setTab("Bookings");
                toast.message(`Demo: ${booking.id} selected — see the Bookings tab.`);
              }}
            />
          </div>
        </div>
      )}

      {tab === "Bookings" && (
        <div className="space-y-2">
          {pending.length === 0 && <p className="text-sm text-foreground/60">No pending requests in the sample data.</p>}
          {pending.map((b) => (
            <Card key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="text-sm font-medium">{roomsById.get(b.roomId) ? roomLabel(roomsById.get(b.roomId)) : b.roomId} · {b.nights} night{b.nights !== 1 ? "s" : ""}</div>
              <div className="flex gap-1.5">
                <Button size="sm" className="h-8 text-xs" onClick={() => approve(b.id)}>Approve (demo)</Button>
              </div>
            </Card>
          ))}
          {approved.map((b) => (
            <Card key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="text-sm font-medium">{roomsById.get(b.roomId) ? roomLabel(roomsById.get(b.roomId)) : b.roomId} · Approved</div>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => checkIn(b.id)}>Check in (demo)</Button>
            </Card>
          ))}
        </div>
      )}

      {tab === "Payments" && (
        <Card className="space-y-3 p-4">
          <div className="font-semibold text-sm">Record payment (demo)</div>
          <div className="flex flex-wrap gap-1.5">
            {[...approved, ...checkedIn].map((b) => (
              <Button key={b.id} variant={payBooking?.id === b.id ? "default" : "outline"} size="sm" className="h-8 text-xs"
                onClick={() => selectPay(b.id)}>
                {roomsById.get(b.roomId) ? roomLabel(roomsById.get(b.roomId)) : b.roomId}
              </Button>
            ))}
          </div>
          {payBooking ? (
            <>
              <p className="text-xs text-foreground/60 tabular-nums">
                Total PHP {Number(payBooking.totalCost).toLocaleString()} · Paid PHP {paidFor(data.payments, payBooking.id).toLocaleString()} · Balance PHP {balance.toLocaleString()}
              </p>
              <div className="flex flex-wrap gap-2">
                <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="max-w-40" />
                <Button size="sm" onClick={record}>Record (demo)</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Cash", "GCash", "Check", "Credit Card"].map((m) => (
                  <Button key={m} variant={method === m ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setMethod(m)}>{m}</Button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-foreground/60">No payable booking in the sample data.</p>
          )}
        </Card>
      )}

      {tab === "Housekeeping" && (
        <div className="space-y-2">
          {dirtyRooms.length === 0 && <p className="text-sm text-foreground/60">No rooms need cleaning in the sample data.</p>}
          {dirtyRooms.length > 0 && (
            <HousekeepingList
              rooms={dirtyRooms}
              getAssignmentForRoom={assignmentFor}
              staffUsers={staffUsers}
              onReassign={demoDisabled}
              verificationPhotosByRoom={{}}
              onVerificationPhotosChange={demoDisabled}
              onOpenLogs={(room) => {
                const count = data.housekeepingLogs.filter((l) => l.roomId === room.id).length;
                toast.message(`${room.name}: ${count} log entr${count === 1 ? "y" : "ies"} in the sample data.`);
              }}
              onMoveRoom={(room) => moveRoom(room)}
              onApproveRoom={(room) => moveRoom(room)}
              mode="turnover"
              disableUploads
            />
          )}
        </div>
      )}
    </div>
  );
}
