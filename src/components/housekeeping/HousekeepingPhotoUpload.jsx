import { useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";

export default function HousekeepingPhotoUpload({
  photos = [],
  onChange,
  label = "Verification photos",
  maxPhotos = 4,
  compact = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    event.target.value = "";

    const remaining = maxPhotos - photos.length;
    const toUpload = files.slice(0, remaining);
    if (toUpload.length === 0) return;

    setUploadError(null);
    setUploading(true);
    const nextPhotos = [...photos];

    try {
      for (const file of toUpload) {
        setProgress(0);
        const { url } = await uploadImageToCloudinary(file, {
          folder: "housekeeping",
          compressionPreset: "housekeepingImages",
          onProgress: setProgress,
        });
        nextPhotos.push(url);
        onChange([...nextPhotos]);
      }
    } catch (error) {
      setUploadError(error?.message || "Upload failed.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function removePhoto(url) {
    onChange(photos.filter((photo) => photo !== url));
  }

  return (
    <div
      className={
        compact
          ? "space-y-1.5"
          : "space-y-1.5 border-t border-border/10 pt-1.5"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
          {label}
        </span>
        {photos.length > 0 && (
          <span className="text-[10px] text-foreground/40">
            {photos.length}/{maxPhotos}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {photos.map((url) => (
          <div key={url} className="group relative shrink-0">
            <img
              src={url}
              alt="Verification"
              className="h-9 w-9 rounded-md border border-border object-cover outline outline-1 outline-black/10"
            />
            <button
              type="button"
              onClick={() => removePhoto(url)}
              className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="flex h-9 w-9 shrink-0 items-center justify-center border-dashed p-0 hover:bg-muted/10"
            disabled={uploading}
            asChild
          >
            <label className="cursor-pointer">
              <Camera className="h-3.5 w-3.5 text-foreground/50" />
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={handleFiles}
                disabled={uploading}
              />
            </label>
          </Button>
        )}
      </div>

      {uploadError ? (
        <p className="text-[10px] text-destructive">{uploadError}</p>
      ) : null}
    </div>
  );
}
