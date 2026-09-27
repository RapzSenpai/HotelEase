/**
 * Pages hidden from training sessions. These are instructor-only controls
 * (session kill switch, seed/reset) or production-identity surfaces whose
 * default views touch prod data. Everything else stays visible and runs on
 * the training_* sandbox.
 */
const HIDDEN_IN_TRAINING = new Set([
  "/admin/users",
  "/admin/training",
  "/admin/settings",
]);

export function isHiddenInTraining(pathname, trainingMode) {
  if (!trainingMode) return false;
  return HIDDEN_IN_TRAINING.has(pathname);
}
