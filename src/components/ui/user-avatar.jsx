import { useState } from "react";
import { cn } from "@/lib/utils";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryTransform";

/** "Juan Dela Cruz" -> "JD"; single names keep one letter. */
function initialsOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Small circular avatar: profile photo when one exists, initials otherwise.
 * A failed photo (dead URL, offline) falls back to initials; a NEW photo URL
 * retries, so replacing the upload recovers without a reload.
 */
export default function UserAvatar({ photoUrl, name, className }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const showPhoto = Boolean(photoUrl) && failedUrl !== photoUrl;

  return (
    <span
      data-slot="user-avatar"
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 ring-1 ring-border",
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={optimizeCloudinaryUrl(photoUrl, { width: 96 })}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        <span className="text-[10px] font-semibold leading-none text-foreground">
          {initialsOf(name) || "?"}
        </span>
      )}
    </span>
  );
}
