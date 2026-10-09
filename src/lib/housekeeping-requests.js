// Pure per-request history helpers, shared by GuestHousekeepingCard and the
// guest demo. Verbatim split — no services, no firebase, no behavior change.

/** Statuses that mean a request is still being worked on by housekeeping. */
export const IN_FLIGHT_STATUSES = new Set([
  "Dirty / Needs Cleaning",
  "Being Cleaned",
  "Pending Approval",
]);

export function tsToMs(tsLike) {
  if (!tsLike) return 0;
  if (typeof tsLike.toMillis === "function") return tsLike.toMillis();
  if (typeof tsLike.toDate === "function") return tsLike.toDate().getTime();
  if (typeof tsLike === "number") return tsLike;
  if (tsLike.seconds) return tsLike.seconds * 1000;
  return 0;
}

export function formatWhen(tsLike) {
  const ms = tsToMs(tsLike);
  if (!ms) return "";
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"});
}

export function stripRequestPrefix(note = "") {
  return String(note)
    .replace(/^\[Mid-Stay Request Cancelled\]\s*/, "")
    .replace(/^\[Mid-Stay Request\]\s*/, "");
}

/**
 * Rebuild the per-request history from the room's log stream. Every log of a
 * cleaning cycle shares the same `requestId` (the id of the origin request
 * log), so grouping by it yields one entry per request with its own status,
 * photos, and rating. Logs written before requestId existed fall back to a
 * heuristic: a guest-origin "Dirty / Needs Cleaning" log starts a new request
 * and any following log joins the most recent one.
 */
export function buildRequests(logs) {
  const asc = [...logs].sort((a, b) => tsToMs(a.createdAt) - tsToMs(b.createdAt));
  const groups = [];
  const byRequestId = new Map();

  for (const log of asc) {
    if (log.requestId) {
      let group = byRequestId.get(log.requestId);
      if (!group) {
        group = { requestId: log.requestId, logs: [] };
        byRequestId.set(log.requestId, group);
        groups.push(group);
      }
      group.logs.push(log);
      continue;
    }

    // Legacy fallback: an origin log starts a new request; anything else joins
    // the most recent one.
    const isOrigin =
      log.changedByRole === "guest" &&
      log.toStatus === "Dirty / Needs Cleaning" &&
      log.isMidStayRequest;
    if (isOrigin || groups.length === 0) {
      groups.push({ requestId: null, logs: [log] });
    } else {
      groups[groups.length - 1].logs.push(log);
    }
  }

  return groups
    .map((group) => {
      const latest = group.logs[group.logs.length - 1];
      const origin =
        group.logs.find(
          (l) => l.changedByRole === "guest" && l.toStatus === "Dirty / Needs Cleaning") || group.logs[0];
      const completion = group.logs.find((l) => l.toStatus === "Available");
      const photoLog = group.logs.find(
        (l) => Array.isArray(l.photoUrls) && l.photoUrls.length > 0);
      const status = latest?.toStatus || "Unknown";
      return {
        id: group.requestId || origin?.id || group.logs[0]?.id,
        requestedAt: origin?.createdAt || group.logs[0]?.createdAt,
        note: stripRequestPrefix(origin?.note || group.logs[0]?.note || ""),
        status,
        latestRole: latest?.changedByRole || null,
        photos: photoLog?.photoUrls || [],
        completionLog: completion || null,
        rated: !!completion?.rating,
        rating: completion?.rating || null,
        ratingFeedback: completion?.ratingFeedback || "",
        isInFlight: IN_FLIGHT_STATUSES.has(status),
        isCompleted: status === "Available",
        isCancelled: status === "Occupied / Checked In"};
    })
    .sort((a, b) => tsToMs(b.requestedAt) - tsToMs(a.requestedAt));
}

export const ACTIVE_STATUS_TEXT = {
  "Dirty / Needs Cleaning":
    "Your request has been sent to Front Office. We'll update you once cleaning begins.",
  "Being Cleaned":
    "Our housekeeping team is currently refreshing your room. We'll notify you once it's done.",
  "Pending Approval":
    "Cleaning completed! Awaiting final approval from Front Office. We'll notify you once your room is ready."};
