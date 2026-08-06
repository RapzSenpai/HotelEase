import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload, Plus, Edit, Trash2, BedDouble, Layers, Search,
  X, SlidersHorizontal, ArrowUpDown, LayoutGrid, List,
  ChevronDown, Image,
} from "lucide-react";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  deactivateRoom,
  activateRoom,
  createRoom,
  listRooms,
  updateRoom,
} from "@/services/roomsService";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryTransform";
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

const SORT_OPTIONS = [
  { value: "number-asc", label: "Room # (Low → High)" },
  { value: "number-desc", label: "Room # (High → Low)" },
  { value: "name-asc", label: "Name (A → Z)" },
  { value: "name-desc", label: "Name (Z → A)" },
  { value: "rate-asc", label: "Rate (Low → High)" },
  { value: "rate-desc", label: "Rate (High → Low)" },
  { value: "status", label: "Status" },
];

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

const STATUS_COLORS = {
  "Available": "bg-success/10 text-success border-success/20",
  "Reserved": "bg-info/10 text-info border-info/20",
  "Occupied": "bg-warning/10 text-warning border-warning/20",
  "Being Cleaned": "bg-primary/10 text-primary border-primary/20",
  "Pending Approval": "bg-purple-100 text-purple-600 border-purple-200",
  "Out of Order": "bg-destructive/10 text-destructive border-destructive/20",
  "Dirty / Needs Cleaning": "bg-orange-100 text-orange-600 border-orange-200",
};

// ---------------------------------------------------------------------------
// PhotoUploader (preserved from original)
// ---------------------------------------------------------------------------

