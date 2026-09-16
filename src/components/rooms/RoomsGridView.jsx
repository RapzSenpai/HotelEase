import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BedDouble, Edit, Layers } from "lucide-react";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryTransform";

/**
 * The "grid" view of the admin room inventory: one card per room.
 *
 * Pure presentation, like RoomsTableView — it maps the rooms it is given and
 * calls back for the three actions. Markup is verbatim; only `filteredRooms`
 * became a `rooms` prop.
 */
export default function RoomsGridView({ rooms, onEdit, onArchive, onRestore }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rooms.map((r) => {
        const firstPhoto = Array.isArray(r.photos) && r.photos.length > 0 ? r.photos[0] : null;
        return (
          <div
            key={r.id}
            className={`rounded-xl border border-border overflow-hidden ${
              r.isActive === false
                ? "bg-muted/5 opacity-60"
                : "bg-background shadow-sm"
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

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/50">
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Floor {r.floor || "—"}
                </span>
                <span aria-hidden>·</span>
                <span>{r.type || "—"}</span>
              </div>

              {r.isActive !== false ? (
                <RoomStatusBadge status={r.status} />
              ) : (
                <Badge variant="outline" className="text-foreground/40 bg-muted/20 border-border/50 text-xs">Archived</Badge>
              )}

              <div className="flex gap-2 pt-1.5 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => onEdit(r)}
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
  );
}
