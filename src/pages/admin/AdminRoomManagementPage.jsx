import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, Plus, Edit, Trash2, BedDouble, Layers } from "lucide-react";
import { Select } from "radix-ui";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import {
  deactivateRoom,
  activateRoom,
  createRoom,
  listRooms,
  updateRoom,
} from "@/services/roomsService";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";

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
const SELECT_CONTENT_CLASS =
  "z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md";
const SELECT_ITEM_CLASS =
  "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground";

const DEFAULT_TYPE_OPTIONS = ["Single Room", "Suite Room", "Presidential Room"];

function initialForm() {
  return {
    roomNumber: "",
    name: "",
    type: "Single Room",
    status: "Available",
    ratePerNight: "",
    description: "",
    floor: "",
    amenitiesCsv: "",
    isActive: true,
    photos: [], // array of Cloudinary URLs
  };
}

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

    // Local accumulator — starts from the photos already saved so far.
    // Using a local array (not the `photos` prop) prevents the stale-closure
    // bug where every iteration would spread the same original array and
    // overwrite the previous result instead of appending to it.
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
        accumulated.push(url); // append to the local list
        onChange([...accumulated]); // notify parent with the full running list
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

          {/* Compact Add button */}
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
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/5 p-8 text-center transition-all hover:border-primary/50 hover:bg-surface-hover cursor-pointer group">
          <div className="p-3 rounded-full bg-background border border-border shadow-sm group-hover:bg-surface-hover transition-colors">
            <Plus className="h-6 w-6 text-foreground/40" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Click to upload room photos</p>
            <p className="text-xs text-foreground/50">Multiple PNG, JPG or JPEG (Max 5MB)</p>
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

