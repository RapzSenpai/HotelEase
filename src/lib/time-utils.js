/**
 * Parse a booking date. A "YYYY-MM-DD" string is read as LOCAL midnight —
 * plain `new Date(str)` would parse it as UTC and can shift the day for users
 * in negative UTC offsets — a Firestore Timestamp via .toDate(), a Date as-is.
 * Returns null for anything else.
 */
export function toLocalDate(dateLike) {
  if (!dateLike) return null;
  if (dateLike instanceof Date) return isNaN(dateLike.getTime()) ? null : dateLike;
  if (typeof dateLike === "string") {
    const parsed = new Date(`${dateLike}T00:00:00`);
    if (isNaN(parsed.getTime())) return null;
    // Reject normalized rollovers (e.g. 2026-02-30 becomes Mar 2).
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateLike);
    if (
      m &&
      (Number(m[1]) !== parsed.getFullYear() ||
        Number(m[2]) !== parsed.getMonth() + 1 ||
        Number(m[3]) !== parsed.getDate())
    ) {
      return null;
    }
    return parsed;
  }
  if (typeof dateLike.toDate === "function") {
    const date = dateLike.toDate();
    return date instanceof Date && !isNaN(date.getTime()) ? date : null;
  }
  return null;
}

export function toJsDate(dateLike) {
  if (!dateLike) return null;
  const date = dateLike.toDate ? dateLike.toDate() : new Date(dateLike);
  return isNaN(date.getTime()) ? null : date;
}

export function timeSince(dateLike) {
  const date = toJsDate(dateLike);
  if (!date) return "Just now";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatElapsed(dateLike) {
  const date = toJsDate(dateLike);
  if (!date) return null;

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function getElapsedMinutes(dateLike) {
  const date = toJsDate(dateLike);
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

export function getStatusTimestamp(room) {
  return room?.statusChangedAt ?? room?.updatedAt ?? null;
}
