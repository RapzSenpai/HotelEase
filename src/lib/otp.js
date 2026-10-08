/**
 * Cell logic for the 6-digit verification code boxes.
 *
 * Kept pure so the fiddly parts — where a pasted code lands, what Backspace
 * clears, what a stray keystroke does — are testable without a browser. The
 * page owns the state; these functions only decide the next cells and which
 * box to focus.
 */

export const OTP_LENGTH = 6;

/** Six empty boxes. */
export function emptyOtpCells() {
  return Array(OTP_LENGTH).fill("");
}

/** Digits only — a code box never keeps letters or stray paste whitespace. */
function otpDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** The code as one string, ready for verification. */
export function otpFromCells(cells) {
  return Array.from({ length: OTP_LENGTH }, (_, i) => cells?.[i] ?? "").join("");
}

/**
 * Where a typed or pasted chunk lands.
 *
 * One digit fills the box it was typed in and moves on. A longer chunk (paste,
 * SMS autofill, the dev fallback code) starts at the box it landed on — except
 * a full-length code, which always starts at the first box, because nobody
 * pastes a whole code intending it to begin halfway. Extra digits are dropped.
 */
export function applyOtpInput(cells, index, rawValue) {
  const digits = otpDigits(rawValue);
  const next = Array.from({ length: OTP_LENGTH }, (_, i) => cells?.[i] ?? "");
  if (digits.length === 0) {
    next[index] = "";
    return { cells: next, focus: index };
  }
  const start = digits.length >= OTP_LENGTH ? 0 : index;
  for (let i = 0; i < digits.length && start + i < OTP_LENGTH; i += 1) {
    next[start + i] = digits[i];
  }
  return { cells: next, focus: Math.min(start + digits.length, OTP_LENGTH - 1) };
}

/** Backspace: empty box clears the one before it and moves focus there. */
export function otpBackspaceTarget(cells, index) {
  const next = Array.from({ length: OTP_LENGTH }, (_, i) => cells?.[i] ?? "");
  if (next[index]) {
    next[index] = "";
    return { cells: next, focus: index };
  }
  const prev = Math.max(0, index - 1);
  next[prev] = "";
  return { cells: next, focus: prev };
}
