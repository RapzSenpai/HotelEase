import { useEffect, useMemo, useState } from "react";
import { Select } from "radix-ui";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  AlertTriangle,
  Megaphone,
  Download,
  Loader2,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { subscribeToRooms } from "@/services/roomsService";
import {
  bulkUpdateRoomStatus,
  emergencySetRoomStatus,
  downloadDataCSV,
  exportRooms,
  exportUsers,
} from "@/services/bulkOperationsService";
import { createAnnouncement } from "@/services/announcementsService";
import { auditAction, AUDIT_ACTIONS } from "@/services/auditService";

const STATUS_OPTIONS = [
  "Available",
  "Reserved",
  "Occupied",
  "Being Cleaned",
  "Pending Approval",
  "Out of Order",
  "Dirty / Needs Cleaning",
];

const STATUS_COLORS = {
  "Available": "bg-success/10 text-success border-success/20",
  "Reserved": "bg-info/10 text-info border-info/20",
  "Occupied": "bg-warning/10 text-warning border-warning/20",
  "Being Cleaned": "bg-primary/10 text-primary border-primary/20",
  "Pending Approval": "bg-purple-100 text-purple-600 border-purple-200",
  "Out of Order": "bg-destructive/10 text-destructive border-destructive/20",
  "Dirty / Needs Cleaning": "bg-orange-100 text-orange-600 border-orange-200",
};

function StatusBadge({ status }) {
  return (
    <Badge className={`border ${STATUS_COLORS[status] || "bg-muted/50 text-foreground/60 border-border"}`}>
      {status}
    </Badge>
  );
}

