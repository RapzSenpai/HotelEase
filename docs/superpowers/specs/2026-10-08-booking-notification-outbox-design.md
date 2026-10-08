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
execution, so it will own marker claiming and notification delivery from a
Firestore outbox. Firestore rules cannot prove that an owner-only state update
included every availability marker, so the browser must not be allowed to move
an outbox job into its deliverable state.

### Write and claim sequence

1. In the existing booking transaction, write the unchanged booking document
   plus an outbox document keyed by the booking ID, with state
   `waiting_for_markers`. Include the notification payload inputs and the
   exact local availability date keys computed by the existing `nightKeys`
   helper as `markerDates`.
2. After that commit, booking submission calls an authenticated Worker endpoint
   with the booking ID and training-mode flag. The Worker verifies the Firebase
   ID token, confirms its UID owns the waiting job and booking, then uses one
   service-account Firestore transaction to read the booking, job, and every
   marker. It validates unique `YYYY-MM-DD` marker dates against the booking's
   night count and room ID. It rejects marker conflicts; otherwise it writes
   all markers and transitions the job to `queued` in that same transaction.
   A repeated call for an already queued job succeeds idempotently. Booking
   submission still waits for this result.
3. The Worker schedule runs every minute and uses the same transaction for
   waiting jobs when the browser closes before the endpoint call completes.
   Marker conflicts cancel the waiting job and compensate the markerless
   booking; transient Firestore errors retain the waiting job and retry with
   backoff. Missing or terminal bookings cancel stale waiting jobs.
4. Only the service-account Worker may update or read outbox jobs. Firestore
   rules allow the booking owner to create only the exact matching
   `waiting_for_markers` job during booking creation; they deny client reads,
   updates, and deletes. This prevents a guest from asserting that marker
   claiming succeeded.
5. Remove the detached browser notification fan-out. Once the Worker commits
   marker claims and the job transition, booking submission returns without
   waiting for staff fan-out.

Use the existing collection-mode mapping for production and training data. Add
the new outbox collection to the sandbox mapping. The endpoint accepts both
verified signed-in production owners and verified training participants,
including anonymous training identities only when the matching training job
belongs to that UID. The scheduled Worker does not depend on a browser token.
All outbox state changes use service-account access. The booking endpoint uses
the configured `VITE_GROQ_PROXY_URL`; missing Worker configuration or endpoint
failure remains a visible booking failure and uses existing compensation.

### Delivery and retry

Add a bounded scheduled Worker pass every minute. It claims markers for due
`waiting_for_markers` jobs, then reads queued jobs from production and training
outbox collections. It cancels stale waiting jobs only when their booking is
missing or terminal; marker conflicts use the existing booking compensation
semantics. For queued jobs, it resolves the same Front Office recipients and
guest name as the existing fan-out, and writes the same notification types,
titles, message templates, and links:

- Front Office: `booking_request`, “New Booking Request”, `/fo/bookings`.
- Guest, only for proof-required payment methods: `payment_proof_required`,
  “Payment Proof Required”, `/my-bookings`.

Use deterministic per-job/per-recipient notification document IDs and
create-only writes. Treat an existing document as already delivered without
modifying it, so retries cannot reset `isRead`. Write notifications before
marking the job delivered. If a marker transaction, partial inbox write,
job-state update, or Worker invocation fails, leave the job eligible for retry
and log the failure. Persist attempt/error metadata for diagnosis; set
`nextAttemptAt` with exponential backoff capped at one hour; do not silently
mark failed jobs delivered or permanently stop retrying them.

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
  idempotent repeat delivery; Worker transaction tests for complete marker
  claims, conflicts, duplicate requests, owner authorization, and scheduled
  recovery.
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
   only the Worker can make that transition, in the same transaction as every
   marker write. Browser closure cannot cancel delivery. Later cancellation or
   checkout does not erase the queued notice. Retry does not duplicate inbox
   items, and user-visible payload details match the existing notices.
7. Booking submit test proves it waits for marker claim and returns the fixed
   usable booking ID.
