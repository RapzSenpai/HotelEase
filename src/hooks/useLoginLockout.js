import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 30;

const STORAGE_KEY = "bshm_login_lockout";

function emptyState() {
  return { failedAttempts: 0, lockoutEndTime: null };
}

function readStoredState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyState();
    const failedAttempts = Number.isInteger(parsed.failedAttempts)
      ? parsed.failedAttempts
      : 0;
    const lockoutEndTime =
      typeof parsed.lockoutEndTime === "number" ? parsed.lockoutEndTime : null;
    // Expired lockout: treat as clean slate (same as post-lockout reset).
    if (lockoutEndTime && Date.now() >= lockoutEndTime) {
      return { failedAttempts: 0, lockoutEndTime: null };
    }
    return {
      failedAttempts: Math.max(0, Math.min(failedAttempts, MAX_ATTEMPTS)),
      lockoutEndTime,
    };
  } catch {
    return emptyState();
  }
}

function computeRemaining(endTime) {
  if (!endTime) return 0;
  return Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
}

/**
 * Brute-force protection for the login form. Attempt count and lockout
 * deadline persist in sessionStorage so a page refresh no longer resets
 * the counter.
 */
export function useLoginLockout() {
  const [state, setState] = useState(readStoredState);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    computeRemaining(state.lockoutEndTime)
  );
  const timerRef = useRef(null);

  const { failedAttempts, lockoutEndTime } = state;
  const isLocked = Boolean(lockoutEndTime && remainingSeconds > 0);

  // Persist across refreshes.
  useEffect(() => {
    try {
      if (!failedAttempts && !lockoutEndTime) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ failedAttempts, lockoutEndTime })
        );
      }
    } catch {
      // Storage unavailable (private mode etc.) — lockout still works in-memory.
    }
  }, [failedAttempts, lockoutEndTime]);

  // Countdown while locked; auto-clears when it hits zero.
  useEffect(() => {
    if (!lockoutEndTime) return undefined;
    function tick() {
      const remaining = computeRemaining(lockoutEndTime);
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        setState({ failedAttempts: 0, lockoutEndTime: null });
        clearInterval(timerRef.current);
      }
    }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [lockoutEndTime]);

  // Reads current render's values (not a lazy updater) so the caller gets a
  // reliable "did this failure trigger the lock" answer back.
  const registerFailure = useCallback(() => {
    const next = failedAttempts + 1;
    const justLocked = next >= MAX_ATTEMPTS;
    setState({
      failedAttempts: next,
      lockoutEndTime: justLocked ? Date.now() + LOCKOUT_SECONDS * 1000 : lockoutEndTime,
    });
    return justLocked;
  }, [failedAttempts, lockoutEndTime]);

  const resetAttempts = useCallback(() => {
    setState({ failedAttempts: 0, lockoutEndTime: null });
  }, []);

  return {
    failedAttempts,
    isLocked,
    remainingSeconds,
    maxAttempts: MAX_ATTEMPTS,
    lockSeconds: LOCKOUT_SECONDS,
    registerFailure,
    resetAttempts,
  };
}
