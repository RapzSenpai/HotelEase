import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Plus, BedDouble } from "lucide-react";
import RoomsTableView from "@/components/rooms/RoomsTableView";
import RoomsGridView from "@/components/rooms/RoomsGridView";
import RoomsStatsBar from "@/components/rooms/RoomsStatsBar";
import RoomsFilterBar from "@/components/rooms/RoomsFilterBar";
import RoomFormSlideOver from "@/components/rooms/RoomFormSlideOver";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  deactivateRoom,
  activateRoom,
  createRoom,
  listRooms,
  updateRoom,
} from "@/services/roomsService";
import { getRoomCapacity, ROOM_TYPE_CAPACITY_DEFAULTS } from "@/lib/roomCapacity";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  "Available",
  "Reserved",
  "Occupied",
  "Being Cleaned",
  "Pending Approval",
  "Out of Order",
  "Dirty / Needs Cleaning",
];

const DEFAULT_TYPE_OPTIONS = ["Single Room", "Suite Room", "Presidential Room"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initialForm() {
  const defaults = ROOM_TYPE_CAPACITY_DEFAULTS["Single Room"];
  return {
    roomNumber: "",
    name: "",
    type: "Single Room",
    status: "Available",
    ratePerNight: "",
    basePax: String(defaults.basePax),
    maxPax: String(defaults.maxPax),
    extraPaxFee: String(defaults.extraPaxFee),
    description: "",
    floor: "",
    amenitiesCsv: "",
    policies: "Bookings may be cancelled while Pending at no cost. Once Approved, cancellation requests must be reviewed and approved by Front Office staff. Guests who repeatedly cancel approved bookings may be restricted from future cancellations (see cancellation limit). Cancellations are not guaranteed after check-in.",
    checkInTime: "",
    checkOutTime: "",
    facilitiesCsv: "",
    isActive: true,
    photos: [],
  };
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminRoomManagementPage() {
  const { trainingMode } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // --- New state for search/filter/sort ---
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [sortBy, setSortBy] = useState("number-asc");
  const [viewMode, setViewMode] = useState("compact"); // "compact" | "grid"
  const [formOpen, setFormOpen] = useState(false);

  // ---- fetch rooms ----
  // Explicit mode (never the override fallback) so training edits can
  // never land in production inventory.
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listRooms({ trainingMode });
      setRooms(data);
    } catch (e) {
      setError(e?.message || "Failed to load rooms.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingMode]);

  // ---- derived lists for filters ----
  const existingTypes = useMemo(() => {
    const set = new Set(DEFAULT_TYPE_OPTIONS);
    rooms.forEach((r) => { if (r.type) set.add(r.type); });
    return Array.from(set).sort();
  }, [rooms]);

  const existingFloors = useMemo(() => {
    const set = new Set();
    rooms.forEach((r) => { if (r.floor) set.add(String(r.floor)); });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [rooms]);

  // ---- stats ----
  const stats = useMemo(() => {
    const total = rooms.length;
    const active = rooms.filter((r) => r.isActive !== false);
    const available = active.filter((r) => r.status === "Available").length;
    const occupied = active.filter((r) => r.status === "Occupied").length;
    const reserved = active.filter((r) => r.status === "Reserved").length;
    const cleaning = active.filter((r) => r.status === "Being Cleaned" || r.status === "Dirty / Needs Cleaning").length;
    const outOfOrder = active.filter((r) => r.status === "Out of Order").length;
    const archived = rooms.filter((r) => r.isActive === false).length;
    return { total, available, occupied, reserved, cleaning, outOfOrder, archived };
  }, [rooms]);

  // ---- filtered + sorted rooms ----
  const filteredRooms = useMemo(() => {
    let result = [...rooms];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        const name = String(r.name ?? "").toLowerCase();
        const num = String(r.roomNumber ?? "").toLowerCase();
        const type = String(r.type ?? "").toLowerCase();
        return name.includes(q) || num.includes(q) || type.includes(q);
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((r) => r.type === typeFilter);
    }

    // Floor filter
    if (floorFilter !== "all") {
      result = result.filter((r) => String(r.floor) === floorFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "number-asc":
          return Number(a.roomNumber ?? 0) - Number(b.roomNumber ?? 0);
        case "number-desc":
          return Number(b.roomNumber ?? 0) - Number(a.roomNumber ?? 0);
        case "name-asc":
          return String(a.name ?? "").localeCompare(String(b.name ?? ""));
        case "name-desc":
          return String(b.name ?? "").localeCompare(String(a.name ?? ""));
        case "rate-asc":
          return Number(a.ratePerNight ?? 0) - Number(b.ratePerNight ?? 0);
        case "rate-desc":
          return Number(b.ratePerNight ?? 0) - Number(a.ratePerNight ?? 0);
        case "status":
          return String(a.status ?? "").localeCompare(String(b.status ?? ""));
        default:
          return 0;
      }
    });

    return result;
  }, [rooms, searchQuery, statusFilter, typeFilter, floorFilter, sortBy]);

  // ---- form handlers ----
  function validatePayload() {
    const payload = {
      roomNumber: String(form.roomNumber ?? "").trim(),
      name: String(form.name ?? "").trim(),
      type: String(form.type ?? "").trim(),
      status: String(form.status ?? "").trim(),
      ratePerNight: Number(form.ratePerNight ?? 0),
      basePax: Math.max(1, Number(form.basePax) || 1),
      maxPax: Math.max(1, Number(form.maxPax) || 1),
      extraPaxFee: Math.max(0, Number(form.extraPaxFee) || 0),
      description: String(form.description ?? "").trim(),
      floor: String(form.floor ?? "").trim(),
      amenities: String(form.amenitiesCsv ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      policies: String(form.policies ?? "").trim(),
      checkInTime: String(form.checkInTime ?? "").trim(),
      checkOutTime: String(form.checkOutTime ?? "").trim(),
      facilities: String(form.facilitiesCsv ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      isActive: !!form.isActive,
      photos: Array.isArray(form.photos) ? form.photos : [],
    };

    if (!payload.roomNumber) throw new Error("Room number is required.");
    if (!payload.name) throw new Error("Room name is required.");
    if (!payload.type) throw new Error("Room type is required.");
    if (!payload.status) throw new Error("Room status is required.");
    if (!Number.isFinite(payload.ratePerNight) || payload.ratePerNight <= 0)
      throw new Error("Rate per night must be a positive number.");
    if (payload.basePax > payload.maxPax)
      throw new Error("Base pax cannot exceed maximum pax capacity.");

    return payload;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError(null);

    let payload;
    try {
      payload = validatePayload();
    } catch (e) {
      setSubmitError(e?.message || "Invalid room data.");
      return;
    }

    try {
      setSubmitting(true);
      if (editingId) {
        await updateRoom(editingId, { ...payload, trainingMode });
      } else {
        await createRoom({ ...payload, trainingMode });
      }
      setEditingId(null);
      setForm(initialForm());
      setFormOpen(false);
      await refresh();
    } catch (e) {
      setSubmitError(e?.message || "Failed to save room.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onArchive(id) {
    if (!window.confirm("Archive this room? It will be hidden from guests.")) return;
    try {
      await deactivateRoom(id, { trainingMode });
      await refresh();
    } catch (e) {
      setSubmitError(e?.message || "Failed to archive room.");
    }
  }

  async function onRestore(id) {
    try {
      await activateRoom(id, { trainingMode });
      await refresh();
    } catch (e) {
      setSubmitError(e?.message || "Failed to restore room.");
    }
  }

  function startEdit(room) {
    const cap = getRoomCapacity(room);
    setEditingId(room.id);
    setForm({
      roomNumber: room.roomNumber ?? "",
      name: room.name ?? "",
      type: room.type ?? "Single Room",
      status: room.status ?? "Available",
      ratePerNight: String(room.ratePerNight ?? ""),
      basePax: String(cap.basePax),
      maxPax: String(cap.maxPax),
      extraPaxFee: String(cap.extraPaxFee),
      description: room.description ?? "",
      floor: room.floor ?? "",
      amenitiesCsv: Array.isArray(room.amenities) ? room.amenities.join(", ") : "",
      policies: room.policies ?? "",
      checkInTime: room.checkInTime ?? "",
      checkOutTime: room.checkOutTime ?? "",
      facilitiesCsv: Array.isArray(room.facilities) ? room.facilities.join(", ") : "",
      isActive: room.isActive !== false,
      photos: Array.isArray(room.photos) ? room.photos : [],
    });
    setSubmitError(null);
    setFormOpen(true);
  }

  function openNewForm() {
    setEditingId(null);
    setForm(initialForm());
    setSubmitError(null);
    setFormOpen(true);
  }

  const hasActiveFilters = searchQuery || statusFilter !== "all" || typeFilter !== "all" || floorFilter !== "all";

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setFloorFilter("all");
  }

  // ---- render ----
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-playfair text-4xl font-semibold tracking-tight">Inventory Control</h1>
          <p className="text-foreground/60 max-w-lg">
            Manage room details, availability status, and inventory state.
          </p>
        </div>
        <Button onClick={openNewForm} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Room
        </Button>
      </div>

      {/* ── Stats Bar ── */}
      <RoomsStatsBar stats={stats} />

      {/* ── Search + Filter Bar ── */}
      <RoomsFilterBar
        filters={{ searchQuery, statusFilter, typeFilter, floorFilter, sortBy, viewMode }}
        options={{ statuses: STATUS_OPTIONS, types: existingTypes, floors: existingFloors }}
        counts={{ filtered: filteredRooms.length, total: rooms.length }}
        hasActiveFilters={hasActiveFilters}
        onChange={{
          search: setSearchQuery,
          status: setStatusFilter,
          type: setTypeFilter,
          floor: setFloorFilter,
          sort: setSortBy,
          view: setViewMode,
        }}
        onClear={clearFilters}
      />

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
          {error}
        </div>
      )}

      {/* ── Room List ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-12 text-center">
          <BedDouble className="h-10 w-10 text-foreground/15 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground/50">
            {hasActiveFilters ? "No rooms match your filters." : "No rooms found."}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : viewMode === "compact" ? (
        /* ── Compact Table View ── */
        <RoomsTableView
          rooms={filteredRooms}
          onEdit={startEdit}
          onArchive={onArchive}
          onRestore={onRestore}
        />
      ) : (
        /* ── Grid Card View ── */
        <RoomsGridView
          rooms={filteredRooms}
          onEdit={startEdit}
          onArchive={onArchive}
          onRestore={onRestore}
        />
      )}

      {/* ── Slide-Over Form ── */}
      <RoomFormSlideOver
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingId(null); setForm(initialForm()); setSubmitError(null); }}
        editingId={editingId}
        form={form}
        setForm={setForm}
        submitError={submitError}
        submitting={submitting}
        onSubmit={onSubmit}
        existingTypes={existingTypes}
        statusOptions={STATUS_OPTIONS}
      />
    </div>
  );
}
