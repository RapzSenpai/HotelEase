import { useEffect, useRef, useState } from "react";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";

/**
 * Multi-photo uploader for the room form.
 *
 * One row of tiles holds all three states: uploaded photos, in-flight uploads
 * (placeholder tile with %), and the add tile. Earlier this was two competing
 * blocks — a full-width dashed dropzone that stayed on screen while the first
 * upload ran, on top of the progress row — so picking a photo grew the section,
 * then collapsed the "large empty block" into a thumbnail.
 *
 * The add tile is a real button driving a hidden file input, rather than a
 * label wrapping a clipped input: no clipped element can be scrolled into view
 * on click, and the control is reachable by keyboard.
 */
const TILE = "h-20 w-28 rounded-lg";

export default function RoomPhotoUploader({ photos, onChange }) {
  const [uploads, setUploads] = useState([]); // one row per file being uploaded
  // Latest photos for overlapping upload batches — the handleFiles closure
  // would otherwise accumulate from a stale snapshot and drop URLs.
  const photosRef = useRef(photos);
  const fileInputRef = useRef(null);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";

    const newUploads = files.map((f) => ({
      // Stable id so the tiles keep their identity as uploads come and go
      // (index keys re-use the wrong tile when one is removed).
      id: crypto.randomUUID(),
      name: f.name,
      progress: 0,
      error: null,
    }));
    setUploads((prev) => [...prev, ...newUploads]);

    const patchRow = (rowId, patch) =>
      setUploads((prev) => prev.map((u) => (u.id === rowId ? { ...u, ...patch } : u)));

    for (let i = 0; i < files.length; i++) {
      const rowId = newUploads[i].id;
      try {
        const { url } = await uploadImageToCloudinary(files[i], {
          folder: "rooms",
          onProgress: (pct) => patchRow(rowId, { progress: pct }),
        });
        const accumulated = [...photosRef.current, url];
        photosRef.current = accumulated;
        onChange(accumulated);
        patchRow(rowId, { progress: 100, done: true });
      } catch (err) {
        // Tiles disappear with the batch sweep below, so the reason has to
        // outlive them — a silent vanish is exactly what users re-click over.
        const message = err?.message || "Upload failed";
        patchRow(rowId, { error: message });
        toast.error(`${files[i].name}: ${message}`);
      }
    }

    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => !u.done && !u.error));
    }, 2000);
  }

  function removePhoto(url) {
    onChange(photos.filter((p) => p !== url));
  }

  const empty = photos.length === 0 && uploads.length === 0;

  return (
    <div className="relative space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((url, idx) => (
          <div key={url} className="relative group">
            <img
              src={url}
              alt={`Room photo ${idx + 1}`}
              className={`${TILE} object-cover border border-border`}
            />
            <button
              type="button"
              onClick={() => removePhoto(url)}
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white text-xs leading-none shadow hover:bg-destructive/80"
              aria-label={`Remove photo ${idx + 1}`}
            >
              ×
            </button>
          </div>
        ))}

        {uploads.map((u) => (
          <div
            key={u.id}
            title={u.error || u.name}
            className={`${TILE} flex flex-col items-center justify-center gap-1 border ${
              u.error
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-muted/5"
            }`}
          >
            {u.error ? (
              <>
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
                  Failed
                </span>
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
                <span className="text-[10px] font-semibold tabular-nums text-foreground/50">
                  {u.progress}%
                </span>
              </>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add room photos"
          className={`${TILE} group flex cursor-pointer flex-col items-center justify-center gap-1 border-2 border-dashed border-border bg-muted/5 transition-all hover:border-primary/50 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
        >
          <span className="p-1.5 rounded-full bg-background border border-border shadow-sm group-hover:bg-surface-hover transition-colors">
            <Plus className="h-4 w-4 text-foreground/40" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
            {empty ? "Add Photos" : "Add More"}
          </span>
        </button>
      </div>

      {empty && (
        <p className="text-xs text-foreground/50">PNG, JPG or JPEG (Max 5MB)</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </div>
  );
}
