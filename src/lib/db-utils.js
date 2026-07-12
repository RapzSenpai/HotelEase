/**
 * Shared utility for Firestore collection sandboxing.
 * Determines if we should use a 'training_' prefix based on 
 * session state (localStorage) or an explicit flag.
 */

export function getCol(baseName, explicitMode = null) {
  let mode = "prod"; // 'prod' or 'training'

  // 1. Determine mode from localStorage session state first
  try {
    const isTraining = localStorage.getItem("bshm_training_override") === "true";
    if (isTraining) mode = "training";
  } catch {
    // ignore
  }

  // 2. Prioritize explicit parameter if provided
  if (explicitMode === "training" || explicitMode === true) mode = "training";
  if (explicitMode === "prod" || explicitMode === false) mode = "prod";

  if (mode === "prod") return baseName;

  const sandboxed = [
    "bookings", "guests", "payments", "housekeeping_logs", "rooms", "users", "reviews"
  ];
  
  if (!sandboxed.includes(baseName)) return baseName;

  if (baseName === "users") return `training_guests`;
  return `training_${baseName}`;
}
