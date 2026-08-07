import { useEffect, useState } from "react";
import { subscribeToRooms, updateRoomRate } from "@/services/roomsService";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

function formatCurrency(amount) {
  if (amount === undefined || amount === null || isNaN(Number(amount)))
    return "—";
  return `PHP ${Number(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getRoomTypeVariant(type) {
  if (!type) return "default";
  const t = type.toLowerCase();
  if (t.includes("presidential")) return "warning";
  if (t.includes("suite")) return "info";
  return "primary";
}

export default function AdminRoomRatesPage() {
  const { trainingMode } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState(null);
  const [savingId, setSavingId] = useState(null);

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
      toast.success("Rate updated successfully!");
    } catch (err) {
      setEditError(err?.message || "Failed to update rate. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="space-y-1">
        <h1 className="font-playfair text-4xl font-semibold tracking-tight">
          Room Rates
        </h1>
        <p className="text-foreground/60 max-w-lg">
          Manage nightly pricing for each active room. Changes take effect
          immediately.
        </p>
      </div>

      {trainingMode && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Training mode is active — rate changes write to the training sandbox.
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Active Room Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-10 text-center text-sm text-foreground/50">
              Loading rooms…
            </div>
          ) : rooms.length === 0 ? (
            <div className="p-10 text-center text-sm text-foreground/50">
              No active rooms found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Current Rate</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => {
                    const isEditing = editingId === room.id;
                    const isSaving = savingId === room.id;
                    return (
                      <TableRow key={room.id}>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {room.name || `Room ${room.roomNumber}` || "Unnamed Room"}
                          </div>
                          {room.roomNumber && room.name ? (
                            <div className="text-xs text-foreground/45">
                              Room #{room.roomNumber}
                              {room.floor ? ` · Floor ${room.floor}` : ""}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRoomTypeVariant(room.type)}>
                            {room.type || "Unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                              <input
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
                                placeholder="e.g. 3500"
                                className="h-8 w-32 rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                              />
                              {editError ? (
                                <span className="text-xs text-destructive">
                                  {editError}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-sm font-semibold">
                              {formatCurrency(room.ratePerNight)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSave(room.id)}
                                disabled={isSaving}
                              >
                                <Check className="h-3.5 w-3.5" />
                                {isSaving ? "Saving…" : "Save"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleEditCancel}
                                disabled={isSaving}
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditStart(room)}
                              disabled={editingId !== null}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit Rate
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-foreground/50">
            Only one room can be edited at a time. Rates apply per night.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}