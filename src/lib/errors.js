const FIREBASE_ERROR_MAP = {
  "permission-denied": "You don't have permission to perform this action.",
  "unavailable": "The service is temporarily unavailable. Please try again.",
  "not-found": "The requested resource was not found.",
  "already-exists": "This resource already exists.",
  "invalid-argument": "The data provided is invalid.",
  "out-of-range": "The requested value is out of range.",
  "failed-precondition": "The operation cannot be completed right now.",
  "aborted": "The operation was aborted.",
  "internal": "Something went wrong on our end. Please try again.",
  "unimplemented": "This feature is not yet available.",
  "unauthenticated": "Please log in to continue.",
  "cancelled": "The operation was cancelled.",
  "unknown": "An unexpected error occurred. Please try again.",
  "resource-exhausted": "Too many requests. Please wait and try again.",
  "deadline-exceeded": "The operation timed out. Please try again.",
};

export function mapFirebaseError(err) {
  if (!err) return "An unexpected error occurred.";
  const code = err?.code || "";
  if (FIREBASE_ERROR_MAP[code]) return FIREBASE_ERROR_MAP[code];
  const message = err?.message || "";
  const match = message.match(/([a-zA-Z0-9-]+)/);
  if (match && FIREBASE_ERROR_MAP[match[1]]) {
    return FIREBASE_ERROR_MAP[match[1]];
  }
  const stripped = message
    .replace(/^Firebase:\s*Error\s*\([^)]+\)\s*:\s*/, "")
    .replace(/^Firebase:\s*/, "");
  if (stripped !== message) return stripped || "Something went wrong. Please try again.";
  return message || "Something went wrong. Please try again.";
}

export default mapFirebaseError;