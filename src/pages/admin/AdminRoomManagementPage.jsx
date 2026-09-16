import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { Card } from "@/components/ui/card";
import {
  Upload, Plus, Edit, Trash2, BedDouble,
  X,
  ChevronDown, Image, Check,
} from "lucide-react";
import RoomsTableView from "@/components/rooms/RoomsTableView";
import RoomsGridView from "@/components/rooms/RoomsGridView";
import RoomsStatsBar from "@/components/rooms/RoomsStatsBar";
import RoomsFilterBar from "@/components/rooms/RoomsFilterBar";
import RoomPhotoUploader from "@/components/rooms/RoomPhotoUploader";
import RoomTagInput from "@/components/rooms/RoomTagInput";
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

const SELECT_TRIGGER_CLASS =
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
// Predefined options for tag inputs
// ---------------------------------------------------------------------------

const PRESET_AMENITIES = [
  "Wifi", "Air Conditioning", "TV", "Private Bathroom", "Minibar",
  "Room Service", "Parking", "Balcony", "In-Room Safe", "Coffee Maker",
];

const PRESET_FACILITIES = [
  "Swimming Pool", "Gym", "Spa", "Restaurant", "Bar", "Laundry",
  "Concierge", "Airport Shuttle", "Business Center", "Garden",
];

// ---------------------------------------------------------------------------
// Centered Modal Form
// ---------------------------------------------------------------------------

