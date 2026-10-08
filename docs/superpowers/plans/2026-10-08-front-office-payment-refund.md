# Front Office Payment and Refund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent booking details from displaying stale payment totals and make refund completion requirements match the selected refund method.

**Architecture:** Keep a successful payment lookup explicitly tied to its booking ID; expose payment totals only for that loaded ID. Reuse the existing refund validation helper to determine whether the Mark Paid action has adequate reference or note data.

**Tech Stack:** React, Firebase Firestore client SDK, existing refund helpers, Vitest.

**Spec:** [2026-10-08-booking-notification-outbox-design.md](../specs/2026-10-08-booking-notification-outbox-design.md)

## Global Constraints

- Clear `paymentsLoadedFor` and payment rows when a dialog lookup begins.
- Assign `paymentsLoadedFor` only after that booking’s payment lookup succeeds.
- A failed lookup must not display old payment data as current.
- Reference-required methods need a reference; other methods need a reference or note.
- Preserve `isActing` as a Mark Paid disable guard.
- Do not add dependencies.

## Review Focus

- Lookup rejects after the same booking previously loaded: loaded marker clears and summary stays unavailable; assert in Task 1 component test.
- Booking selection changes while old lookup is in flight: old response cannot show totals for new booking; assert in Task 1 component test.
- GCash/Bank Transfer without reference: Mark Paid remains disabled; assert `canMarkRefundPaid` returns false.
- Cash/other method with note only: Mark Paid becomes eligible; assert `canMarkRefundPaid` returns true.
- Any method while `isActing`: Mark Paid remains disabled; assert `canMarkRefundPaid` returns false.

---

### Task 1: Gate booking detail totals on successful lookup

**Files:**
- Modify: `src/pages/fo/FoBookingsPage.jsx`
- Create: `src/test/fo-booking-details-payment.test.js`

**Interfaces:**
- Produces: named testable `BookingDetailsDialog({ booking, roomLabel, guestName, open, onOpenChange, trainingMode })`.
- Consumes: successful `listPaymentsForBooking` result and booking ID.

- [ ] **Step 1: Write failing dialog lookup tests**

In `src/test/fo-booking-details-payment.test.js`, render `BookingDetailsDialog`, resolve the first payment lookup, close and reopen the same booking, then reject its second lookup; assert paid/balance summary is unavailable (`…`). In a second case, switch from booking A to booking B while A’s lookup is deferred, resolve A after the switch, and assert A’s records are never displayed for B.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/test/fo-booking-details-payment.test.js`
Expected: FAIL because failed refresh leaves old `paymentsLoadedFor` marked current.

- [ ] **Step 3: Clear loaded marker around lookup**

Export `BookingDetailsDialog` by name for direct test rendering. Clear `payments` and `paymentsLoadedFor` when lookup starts; assign both only on success; on failure explicitly keep the marker null and rows empty. Preserve cancelled-response guard and render paid/balance as unavailable until marker matches booking ID.

- [ ] **Step 4: Run focused test and lint**

Run: `npx vitest run src/test/fo-booking-details-payment.test.js`
Expected: PASS; failed refresh does not display stale loaded totals.

Run: `npx eslint src/pages/fo/FoBookingsPage.jsx`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/fo/FoBookingsPage.jsx src/test/fo-booking-details-payment.test.js
git commit -m "fix: gate booking totals on loaded payments"
```

### Task 2: Align Mark Paid action with refund method

**Files:**
- Modify: `src/pages/fo/FoCancellationsPage.jsx`
- Modify: `src/services/refundsService.js`
- Modify: `src/test/refund-method.test.js`

**Interfaces:**
- Consumes: `validateRefundReference({ method, referenceNumber, note }) -> { ok, ... }` from `src/services/refundsService.js`.
- Produces: `canMarkRefundPaid({ isActing, method, referenceNumber, note }) -> boolean`.

- [ ] **Step 1: Write failing disabled-state tests**

In `src/test/refund-method.test.js`, assert `canMarkRefundPaid` rejects missing GCash/Bank Transfer references, allows Over-the-Counter (Cash) with note only, rejects missing both for non-reference methods, and rejects every method while `isActing` is true.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/test/refund-method.test.js`
Expected: FAIL because `canMarkRefundPaid` is not exported.

- [ ] **Step 3: Implement and use method-aware predicate**

Implement `canMarkRefundPaid` in `src/services/refundsService.js` by returning false while `isActing`, otherwise using `validateRefundReference` with the current method, reference, and note. Use it in the Approved refund action’s disabled condition; keep `onMarkPaid` unchanged.

- [ ] **Step 4: Run focused test and lint**

Run: `npx vitest run src/test/refund-method.test.js`
Expected: PASS for reference, note, and acting states.

Run: `npx eslint src/pages/fo/FoCancellationsPage.jsx src/services/refundsService.js`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/fo/FoCancellationsPage.jsx src/services/refundsService.js src/test/refund-method.test.js
git commit -m "fix: validate refund completion by method"
```

### Task 3: Validate Front Office payment/refund changes

**Files:**
- Verify: Task 1–2 files

- [ ] **Step 1: Run focused tests**

Run: `npx vitest run src/test/fo-booking-details-payment.test.js src/test/refund-method.test.js`
Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npx eslint src/pages/fo/FoBookingsPage.jsx src/pages/fo/FoCancellationsPage.jsx src/services/refundsService.js`
Expected: exit 0.

- [ ] **Step 3: Run build and whitespace checks**

Run: `npm run build`
Expected: exit 0.

Run: `git diff --check`
Expected: exit 0.

## Plan self-review

- Spec coverage: lookup start/success/failure semantics and all refund method states map to Tasks 1–2.
- Review Focus: failed and stale lookup state map to Task 1; reference, note, and acting states map to Task 2.
- Interfaces: dialog test uses existing component props; refund UI reuses existing validator without duplicating method rules.
- Proportion: no new production abstraction; test renders the actual dialog flow.
