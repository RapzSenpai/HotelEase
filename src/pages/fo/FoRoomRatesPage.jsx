import { useEffect, useState } from "react";
import { subscribeToRooms, updateRoomRate } from "@/services/roomsService";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X } from "lucide-react";

function formatCurrency(amount) {
  if (amount === undefined || amount === null || isNaN(Number(amount)))
    return "—";
  return `PHP ${Number(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} / night`;
}

function getRoomTypeVariant(type) {
  if (!type) return "default";
  const t = type.toLowerCase();
  if (t.includes("presidential")) return "warning";
  if (t.includes("suite")) return "info";
  return "primary";
}

export default function FoRoomRatesPage() {
  const { trainingMode } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Which room is currently being edited
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  // Toast notification
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }

  // ── Real-time subscription ────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);

    const unsub = subscribeToRooms(
      (allRooms) => {
        const active = allRooms
          .filter((r) => r.isActive !== false)
          .sort((a, b) => {
            const nameA = (a.name || a.roomNumber || "").toLowerCase();
            const nameB = (b.name || b.roomNumber || "").toLowerCase();
            return nameA.localeCompare(nameB);
          });
        setRooms(active);
        setLoading(false);
      },
      { trainingMode },
    );

    return () => unsub();
  }, [trainingMode]);

  // ── Toast helper ──────────────────────────────────────────────────────────
  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function handleEditStart(room) {
    setEditingId(room.id);
    setEditValue(String(room.ratePerNight ?? ""));
    setEditError(null);
  }

  function handleEditCancel() {
    setEditingId(null);
    setEditValue("");
    setEditError(null);
  }

  async function handleSave(roomId) {
    const rate = Number(editValue);

    if (editValue === "" || isNaN(rate) || rate < 0) {
      setEditError("Please enter a valid non-negative rate.");
      return;
    }

    setSavingId(roomId);
    setEditError(null);

    try {
      await updateRoomRate(roomId, rate, { trainingMode });
      setEditingId(null);
      setEditValue("");
      showToast("success", "Rate updated successfully!");
    } catch (err) {
      setEditError(err?.message || "Failed to update rate. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={[
            "fixed top-4 right-4 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg transition-all",
            toast.type === "success"
              ? "border-success/30 bg-success/15 text-foreground"
              : "border-destructive/30 bg-destructive/15 text-foreground",
          ].join(" ")}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}

      {/* ── Page header ── */}
      <div>
        <h1 className="font-playfair text-3xl font-semibold">Room Rates</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Manage nightly pricing for each active room. Changes take effect
          immediately.
        </p>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="rounded-xl border border-border bg-background p-10 text-center text-sm text-foreground/60">
          Loading rooms…
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-border bg-background p-10 text-center text-sm text-foreground/60">
          No active rooms found.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const isEditing = editingId === room.id;
            const isSaving = savingId === room.id;

            return (
              <div
                key={room.id}
                className="rounded-xl border border-border bg-background p-5 shadow-sm space-y-4"
              >
                {/* ── Room identity ── */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base leading-snug truncate">
                      {room.name || `Room ${room.roomNumber}` || "Unnamed Room"}
                    </p>
                    {room.roomNumber && room.name && (
                      <p className="text-xs text-foreground/55 mt-0.5">
                        Room #{room.roomNumber}
                        {room.floor ? ` · Floor ${room.floor}` : ""}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={getRoomTypeVariant(room.type)}
                    className="shrink-0"
                  >
                    {room.type || "Unknown"}
                  </Badge>
                </div>

                {/* ── Rate section ── */}
                {isEditing ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-foreground/70">
                      Rate per night (PHP)
                    </label>

                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={editValue}
                      onChange={(e) => {
                        setEditValue(e.target.value);
                        if (editError) setEditError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave(room.id);
                        if (e.key === "Escape") handleEditCancel();
                      }}
                      disabled={isSaving}
                      autoFocus
                      className="h-9"
                      placeholder="e.g. 3500"
                    />

                    {editError && (
                      <p className="text-xs text-destructive">{editError}</p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleSave(room.id)}
                        disabled={isSaving}
                        className="flex items-center gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {isSaving ? "Saving…" : "Save"}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleEditCancel}
                        disabled={isSaving}
                        className="flex items-center gap-1.5"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-foreground/55 mb-0.5">
                        Current rate
                      </p>
                      <p className="text-sm font-semibold">
                        {formatCurrency(room.ratePerNight)}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditStart(room)}
                      // Disable all Edit buttons while any room is being edited
                      disabled={editingId !== null}
                      className="flex items-center gap-1.5 shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Rate
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
