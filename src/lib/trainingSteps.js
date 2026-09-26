/**
 * Training setup progress (AdminTrainingModePage steps 1-4).
 * sandboxEmpty must be an explicit boolean — while it is still unknown
 * (null, e.g. right after enabling before the room check returns), no
 * data-dependent step may light up.
 */
export function isTrainingStepDone(
  n,
  { trainingMode = false, sessionCode = null, sandboxEmpty = null } = {},
) {
  if (n === 1) return Boolean(trainingMode);
  if (n === 2) return Boolean(sessionCode);
  if (n === 3) return Boolean(trainingMode) && sandboxEmpty === false;
  if (n === 4)
    return (
      Boolean(trainingMode) &&
      Boolean(sessionCode) &&
      sandboxEmpty === false
    );
  return false;
}
