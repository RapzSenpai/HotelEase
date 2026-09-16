/**
 * Parse a booking date. A "YYYY-MM-DD" string is read as LOCAL midnight —
 * plain `new Date(str)` would parse it as UTC and can shift the day for users
 * in negative UTC offsets — a Firestore Timestamp via .toDate(), a Date as-is.
 * Returns null for anything else.
 */
export function toLocalDate(dateLike) {
  if (!dateLike) return null;
  if (dateLike instanceof Date) return dateLike;
  if (typeof dateLike === "string") return new Date(`${dateLike}T00:00:00`);
  if (typeof dateLike.toDate === "function") return dateLike.toDate();
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
