import { Button } from "@/components/ui/button";
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
import { BedDouble, Edit } from "lucide-react";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";
import { getRoomCapacity } from "@/lib/roomCapacity";

/**
 * The "compact" view of the admin room inventory: one table row per room.
 *
 * Pure presentation — it maps the rooms it is given and calls back for the
 * three actions. Split out of AdminRoomManagementPage, whose render had grown
 * to hold both view modes inline. Markup is verbatim; only `filteredRooms`
 * became a `rooms` prop.
 */
export default function RoomsTableView({ rooms, onEdit, onArchive, onRestore }) {
  return (
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
            {rooms.map((r) => {
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
                        onClick={() => onEdit(r)}
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
  );
}
