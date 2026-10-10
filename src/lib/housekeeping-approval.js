// Pure four-eyes approval check for housekeeping sign-off.
// Second person (or admin, or rooms with no recorded starter) always passes.
// A lone FO may self-approve only with inspection-photo evidence.
export function checkApproveGate({
  starterUid = null,
  approverUid = null,
  isAdmin = false,
  otherFoOnline = false,
  photoCount = 0,
} = {}) {
  const isSelfApprove = !!(starterUid && approverUid && starterUid === approverUid);
  if (!isSelfApprove || isAdmin) return { ok: true };
  if (otherFoOnline) {
    return {
      ok: false,
      reason: "Another FO is on duty — ask them to inspect and approve this room.",
    };
  }
  if (!(photoCount > 0)) {
    return {
      ok: false,
      reason: "Solo-shift self approval needs at least 1 inspection photo.",
    };
  }
  return { ok: true, solo: true };
}
