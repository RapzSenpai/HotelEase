import { useState } from "react";
import { Select } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { Edit, Plus, X, ChevronDown } from "lucide-react";
import RoomPhotoUploader from "@/components/rooms/RoomPhotoUploader";
import RoomTagInput from "@/components/rooms/RoomTagInput";
import { ROOM_TYPE_CAPACITY_DEFAULTS } from "@/lib/roomCapacity";

const SELECT_TRIGGER_CLASS =
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const PRESET_AMENITIES = [
  "Wifi", "Air Conditioning", "TV", "Private Bathroom", "Minibar",
  "Room Service", "Parking", "Balcony", "In-Room Safe", "Coffee Maker",
];

const PRESET_FACILITIES = [
  "Swimming Pool", "Gym", "Spa", "Restaurant", "Bar", "Laundry",
  "Concierge", "Airport Shuttle", "Business Center", "Garden",
];

/**
 * The add/edit room modal — a centred dialog holding the whole room form.
 *
 * Moved out of AdminRoomManagementPage verbatim. Presets and the shared select
 * styling live here because only this form used them. `statusOptions` is a prop
 * rather than a local constant because the page's filter toolbar needs the same
 * list, and duplicating it is exactly how the two would drift apart.
 */
export default function RoomFormSlideOver({
  open,
  onClose,
  editingId,
  form,
  setForm,
  submitError,
  submitting,
  onSubmit,
  existingTypes,
  statusOptions,
}) {
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
              aria-label="Close"
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
              <Label htmlFor="so-room-type" className="text-xs font-medium text-foreground/60">Room Type</Label>
              <Select.Root
                value={existingTypes.includes(form.type) ? form.type : (form.type ? "Custom" : "")}
                onValueChange={(val) => {
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
              >
                <Select.Trigger id="so-room-type" className={SELECT_TRIGGER_CLASS}>
                  <Select.Value placeholder="Select Type..." />
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content position="popper" side="bottom" align="start" sideOffset={4} className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                    <Select.Viewport>
                      {existingTypes.map((t) => (
                        <Select.Item key={t} value={t} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground">
                          <Select.ItemText>{t}</Select.ItemText>
                        </Select.Item>
                      ))}
                      <Select.Item value="Custom" className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground">
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
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="so-room-status" className="text-xs font-medium text-foreground/60">Room Status</Label>
              <Select.Root value={form.status} onValueChange={(val) => setForm((p) => ({ ...p, status: val }))}>
                <Select.Trigger id="so-room-status" className={SELECT_TRIGGER_CLASS}>
                  <Select.Value placeholder="Select Status..." />
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content position="popper" side="bottom" align="start" sideOffset={4} className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                    <Select.Viewport>
                      {statusOptions.map((s) => (
                        <Select.Item key={s} value={s} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground">
                          <Select.ItemText>{s}</Select.ItemText>
                        </Select.Item>
                      ))}
                      {!statusOptions.includes(form.status) && form.status && (
                        <Select.Item value={form.status} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground">
                          <Select.ItemText>{form.status}</Select.ItemText>
                        </Select.Item>
                      )}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
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