function SlideOverForm({ open, onClose, editingId, form, setForm, submitError, submitting, onSubmit, existingTypes }) {
  const [policiesOpen, setPoliciesOpen] = useState(false);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Centered Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-2xl max-h-[90vh] bg-background rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-primary/10">
                {editingId ? (
                  <Edit className="h-4 w-4 text-primary" />
                ) : (
                  <Plus className="h-4 w-4 text-primary" />
                )}
              </div>
              <h2 className="text-sm font-semibold">
                {editingId ? "Edit Room" : "Add New Room"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable Form */}
          <form onSubmit={onSubmit} className="overflow-y-auto flex-1 p-5 space-y-6">

          {/* ── Section: Basic Info ── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">Basic Info</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="so-roomNumber" className="text-xs font-medium text-foreground/60">Room Number <RequiredIndicator /></Label>
                <Input
                  id="so-roomNumber"
                  required
                  value={form.roomNumber}
                  onChange={(e) => setForm((p) => ({ ...p, roomNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="so-floor" className="text-xs font-medium text-foreground/60">Floor</Label>
                <Input
                  id="so-floor"
                  value={form.floor}
                  onChange={(e) => setForm((p) => ({ ...p, floor: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="so-name" className="text-xs font-medium text-foreground/60">Room Name <RequiredIndicator /></Label>
              <Input
                id="so-name"
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/60">Room Type</Label>
              <select
                value={existingTypes.includes(form.type) ? form.type : (form.type ? "Custom" : "")}
                onChange={(e) => {
                  const val = e.target.value;
                  const defaults = ROOM_TYPE_CAPACITY_DEFAULTS[val];
                  if (val === "Custom") {
                    setForm((p) => ({ ...p, type: "" }));
                  } else if (defaults) {
                    setForm((p) => ({
                      ...p,
                      type: val,
                      basePax: String(defaults.basePax),
                      maxPax: String(defaults.maxPax),
                      extraPaxFee: String(defaults.extraPaxFee),
                    }));
                  } else {
                    setForm((p) => ({ ...p, type: val }));
                  }
                }}
                className={SELECT_TRIGGER_CLASS}
              >
                <option value="" disabled>Select Type...</option>
                {existingTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="Custom">+ Add New Type</option>
              </select>
              {(!existingTypes.includes(form.type) || existingTypes.includes(form.type) === false) && (
                <Input
                  placeholder="Enter Custom Room Type..."
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/60">Room Status</Label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className={SELECT_TRIGGER_CLASS}
              >
                <option value="" disabled>Select Status...</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {!STATUS_OPTIONS.includes(form.status) && form.status && (
                  <option value={form.status}>{form.status}</option>
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="so-desc" className="text-xs font-medium text-foreground/60">Description</Label>
              <textarea
                id="so-desc"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                placeholder="Describe the room..."
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>

          {/* ── Section: Pricing & Capacity ── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">Pricing & Guest Capacity</h3>

            <div className="space-y-1.5">
              <Label htmlFor="so-rate" className="text-xs font-medium text-foreground/60">Rate per Night <RequiredIndicator /></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground/40 font-medium">PHP</span>
                <Input
                  id="so-rate"
                  type="number"
                  required
                  min={1}
                  className="pl-12"
                  value={form.ratePerNight}
                  onChange={(e) => setForm((p) => ({ ...p, ratePerNight: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="so-basePax" className="text-xs font-medium text-foreground/60">Base Included Pax <RequiredIndicator /></Label>
                <Input
                  id="so-basePax"
                  type="number"
                  required
                  min={1}
                  value={form.basePax}
                  onChange={(e) => setForm((p) => ({ ...p, basePax: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="so-maxPax" className="text-xs font-medium text-foreground/60">Max Pax Capacity <RequiredIndicator /></Label>
                <Input
                  id="so-maxPax"
                  type="number"
                  required
                  min={1}
                  value={form.maxPax}
                  onChange={(e) => setForm((p) => ({ ...p, maxPax: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="so-extraPaxFee" className="text-xs font-medium text-foreground/60">Extra Pax Fee / Night (PHP)</Label>
                <Input
                  id="so-extraPaxFee"
                  type="number"
                  min={0}
                  value={form.extraPaxFee}
                  onChange={(e) => setForm((p) => ({ ...p, extraPaxFee: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="so-checkin" className="text-xs font-medium text-foreground/60">Check-in Time</Label>
                <Input
                  id="so-checkin"
                  placeholder="e.g. 2:00 PM"
                  value={form.checkInTime}
                  onChange={(e) => setForm((p) => ({ ...p, checkInTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="so-checkout" className="text-xs font-medium text-foreground/60">Check-out Time</Label>
                <Input
                  id="so-checkout"
                  placeholder="e.g. 12:00 PM"
                  value={form.checkOutTime}
                  onChange={(e) => setForm((p) => ({ ...p, checkOutTime: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* ── Section: Photos ── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">Photos</h3>

            <RoomPhotoUploader
              photos={form.photos}
              onChange={(urls) => setForm((p) => ({ ...p, photos: urls }))}
            />
          </div>

          {/* ── Section: Amenities & Facilities ── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">Amenities & Facilities</h3>

            <RoomTagInput
              label="Room Amenities"
              value={form.amenitiesCsv}
              onChange={(val) => setForm((p) => ({ ...p, amenitiesCsv: val }))}
              presets={PRESET_AMENITIES}
              placeholder="Type custom amenity and press Enter..."
            />

            <RoomTagInput
              label="Hotel Facilities"
              value={form.facilitiesCsv}
              onChange={(val) => setForm((p) => ({ ...p, facilitiesCsv: val }))}
              presets={PRESET_FACILITIES}
              placeholder="Type custom facility and press Enter..."
            />
          </div>

          {/* ── Section: Policies (Collapsible) ── */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setPoliciesOpen((v) => !v)}
              className="flex items-center gap-2 w-full text-left"
            >
              <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">Policies</h3>
              <div className="flex-1 h-px bg-border/50" />
              <ChevronDown className={`h-3.5 w-3.5 text-foreground/40 transition-transform duration-200 ${policiesOpen ? "rotate-180" : ""}`} />
            </button>

            {policiesOpen && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <Label htmlFor="so-policies" className="text-xs font-medium text-foreground/60">Cancellation Policy / House Rules</Label>
                <textarea
                  id="so-policies"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                  placeholder="Describe cancellation policy and house rules..."
                  value={form.policies}
                  onChange={(e) => setForm((p) => ({ ...p, policies: e.target.value }))}
                />
              </div>
            )}
          </div>

          {/* ── Submit ── */}
          {submitError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
              {submitError}
            </div>
          )}

          <div className="flex gap-2 pt-2 pb-2">
            <Button type="submit" disabled={submitting} className="flex-1 h-9">
              {submitting ? "Saving..." : editingId ? "Save Changes" : "Create Room"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-4"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </form>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminRoomManagementPage() {
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
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listRooms();
      setRooms(data);
    } catch (e) {
      setError(e?.message || "Failed to load rooms.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

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
        await updateRoom(editingId, payload);
      } else {
        await createRoom(payload);
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
      await deactivateRoom(id);
      await refresh();
    } catch (e) {
      setSubmitError(e?.message || "Failed to archive room.");
    }
  }

  async function onRestore(id) {
    try {
      await activateRoom(id);
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
      <SlideOverForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingId(null); setForm(initialForm()); setSubmitError(null); }}
        editingId={editingId}
        form={form}
        setForm={setForm}
        submitError={submitError}
        submitting={submitting}
        onSubmit={onSubmit}
        existingTypes={existingTypes}
      />
    </div>
  );
}
