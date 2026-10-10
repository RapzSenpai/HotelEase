import { Camera } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import HousekeepingPhotoUpload, {
  HOUSEKEEPING_MAX_PHOTOS,
} from "@/components/housekeeping/HousekeepingPhotoUpload";

// Compact table trigger: camera icon + n/5 count. Opens the dialog.
export function PhotoCountTrigger({ count = 0, max = HOUSEKEEPING_MAX_PHOTOS, onClick, label = "View photos" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} (${count} of ${max})`}
      title={`${label} (${count}/${max})`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground/70 shadow-sm transition-colors hover:border-border/80 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      <Camera className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        {count}/{max}
      </span>
    </button>
  );
}

// Shared gallery + upload dialog for turnover and mid-stay tables.
// UI-remove only: files stay on Cloudinary (no signed delete on client).
export default function HousekeepingPhotoDialog({
  open,
  onOpenChange,
  title = "Verification photos",
  photos = [],
  editable = false,
  disableUploads = false,
  onChange = () => {},
  maxPhotos = HOUSEKEEPING_MAX_PHOTOS,
}) {
  function handleChange(next) {
    onChange(next);
    if (next.length > photos.length) toast.success("Photo added.");
    else if (next.length < photos.length) toast.success("Photo removed.");
  }

  const canUpload = editable && !disableUploads;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {canUpload
              ? `Up to ${maxPhotos} photos. Add, preview, or remove before submitting.`
              : "Submitted photos (read-only)."}
          </DialogDescription>
        </DialogHeader>
        {canUpload ? (
          <HousekeepingPhotoUpload
            photos={photos}
            onChange={handleChange}
            label="Add proof"
            maxPhotos={maxPhotos}
            compact
          />
        ) : (
          <div className="space-y-2">
            {editable && disableUploads ? (
              <p className="text-[11px] italic text-foreground/40">
                Photo proof disabled in demo.
              </p>
            ) : null}
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((url, idx) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-square overflow-hidden rounded-md border border-border outline outline-1 outline-black/10 transition-opacity hover:opacity-80"
                  >
                    <img
                      src={url}
                      alt={`Verification ${idx + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-foreground/35">
                No photos yet (0/{maxPhotos}).
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
