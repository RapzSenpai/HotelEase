# Booking notification and review fixes

## Goal

Fix the six reported issues while preserving existing booking, notification,
refund, and verification behavior. Booking-created notifications must survive a
guest closing the browser after booking submission; all other fixes remain
targeted to the reported flows.

## Scope

- Acknowledge only matching unread notifications that were present when a
  matching page visit began. Explicit notification acknowledgement remains
  unchanged.
- Ensure booking detail payment totals are treated as loaded only after the
  current lookup succeeds.
- Apply method-specific reference/note validation to the refund “Mark Paid”
  action.
- Store verification OTP cells as canonical state so missing positions remain
  missing during submission checks.
- Persist a booking-notification outbox item with booking creation and deliver
  it through the existing Cloudflare Worker.
- Make booking submission tests verify both the fixed booking ID and that
  submission waits for the availability-marker claim.

## Durable notification architecture

The browser currently writes booking notifications asynchronously after the
booking and availability markers commit. A tab close can terminate that work.
Firebase Functions are not configured in this repository; the existing
Cloudflare Worker already has service-account Firestore access and scheduled
execution, so it will deliver a Firestore outbox.

### Write and claim sequence

1. In the existing booking transaction, write the unchanged booking document
   plus an outbox document keyed by the booking ID, with state
   `waiting_for_markers`. Include only data needed to reproduce current notice
   text (booking/guest/room identifiers, room label, formatted stay dates, and
   payment method).
2. Extend the availability-marker transaction with an optional outbox
   reference. In the same transaction that claims all stay markers, transition
   that job to `queued`. Existing callers without an outbox reference retain
   current behavior. The Firestore rule permits the booking owner only this
   `waiting_for_markers` → `queued` transition, without changing payload fields.
3. If marker claiming fails, the existing booking compensation remains in
   effect and the job never becomes deliverable. Worker cleanup marks a
   waiting job cancelled if its booking is missing or terminal.
4. The service-account Worker uses Admin access for all delivery and retry
   state changes. Guests cannot read or delete jobs.
5. Remove the detached browser notification fan-out. The booking submission
   returns after the existing marker claim, without waiting for staff fan-out.

Use the existing collection-mode mapping for production and training data. Add
the new outbox collection to the sandbox mapping. Firestore rules permit only
the booking owner to create the matching job for their own booking, using the
post-write booking state and an exact allowed-field list, and to make only the
single state transition above. The service-account Worker processes jobs and
changes their state with Admin access.

### Delivery and retry

Add a bounded scheduled Worker pass every minute. It reads queued jobs and
stale `waiting_for_markers` jobs from production and training outbox
collections. It cancels stale waiting jobs only when their booking is missing
or terminal. For queued jobs, it resolves the same Front Office recipients and
guest name as the existing fan-out, and writes the same notification types,
titles, message templates, and links:

- Front Office: `booking_request`, “New Booking Request”, `/fo/bookings`.
- Guest, only for proof-required payment methods: `payment_proof_required`,
  “Payment Proof Required”, `/my-bookings`.

Use deterministic per-job/per-recipient notification document IDs. Write
notifications before marking the job delivered. If a partial write, job-state update, or Worker invocation fails, leave the job
eligible for retry and log the failure. Repeated attempts overwrite the same
notification documents rather than creating duplicates. Persist attempt/error
metadata for diagnosis; set `nextAttemptAt` with exponential backoff capped at
one hour; do not silently mark failed jobs delivered or permanently stop
retrying them.

## UI and test changes

### Notification visit acknowledgement

Treat route entry as the acknowledgement boundary. On a pathname/search
change, capture IDs of matching unread notifications currently available and
acknowledge only those IDs. Do not rerun the acknowledgement selection merely
because the live notification list changes; notifications not yet in the
in-memory list at route entry are not added to that visit's acknowledgement
set. Keep the existing explicit single-notification, mark-all, and toast
actions unchanged.

### Booking payment lookup

Clear `paymentsLoadedFor` and payment rows when a dialog lookup begins. Assign
the selected booking ID only after that booking’s lookup succeeds. A rejected
lookup leaves the loaded marker empty and cannot display old payment totals as
current.

### Refund method validation

Keep `isActing` in the Mark Paid disabled condition. Methods for which
`refundMethodNeedsReference` is true require a nonempty reference. Other
methods require either a reference or a note.

### OTP cells

Use `otpCells` state initialized with `emptyOtpCells()`. Derive the submission
code with `otpFromCells(otpCells)` for verification and disabled-state checks.
Input, paste, and Backspace handlers store returned cells from the OTP helpers.
Both fallback-code paths populate cells with `applyOtpInput`, preserving the
existing digit filtering and paste behavior.

### Booking submission test

Have the Firestore `doc` mock return a fixed ID for generated booking
references. Use a deferred promise for `claimBookingMarked`; assert
`createBooking` remains unresolved while the claim is pending, resolve the
claim, then assert completion and the fixed `bookingId` passed to the claim.

## Error handling

Worker delivery failures retain a retryable outbox job and emit structured
console errors with job ID and attempt count. Existing browser booking errors
and compensation errors remain visible through current handling. Failed payment
lookups remain distinguishable from successful empty histories. Explicit user
acknowledgement behavior is not changed.

## Validation

- Focused UI/service Vitest tests for notification visit boundaries, loaded
  payment state, refund-method validation, OTP cell gaps/fallbacks, and booking
  claim sequencing.
- Worker unit tests for successful delivery, retry after write failure, and
  idempotent repeat delivery.
- Run ESLint on changed source files, production build, Worker tests, and
  Firestore rules validation if an existing local rules validator is available;
  otherwise inspect the rules and exercise them in emulator tests if configured.
- Verify `git diff --check` and inspect the final diff to avoid including
  unrelated worktree changes.

## Acceptance criteria

1. A notification arriving after the user is already on its matching page
   remains unread until explicitly opened or acknowledged.
2. Existing notifications at visit start still auto-ack when their path and,
   where present, booking ID match.
3. Failed payment lookup cannot leave the booking details dialog with payment
   records marked loaded.
4. Mark Paid is enabled only when the current refund method’s required
   reference/note data is present and no action is in progress.
5. OTP `"1__456"`-style gaps remain in place and fail the six-digit submission
   check; fallback codes fill cells through the shared input helper.
6. A committed booking and successful marker claim leave a durable queued job;
   browser closure cannot cancel delivery. Later cancellation or checkout does
   not erase the queued notice. Retry does not duplicate inbox items, and
   user-visible payload details match the existing notices.
7. Booking submit test proves it waits for marker claim and returns the fixed
   usable booking ID.
