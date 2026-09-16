import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";

/**
 * Multi-photo uploader for the room form: grid of uploaded photos with a
 * remove button, plus per-file progress rows.
 *
 * Moved out of AdminRoomManagementPage verbatim — it was already a standalone
 * component there, so this is a relocation, not a rewrite.
 */
export default function RoomPhotoUploader({ photos, onChange }) {
  const [uploading, setUploading] = useState([]);
  // Latest photos for overlapping upload batches — the handleFiles closure
  // would otherwise accumulate from a stale snapshot and drop URLs.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";

    const newUploading = files.map((f) => ({
      // Stable id so the progress rows keep their identity as uploads come
      // and go (index keys re-use the wrong row when one is removed).
      id: crypto.randomUUID(),
      name: f.name,
      progress: 0,
      error: null,
    }));
    setUploading((prev) => [...prev, ...newUploading]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Stable id, not array position: removals or concurrent selections
      // shift indexes and would redirect updates to the wrong row.
      const rowId = newUploading[i].id;
      const patchRow = (patch) =>
        setUploading((prev) =>
          prev.map((u) => (u.id === rowId ? { ...u, ...patch } : u)),
        );
      try {
        const { url } = await uploadImageToCloudinary(file, {
          folder: "rooms",
          onProgress: (pct) => patchRow({ progress: pct }),
        });
        const accumulated = [...photosRef.current, url];
        photosRef.current = accumulated;
        onChange(accumulated);
        patchRow({ progress: 100, done: true });
      } catch (err) {
        patchRow({ error: err?.message || "Upload failed" });
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
            <div key={url} className="relative group">
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
        .map((u) => (
          <div key={u.id} className="space-y-1">
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
