# OTP Cell State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve digit positions in the email-verification code so gaps remain incomplete instead of collapsing into a valid-looking code.

**Architecture:** Make the six OTP cells canonical component state. Derive the joined string only for submission and disabled-state checks; continue using the existing pure input helpers for typing, paste, Backspace, and fallback codes.

**Tech Stack:** React, existing `src/lib/otp.js` helpers, Vitest.

**Spec:** [2026-10-08-booking-notification-outbox-design.md](../specs/2026-10-08-booking-notification-outbox-design.md)

## Global Constraints

- OTP length is exactly 6 cells.
- Cells accept digits only; gaps retain their original positions.
- Use `otpFromCells` for submission and disabled-state checks.
- Both fallback-code paths populate cells through `applyOtpInput`.
- Do not add dependencies.

## Review Focus

- Digit entered into a later cell leaves a gap: joined code remains incomplete; test in `otp.test.js`.
- Nondigit paste: cells contain only digits; test in `otp.test.js`.
- Short paste: digits begin in the selected cell; test in `otp.test.js`.
- Full-code paste: all six digits begin at first cell; test in `otp.test.js`.
- Send/resend fallback: code populates cells via `applyOtpInput`; test helper output and verify both page paths use it.

---

### Task 1: Store OTP cells as source of truth

**Files:**
- Modify: `src/pages/public/VerifyEmailPage.jsx`
- Create: `src/test/verify-email-page.test.js`
- Test: `src/test/otp.test.js`

**Interfaces:**
- Consumes: `OTP_LENGTH`, `emptyOtpCells()`, `applyOtpInput(cells, index, rawValue)`, `otpBackspaceTarget(cells, index)`, and `otpFromCells(cells)` from `src/lib/otp.js`.
- Produces: `otpCells` state; joined `code` is derived from that state.

- [ ] **Step 1: Write failing page behavior tests**

In `src/test/verify-email-page.test.js`, render `VerifyEmailPage` with mocked `useAuth` returning user `{ uid: "guest-1" }` and a send fallback code, using `createRoot`, `act`, and `MemoryRouter` as existing component tests do. Assert six inputs contain the fallback; clear the second input and assert values remain `["1", "", "3", "4", "5", "6"]` and Verify Email stays disabled. Exercise resend fallback with a second code and assert all cells update. Keep `src/test/otp.test.js` pure-helper coverage for gaps and both paste lengths.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/test/verify-email-page.test.js src/test/otp.test.js`
Expected: FAIL because collapsed state moves digits after the cleared cell.

- [ ] **Step 3: Replace collapsed code state**

In `VerifyEmailPage.jsx`, replace `code` state plus memoized cell projection with `otpCells` initialized from `emptyOtpCells()`. Derive `code` with `otpFromCells(otpCells)`. Store `cells` from all cell change, paste, and Backspace helper results. Populate both send and resend fallback paths with `applyOtpInput(emptyOtpCells(), 0, fallbackCode).cells`. Keep verification and button checks based on the derived code.

- [ ] **Step 4: Run OTP tests and lint**

Run: `npx vitest run src/test/verify-email-page.test.js src/test/otp.test.js`
Expected: PASS with gaps preserved and both fallback paths filling all six cells.

Run: `npx eslint src/pages/public/VerifyEmailPage.jsx`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/public/VerifyEmailPage.jsx src/test/verify-email-page.test.js
git commit -m "fix: preserve otp cell positions"
```

### Task 2: Validate OTP page behavior

**Files:**
- Verify: `src/pages/public/VerifyEmailPage.jsx`, `src/lib/otp.js`, `src/test/otp.test.js`

- [ ] **Step 1: Run OTP tests**

Run: `npx vitest run src/test/verify-email-page.test.js src/test/otp.test.js`
Expected: PASS for gaps, filtering, short/full paste, Backspace, and both fallback paths.

- [ ] **Step 2: Run lint, build, and whitespace checks**

Run: `npx eslint src/pages/public/VerifyEmailPage.jsx`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

Run: `git diff --check`
Expected: exit 0.

## Plan self-review

- Spec coverage: canonical cells, joined submission code, all input handlers, both fallback paths, and existing OTP helper behavior map to Task 1.
- Review Focus: all five input classes map to page interaction tests or existing OTP helper tests.
- Interfaces: no helper signatures or dependencies change.
- Proportion: one page and its existing pure-helper test; no new files or abstractions.