export default function AdminOperationsPage() {
  const { trainingMode } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Bulk status update state
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("Available");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [currentStatusFilter, setCurrentStatusFilter] = useState("all");

  // Emergency override state
  const [emergencyRoomId, setEmergencyRoomId] = useState("");
  const [emergencyStatus, setEmergencyStatus] = useState("Available");
  const [emergencyNote, setEmergencyNote] = useState("");
  const [emergencyBusy, setEmergencyBusy] = useState(false);

  // System announcement state
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementDate, setAnnouncementDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [announcementBusy, setAnnouncementBusy] = useState(false);

  // Data export state
  const [exportBusy, setExportBusy] = useState(null);

  useEffect(() => {
    const unsub = subscribeToRooms(
      (data) => {
        setRooms(data);
        setLoadingRooms(false);
      },
      { trainingMode }
    );
    return () => unsub();
  }, [trainingMode]);

  const activeRooms = useMemo(
    () => rooms.filter((r) => r.isActive !== false),
    [rooms]
  );

  const filteredRooms = useMemo(() => {
    if (currentStatusFilter === "all") return activeRooms;
    return activeRooms.filter((r) => r.status === currentStatusFilter);
  }, [activeRooms, currentStatusFilter]);

  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    const ids = filteredRooms.map((r) => r.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : ids);
  }

  async function onBulkUpdate() {
    if (!selectedIds.length) {
      toast.error("Select at least one room");
      return;
    }
    setBulkBusy(true);
    try {
      const res = await bulkUpdateRoomStatus({
        roomIds: selectedIds,
        status: bulkStatus,
        trainingMode,
      });
      toast.success(`${res.updated} room(s) updated to "${bulkStatus}"`);
      auditAction(AUDIT_ACTIONS.ROOM_STATUS_CHANGE, {
        targetType: "room",
        changes: { count: res.updated, status: bulkStatus, roomIds: selectedIds },
        description: `Bulk updated ${res.updated} room(s) to ${bulkStatus}`,
        trainingMode,
      });
      setSelectedIds([]);
    } catch (e) {
      toast.error(e?.message || "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function onEmergencyOverride() {
    if (!emergencyRoomId) {
      toast.error("Select a room to override");
      return;
    }
    setEmergencyBusy(true);
    try {
      const room = rooms.find((r) => r.id === emergencyRoomId);
      await emergencySetRoomStatus({
        roomId: emergencyRoomId,
        status: emergencyStatus,
        note: emergencyNote,
        trainingMode,
      });
      toast.success(`Emergency override applied to ${room?.roomNumber || "room"}`);
      auditAction(AUDIT_ACTIONS.ROOM_STATUS_CHANGE, {
        targetId: emergencyRoomId,
        targetType: "room",
        changes: { status: emergencyStatus, note: emergencyNote, emergency: true },
        description: `Emergency override: ${room?.roomNumber || emergencyRoomId} → ${emergencyStatus}`,
        trainingMode,
      });
      setEmergencyNote("");
    } catch (e) {
      toast.error(e?.message || "Emergency override failed");
    } finally {
      setEmergencyBusy(false);
    }
  }

  async function onPublishAnnouncement() {
    if (!announcementTitle.trim() || !announcementBody.trim()) {
      toast.error("Title and message are required");
      return;
    }
    setAnnouncementBusy(true);
    try {
      await createAnnouncement({
        title: announcementTitle.trim(),
        description: announcementBody.trim(),
        date: announcementDate,
      });
      toast.success("Announcement published to all guests");
      auditAction(AUDIT_ACTIONS.ANNOUNCEMENT_CREATE, {
        targetType: "announcement",
        changes: { title: announcementTitle.trim() },
        description: `System announcement published: ${announcementTitle.trim()}`,
        trainingMode,
      });
      setAnnouncementTitle("");
      setAnnouncementBody("");
    } catch (e) {
      toast.error(e?.message || "Failed to publish announcement");
    } finally {
      setAnnouncementBusy(false);
    }
  }

  async function onExport(kind) {
    setExportBusy(kind);
    try {
      if (kind === "rooms") {
        const rows = await exportRooms({ trainingMode });
        const mapped = rows.map((r) => ({
          Room: r.roomNumber ?? "",
          Name: r.name ?? "",
          Type: r.type ?? "",
          Status: r.status ?? "",
          "Rate/Night": r.ratePerNight ?? "",
          Floor: r.floor ?? "",
          Active: r.isActive === false ? "No" : "Yes",
        }));
        if (!mapped.length) throw new Error("No rooms to export");
        downloadDataCSV(`rooms-${new Date().toISOString().split("T")[0]}.csv`, mapped);
        toast.success(`${mapped.length} room(s) exported`);
      } else if (kind === "users") {
        const rows = await exportUsers({ trainingMode });
        const mapped = rows.map((u) => ({
          Email: u.email ?? "",
          Name: u.fullName ?? "",
          Role: u.role ?? "",
          Phone: u.phone ?? "",
          Online: u.isOnline ? "Yes" : "No",
          "Last Seen": u.lastSeenAt?.toDate?.().toISOString() ?? u.lastSeenAt ?? "",
        }));
        if (!mapped.length) throw new Error("No users to export");
        downloadDataCSV(`users-${new Date().toISOString().split("T")[0]}.csv`, mapped);
        toast.success(`${mapped.length} user(s) exported`);
      }
    } catch (e) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-playfair text-4xl font-semibold tracking-tight">Operations</h1>
        <p className="text-foreground/60 max-w-lg">
          Bulk room status changes, emergency overrides, system announcements, and data exports.
        </p>
      </div>

      {trainingMode && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Training mode is active — these actions write to the training sandbox.
        </div>
      )}      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-6">
          {/* ── Bulk Room Status ── */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Layers className="h-5 w-5" />
                  </div>
                  Bulk Room Status
                </CardTitle>
              </div>
              <CardDescription>
                Select multiple rooms to update their status simultaneously.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter & Selection Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Filter List:</Label>
                  <Select.Root value={currentStatusFilter} onValueChange={setCurrentStatusFilter}>
                    <Select.Trigger className="flex h-9 w-44 items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors">
                      <Select.Value />
                      <ChevronDown className="h-4 w-4 opacity-50 ml-1.5 shrink-0 text-muted-foreground" />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                        <Select.Viewport>
                          <Select.Item value="all" className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                            <Select.ItemText>All Statuses ({activeRooms.length})</Select.ItemText>
                          </Select.Item>
                          {STATUS_OPTIONS.map((s) => {
                            const count = activeRooms.filter(r => r.status === s).length;
                            return (
                              <Select.Item key={s} value={s} className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                                <Select.ItemText>{s} ({count})</Select.ItemText>
                              </Select.Item>
                            );
                          })}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>

                <Button variant="outline" size="sm" onClick={toggleSelectAll} className="h-9 text-xs border-border/80 hover:bg-muted/40">
                  {filteredRooms.length && filteredRooms.every((r) => selectedIds.includes(r.id))
                    ? "Clear All"
                    : `Select All (${filteredRooms.length})`}
                </Button>
              </div>

              {/* Room Checkbox List */}
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border/60 p-2 bg-background">
                {loadingRooms ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading rooms…
                  </div>
                ) : filteredRooms.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No rooms match filter.</div>
                ) : (
                  filteredRooms.map((r) => {
                    const isSelected = selectedIds.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 transition-all ${
                          isSelected
                            ? "border-primary/50 bg-primary/10 shadow-sm"
                            : "border-border/60 bg-background hover:bg-muted/20 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary rounded cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelect(r.id)}
                          />
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {r.roomNumber ? `Room ${r.roomNumber}` : r.id.slice(0, 8)}
                          </span>
                        </div>
                        <StatusBadge status={r.status || "Available"} />
                      </label>
                    );
                  })
                )}
              </div>
            </CardContent>

            {/* Bulk Action Footer */}
            <CardFooter className="border-t border-border/60 p-4 flex flex-wrap items-center justify-between gap-3 bg-background">
              <div className="flex items-center gap-2.5">
                <Label className="text-xs font-semibold text-foreground whitespace-nowrap">Set New Status:</Label>
                <Select.Root value={bulkStatus} onValueChange={setBulkStatus}>
                  <Select.Trigger className="flex h-9 w-44 items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors">
                    <Select.Value />
                    <ChevronDown className="h-4 w-4 opacity-50 ml-1 shrink-0 text-muted-foreground" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                      <Select.Viewport>
                        {STATUS_OPTIONS.map((s) => (
                          <Select.Item key={s} value={s} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                            <Select.ItemText>{s}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
              <Button onClick={onBulkUpdate} disabled={bulkBusy || !selectedIds.length} className="h-9 px-4 text-xs gap-2">
                {bulkBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Update {selectedIds.length ? `${selectedIds.length} Room(s)` : "Selected"}
              </Button>
            </CardFooter>
          </Card>

          {/* ── Data Export ── */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Download className="h-5 w-5" />
                </div>
                Data Export
              </CardTitle>
              <CardDescription>
                Download current room or user records as CSV files.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="w-full h-9 text-xs justify-center gap-2 border-border/80 hover:bg-muted/40"
                onClick={() => onExport("rooms")}
                disabled={exportBusy !== null}
              >
                {exportBusy === "rooms" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-primary" />
                )}
                Export Rooms (CSV)
              </Button>
              <Button
                variant="outline"
                className="w-full h-9 text-xs justify-center gap-2 border-border/80 hover:bg-muted/40"
                onClick={() => onExport("users")}
                disabled={exportBusy !== null}
              >
                {exportBusy === "users" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-primary" />
                )}
                Export Users (CSV)
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-6">
          {/* ── Emergency Override ── */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                Emergency Override
              </CardTitle>
              <CardDescription>
                Force a single room status immediately for maintenance or emergency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Target Room</Label>
                <Select.Root value={emergencyRoomId} onValueChange={setEmergencyRoomId}>
                  <Select.Trigger className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors">
                    <Select.Value placeholder="Select a room…" />
                    <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0 text-muted-foreground" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                      <Select.Viewport>
                        {activeRooms.map((r) => (
                          <Select.Item key={r.id} value={r.id} className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                            <Select.ItemText>
                              {r.roomNumber ? `Room ${r.roomNumber}` : r.name || r.id.slice(0, 8)}
                            </Select.ItemText>
                            <span className="text-[10px] text-muted-foreground ml-2">({r.status || "Available"})</span>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Override Status To</Label>
                <Select.Root value={emergencyStatus} onValueChange={setEmergencyStatus}>
                  <Select.Trigger className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors">
                    <Select.Value />
                    <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0 text-muted-foreground" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                      <Select.Viewport>
                        {STATUS_OPTIONS.map((s) => (
                          <Select.Item key={s} value={s} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                            <Select.ItemText>{s}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emergencyNote" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason / Note (Optional)</Label>
                <Input
                  id="emergencyNote"
                  placeholder="e.g. Water leak, urgent electrical repair"
                  value={emergencyNote}
                  onChange={(e) => setEmergencyNote(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </CardContent>
            <CardFooter className="pt-2">
              <Button
                variant="destructive"
                className="w-full h-9 text-xs gap-2 font-medium"
                onClick={onEmergencyOverride}
                disabled={emergencyBusy}
              >
                {emergencyBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                Apply Emergency Override
              </Button>
            </CardFooter>
          </Card>

          {/* ── System Announcement ── */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Megaphone className="h-5 w-5" />
                </div>
                System Announcement
              </CardTitle>
              <CardDescription>
                Publish a broadcast notification to all registered guest accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="announcementTitle" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Announcement Title</Label>
                <Input
                  id="announcementTitle"
                  placeholder="e.g. Scheduled Pool Maintenance"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="announcementBody" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Message Content</Label>
                <Textarea
                  id="announcementBody"
                  rows={3}
                  placeholder="Details guests need to know…"
                  value={announcementBody}
                  onChange={(e) => setAnnouncementBody(e.target.value)}
                  className="text-xs min-h-[80px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="announcementDate" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Effective Date</Label>
                <Input
                  id="announcementDate"
                  type="date"
                  value={announcementDate}
                  onChange={(e) => setAnnouncementDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full h-9 text-xs gap-2"
                onClick={onPublishAnnouncement}
                disabled={announcementBusy}
              >
                {announcementBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Megaphone className="h-3.5 w-3.5" />
                )}
                Publish Announcement
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}