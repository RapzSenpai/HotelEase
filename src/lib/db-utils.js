/**
 * Collection resolver. The training sandbox is gone: this is a plain
 * passthrough kept so the ~30 call sites need no query-logic changes.
 */

export function getCol(baseName) {
  return baseName;
}