function PhotoUploader({ photos, onChange }) {
  const [uploading, setUploading] = useState([]);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";

    const newUploading = files.map((f) => ({
      name: f.name,
      progress: 0,
      error: null,
    }));
    setUploading((prev) => [...prev, ...newUploading]);

    const startIdx = uploading.length;
    const accumulated = [...photos];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const globalIdx = startIdx + i;
      try {
        const { url } = await uploadImageToCloudinary(file, {
          folder: "rooms",
          onProgress: (pct) => {
            setUploading((prev) => {
              const next = [...prev];
              if (next[globalIdx])
                next[globalIdx] = { ...next[globalIdx], progress: pct };
              return next;
            });
          },
        });
        accumulated.push(url);
        onChange([...accumulated]);
        setUploading((prev) => {
          const next = [...prev];
          if (next[globalIdx])
            next[globalIdx] = { ...next[globalIdx], progress: 100, done: true };
          return next;
        });
      } catch (err) {
        setUploading((prev) => {
          const next = [...prev];
          if (next[globalIdx])
            next[globalIdx] = {
              ...next[globalIdx],
              error: err?.message || "Upload failed",
            };
          return next;
        });
      }
    }

    setTimeout(() => {
      setUploading((prev) => prev.filter((u) => !u.done && !u.error));
    }, 2000);
  }

  function removePhoto(url) {
    onChange(photos.filter((p) => p !== url));
  }

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((url, idx) => (
            <div key={idx} className="relative group">
              <img
                src={url}
                alt={`Room photo ${idx + 1}`}
                className="h-20 w-28 rounded-lg object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white text-xs leading-none shadow hover:bg-destructive/80"
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          ))}

          <label className="flex h-20 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-muted/5 transition-all hover:border-primary/50 hover:bg-surface-hover group">
            <div className="p-1.5 rounded-full bg-background border border-border shadow-sm group-hover:bg-surface-hover transition-colors">
              <Plus className="h-4 w-4 text-foreground/40" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">Add More</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={handleFiles}
            />
          </label>
        </div>
      )}

      {uploading
        .filter((u) => !u.done)
        .map((u, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-foreground/70">
              <span className="truncate max-w-[160px]">{u.name}</span>
              {u.error ? (
                <span className="text-destructive">{u.error}</span>
              ) : (
                <span>{u.progress}%</span>
              )}
            </div>
            {!u.error && (
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${u.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}

      {photos.length === 0 && (
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/5 p-6 text-center transition-all hover:border-primary/50 hover:bg-surface-hover cursor-pointer group">
          <div className="p-2.5 rounded-full bg-background border border-border shadow-sm group-hover:bg-surface-hover transition-colors">
            <Plus className="h-5 w-5 text-foreground/40" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Upload room photos</p>
            <p className="text-xs text-foreground/50">PNG, JPG or JPEG (Max 5MB)</p>
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={handleFiles}
          />
        </label>
      )}
    </div>
  );
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
// Tag Input Component
// ---------------------------------------------------------------------------

function TagInput({ label, value, onChange, presets, placeholder }) {
  const [input, setInput] = useState("");
  const tags = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  function addTag(tag) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange(tags.concat(trimmed).join(", "));
    }
    setInput("");
  }

  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag).join(", "));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const availablePresets = presets.filter((p) => !tags.includes(p));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {/* Selected tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Preset chips */}
      {availablePresets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {availablePresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => addTag(preset)}
              className="rounded-full border border-dashed border-border/60 px-2.5 py-0.5 text-[10px] font-medium text-foreground/40 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              + {preset}
            </button>
          ))}
        </div>
      )}

      {/* Custom input */}
      <Input
        placeholder={placeholder || `Type and press Enter...`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

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

            <PhotoUploader
              photos={form.photos}
              onChange={(urls) => setForm((p) => ({ ...p, photos: urls }))}
            />
          </div>

          {/* ── Section: Amenities & Facilities ── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider">Amenities & Facilities</h3>

            <TagInput
              label="Room Amenities"
              value={form.amenitiesCsv}
              onChange={(val) => setForm((p) => ({ ...p, amenitiesCsv: val }))}
              presets={PRESET_AMENITIES}
              placeholder="Type custom amenity and press Enter..."
            />

            <TagInput
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total", value: stats.total, color: "bg-foreground/5 text-foreground/70 border-border/50" },
          { label: "Available", value: stats.available, color: "bg-success/10 text-success border-success/20" },
          { label: "Occupied", value: stats.occupied, color: "bg-warning/10 text-warning border-warning/20" },
          { label: "Reserved", value: stats.reserved, color: "bg-info/10 text-info border-info/20" },
          { label: "Cleaning", value: stats.cleaning, color: "bg-primary/10 text-primary border-primary/20" },
          { label: "Out of Order", value: stats.outOfOrder, color: "bg-destructive/10 text-destructive border-destructive/20" },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border px-4 py-3 text-center ${s.color}`}
          >
            <p className="text-2xl font-bold font-playfair">{s.value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Search + Filter Bar ── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
            <Input
              placeholder="Search by name, room #, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
              >
                <X className="h-3.5 w-3.5 text-foreground/40" />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("compact")}
              className={`p-2.5 transition-colors ${viewMode === "compact" ? "bg-primary/10 text-primary" : "text-foreground/40 hover:bg-muted"}`}
              title="Compact view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-foreground/40 hover:bg-muted"}`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/40" />

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">All Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">All Types</option>
            {existingTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Floor filter */}
          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">All Floors</option>
            {existingFloors.map((f) => (
              <option key={f} value={f}>Floor {f}</option>
            ))}
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-foreground/40" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="h-8 px-3 rounded-lg text-xs font-medium text-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
            >
              Clear filters
            </button>
          )}

          {/* Result count */}
          <span className="ml-auto text-xs text-foreground/40">
            {filteredRooms.length} of {rooms.length} rooms
          </span>
        </div>
      </div>

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
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Photos</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRooms.map((r) => {
                  const firstPhoto = Array.isArray(r.photos) && r.photos.length > 0 ? r.photos[0] : null;
                  const photoCount = Array.isArray(r.photos) ? r.photos.length : 0;
                  const cap = getRoomCapacity(r);
                  return (
                    <TableRow
                      key={r.id}
                      className={r.isActive === false ? "opacity-60" : ""}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-0">
                          {firstPhoto ? (
                            <img
                              src={firstPhoto}
                              alt={r.name}
                              className="h-10 w-14 rounded-lg object-cover border border-border/50 shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-14 rounded-lg bg-muted/20 border border-border/50 flex items-center justify-center shrink-0">
                              <BedDouble className="h-4 w-4 text-foreground/15" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{r.name || "Room"}</p>
                            <p className="text-xs text-foreground/40">#{r.roomNumber || "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-foreground/60">{r.type || "—"}</TableCell>
                      <TableCell className="text-sm text-foreground/60">{r.floor || "—"}</TableCell>
                      <TableCell>
                        {r.isActive !== false ? (
                          <RoomStatusBadge status={r.status} />
                        ) : (
                          <Badge variant="outline" className="text-foreground/40 bg-muted/20 border-border/50 text-xs">Archived</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-primary">
                        PHP {Number(r.ratePerNight ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-foreground/60">
                        Max {cap.maxPax} <span className="text-foreground/40">({cap.basePax} incl.)</span>
                      </TableCell>
                      <TableCell className="text-xs text-foreground/40">
                        {photoCount > 0 ? `${photoCount} photo${photoCount !== 1 ? "s" : ""}` : "No photos"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => startEdit(r)}
                          >
                            <Edit className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                          {r.isActive !== false ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => onArchive(r.id)}
                            >
                              Archive
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 text-xs text-success hover:text-success hover:bg-success/10"
                              onClick={() => onRestore(r.id)}
                            >
                              Restore
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        /* ── Grid Card View ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((r) => {
            const firstPhoto = Array.isArray(r.photos) && r.photos.length > 0 ? r.photos[0] : null;
            return (
              <div
                key={r.id}
                className={`rounded-xl border border-border overflow-hidden transition-all ${
                  r.isActive === false
                    ? "bg-muted/5 opacity-60"
                    : "bg-background shadow-sm hover:shadow-md"
                }`}
              >
                {/* Photo */}
                <div className="h-36 bg-muted/20">
                  {firstPhoto ? (
                    <img src={optimizeCloudinaryUrl(firstPhoto, { width: 400 })} alt={r.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <BedDouble className="h-8 w-8 text-foreground/10" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm truncate">{r.name || "Room"}</h4>
                      <p className="text-xs text-foreground/40">#{r.roomNumber || "—"}</p>
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">
                      PHP {Number(r.ratePerNight ?? 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs text-foreground/50">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3 w-3" /> Floor {r.floor || "—"}
                    </span>
                    <span>·</span>
                    <span>{r.type || "—"}</span>
                  </div>

                  {r.isActive !== false ? (
                    <RoomStatusBadge status={r.status} />
                  ) : (
                    <Badge variant="outline" className="text-foreground/40 bg-muted/20 border-border/50 text-xs">Archived</Badge>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => startEdit(r)}
                    >
                      <Edit className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    {r.isActive !== false ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => onArchive(r.id)}
                      >
                        Archive
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-xs text-success hover:bg-success/10"
                        onClick={() => onRestore(r.id)}
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