export default function AdminRoomManagementPage() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

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

  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => {
      const an = Number(a.roomNumber ?? 0);
      const bn = Number(b.roomNumber ?? 0);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [rooms]);

  const existingTypes = useMemo(() => {
    const set = new Set(DEFAULT_TYPE_OPTIONS);
    rooms.forEach((r) => { if (r.type) set.add(r.type); });
    return Array.from(set).sort();
  }, [rooms]);

  function validatePayload() {
    const payload = {
      roomNumber: String(form.roomNumber ?? "").trim(),
      name: String(form.name ?? "").trim(),
      type: String(form.type ?? "").trim(),
      status: String(form.status ?? "").trim(),
      ratePerNight: Number(form.ratePerNight ?? 0),
      description: String(form.description ?? "").trim(),
      floor: String(form.floor ?? "").trim(),
      amenities: String(form.amenitiesCsv ?? "")
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
    setEditingId(room.id);
    setForm({
      roomNumber: room.roomNumber ?? "",
      name: room.name ?? "",
      type: room.type ?? "Single Room",
      status: room.status ?? "Available",
      ratePerNight: String(room.ratePerNight ?? ""),
      description: room.description ?? "",
      floor: room.floor ?? "",
      amenitiesCsv: Array.isArray(room.amenities)
        ? room.amenities.join(", ")
        : "",
      isActive: room.isActive !== false,
      photos: Array.isArray(room.photos) ? room.photos : [],
    });
    setSubmitError(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-playfair text-4xl font-semibold tracking-tight">Inventory Control</h1>
          <p className="text-foreground/60 max-w-lg">
            Manage room details, availability status, and inventory state.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-4">
          <form
            className="rounded-xl border border-border bg-background p-5 space-y-4"
            onSubmit={onSubmit}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-primary/10">
                {editingId ? (
                  <Edit className="h-5 w-5 text-primary" />
                ) : (
                  <Plus className="h-5 w-5 text-primary" />
                )}
              </div>
              <h2 className="text-lg font-bold">
                {editingId ? "Modify Existing Room" : "Register New Room"}
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="roomNumber">Room Number</Label>
                <Input
                  id="roomNumber"
                  required
                  value={form.roomNumber}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, roomNumber: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="floor">Floor</Label>
                <Input
                  id="floor"
                  value={form.floor}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, floor: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Room Name</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Room Type</Label>
              <div className="flex flex-col gap-2">
                <Select.Root
                  value={existingTypes.includes(form.type) ? form.type : (form.type ? "Custom" : "")}
                  onValueChange={(val) => {
                    if (val === "Custom") {
                      setForm((p) => ({ ...p, type: "" }));
                    } else {
                      setForm((p) => ({ ...p, type: val }));
                    }
                  }}
                >
                  <Select.Trigger className={SELECT_TRIGGER_CLASS}>
                    <Select.Value placeholder="Select Type..." />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className={SELECT_CONTENT_CLASS}>
                      <Select.Viewport>
                        {existingTypes.map((t) => (
                          <Select.Item key={t} value={t} className={SELECT_ITEM_CLASS}>
                            <Select.ItemText>{t}</Select.ItemText>
                          </Select.Item>
                        ))}
                        <Select.Item value="Custom" className={SELECT_ITEM_CLASS}>
                          <Select.ItemText>+ Add New Type</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
                
                {(!existingTypes.includes(form.type) || existingTypes.includes(form.type) === false) && (
                  <Input
                    placeholder="Enter Custom Room Type..."
                    value={form.type}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, type: e.target.value }))
                    }
                    className="animate-in fade-in slide-in-from-top-1"
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Room Status</Label>
              <Select.Root
                value={form.status}
                onValueChange={(val) => setForm((p) => ({ ...p, status: val }))}
              >
                <Select.Trigger className={SELECT_TRIGGER_CLASS}>
                  <Select.Value placeholder="Select Status..." />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className={SELECT_CONTENT_CLASS}>
                    <Select.Viewport>
                      {STATUS_OPTIONS.map((s) => (
                        <Select.Item key={s} value={s} className={SELECT_ITEM_CLASS}>
                          <Select.ItemText>{s}</Select.ItemText>
                        </Select.Item>
                      ))}
                      {!STATUS_OPTIONS.includes(form.status) && (
                        <Select.Item value={form.status} className={SELECT_ITEM_CLASS}>
                          <Select.ItemText>{form.status}</Select.ItemText>
                        </Select.Item>
                      )}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ratePerNight">Rate per Night</Label>
              <Input
                id="ratePerNight"
                type="number"
                required
                min={1}
                value={form.ratePerNight}
                onChange={(e) =>
                  setForm((p) => ({ ...p, ratePerNight: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Room Photos</Label>
              <PhotoUploader
                photos={form.photos}
                onChange={(urls) => setForm((p) => ({ ...p, photos: urls }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amenitiesCsv">Amenities (comma-separated)</Label>
              <Input
                id="amenitiesCsv"
                value={form.amenitiesCsv}
                onChange={(e) =>
                  setForm((p) => ({ ...p, amenitiesCsv: e.target.value }))
                }
              />
            </div>

            {submitError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
                {submitError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit" disabled={submitting} size="lg" className="w-full shadow-sm">
                {submitting
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Create Room"}
              </Button>

              {editingId ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full bg-muted/10 text-foreground hover:bg-surface-hover border-transparent"
                  onClick={() => {
                    setEditingId(null);
                    setForm(initialForm());
                    setSubmitError(null);
                  }}
                >
                  Cancel Editing
                </Button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-xl border border-border bg-background p-6 text-sm text-foreground/70">
              Loading rooms...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground/70">
                  Existing Rooms
                </div>
                <div className="text-[10px] text-foreground/40 font-medium">
                  ARCHIVED ROOMS ARE HIDDEN FROM PUBLIC VIEW
                </div>
              </div>

              <div className="space-y-3">
                {sortedRooms.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background p-4 text-sm text-foreground/70">
                    No rooms found.
                  </div>
                ) : (
                  sortedRooms.map((r) => {
                    const firstPhoto = Array.isArray(r.photos) && r.photos.length > 0 ? r.photos[0] : null;
                    return (
                      <div
                        key={r.id}
                        className={`group rounded-2xl border border-border overflow-hidden transition-all duration-200 ${
                          r.isActive === false
                            ? "bg-muted/5 opacity-60 grayscale-[0.5]"
                            : "bg-background shadow-sm hover:shadow-md hover:border-primary/20"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row h-full">
                          {/* Thumbnail */}
                          <div className="sm:w-32 md:w-40 aspect-video sm:aspect-auto bg-muted/20 border-r border-border/40 shrink-0">
                            {firstPhoto ? (
                              <img
                                src={firstPhoto}
                                alt={r.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <BedDouble className="h-6 w-6 text-foreground/10" />
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 p-4 md:p-5 flex flex-col justify-between min-w-0">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                              <div className="space-y-1.5 min-w-0">
                                <h4 className="font-semibold text-lg leading-tight truncate">
                                  {r.name || r.type || "Room"}
                                  {r.roomNumber ? (
                                    <span className="text-foreground/40 font-normal"> • #{r.roomNumber}</span>
                                  ) : null}
                                </h4>
                                
                                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground/50 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <BedDouble className="h-3.5 w-3.5 opacity-70" />
                                    {r.type || "Unknown Type"}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Layers className="h-3.5 w-3.5 opacity-70" />
                                    Floor {r.floor || "—"}
                                  </div>
                                </div>

                                <div className="pt-0.5">
                                  {r.isActive !== false ? (
                                    <RoomStatusBadge status={r.status} />
                                  ) : (
                                    <Badge variant="outline" className="text-foreground/40 bg-muted/20 border-border/50">Archived</Badge>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-1 shrink-0">
                                <div className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-sm font-bold border border-primary/10">
                                  PHP {Number(r.ratePerNight ?? 0).toLocaleString()}
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/30">per night</span>
                              </div>
                            </div>

                            <div className="mt-5 flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 px-4 rounded-lg bg-background hover:bg-surface-hover font-medium flex-1 sm:flex-none"
                                onClick={() => startEdit(r)}
                              >
                                <Edit className="h-3.5 w-3.5 mr-2" />
                                Edit Details
                              </Button>

                              {r.isActive !== false ? (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => onArchive(r.id)}
                                  className="h-9 px-4 bg-destructive/5 text-destructive hover:bg-destructive hover:text-white border-destructive/20 rounded-lg flex-1 sm:flex-none"
                                >
                                  Archive
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onRestore(r.id)}
                                  className="h-9 px-4 bg-success/5 text-success hover:bg-success hover:text-white border-success/20 rounded-lg flex-1 sm:flex-none"
                                >
                                  Restore
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
