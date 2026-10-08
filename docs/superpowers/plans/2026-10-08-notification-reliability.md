# Notification Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acknowledge only notifications present at visit start and deliver booking-created notifications from a durable server-side outbox.

**Architecture:** Keep route-based acknowledgement selection in a pure helper and capture its inputs only when the route changes. Write a per-booking Firestore outbox item in the booking transaction; the Cloudflare Worker exclusively claims availability markers and changes the outbox to `queued` in one service-account transaction. An authenticated endpoint handles the normal submission path, while the one-minute schedule recovers abandoned `waiting_for_markers` jobs and delivers deterministic inbox documents.

**Tech Stack:** React, Firebase Firestore client SDK and security rules, Cloudflare Worker, Firestore REST API, Vitest.

**Spec:** [2026-10-08-booking-notification-outbox-design.md](../specs/2026-10-08-booking-notification-outbox-design.md)

## Global Constraints

- Use existing Cloudflare Worker; Firebase Functions are not configured.
- Poll production and training outboxes every minute.
- Only the service-account Worker may read or update outbox jobs; Firestore rules deny client read, update, and delete.
- Queue state moves `waiting_for_markers` → `queued` only in the same Worker-owned transaction that writes every availability marker.
- The authenticated booking submission endpoint and scheduled recovery call the same idempotent marker-claim operation.
- Preserve current booking notice types, titles, message templates, recipients, and links.
- Use deterministic notification IDs; retries must not reset `isRead` or create duplicate inbox entries.
- Retry failures with exponential backoff capped at one hour; never silently mark failed jobs delivered.
- Do not add dependencies.

## Review Focus

- Marker claim conflicts or booking compensation makes booking terminal: job never queues or delivers; assert transaction and cleanup behavior in Worker tests.
- Duplicate fast-path and scheduled requests race for one waiting job: exactly one marker/job commit occurs; assert idempotency in Worker tests.
- Caller UID mismatches the job owner, or an anonymous caller targets production: reject without writes; assert endpoint authorization in Worker tests.
- Anonymous training caller owns a training job: allow only its `training_*` booking/job/marker paths; assert Worker auth and fan-out tests.
- Worker transaction or response fails after booking creation: preserve a recoverable job and do not falsely report successful delivery; assert retry/recovery behavior.
- Partial inbox writes or delivered-state patch fails: retry same IDs; assert in Worker retry test.
- Retry reaches an already-read notification: existing document must remain read; assert create-conflict behavior.
- Training-mode job: use `training_*` paths and `training_guests`; assert Worker fan-out in training test.
- No FO recipient or proof-exempt payment: do not fabricate recipients or send guest proof notice; assert recipient selection for empty FO and OTC/Card.

---

### Task 1: Acknowledge notifications from visit snapshot

**Files:**
- Modify: `src/lib/notification-links.js`
- Modify: `src/components/notifications/NotificationBell.jsx`
- Test: `src/test/notification-links.test.js`

**Interfaces:**
- Produces: `unreadNotificationIdsForVisit(notifications, { pathname, bookingId }) -> string[]`; includes only unread matching IDs from the passed snapshot.
- Consumes: Existing `notificationMatchesVisit(link, { pathname, bookingId }) -> boolean`.

- [x] **Step 1: Write failing tests**

In `src/test/notification-links.test.js`, assert helper includes matching unread IDs, excludes read/wrong-booking IDs, and does not include a notification added after the captured visit snapshot.

- [x] **Step 2: Run test to verify failure**

Run: `npx vitest run src/test/notification-links.test.js`
Expected: FAIL because `unreadNotificationIdsForVisit` is not exported.

- [x] **Step 3: Implement visit-snapshot selection**

Add the pure helper in `src/lib/notification-links.js`. In `NotificationBell.jsx`, keep a visit-key ref containing the IDs selected on the latest pathname/search, user, or training-mode change. The effect may run again when notifications update, but reuse only the captured IDs; this permits retry after write failure without adding later arrivals. Preserve `ackedRef` failure recovery and all explicit acknowledgement handlers.

- [x] **Step 4: Run focused test**

Run: `npx vitest run src/test/notification-links.test.js`
Expected: PASS; later notification snapshots do not trigger visit acknowledgement.

- [x] **Step 5: Preserve shared worktree changes**

Implementation files remain uncommitted because they overlap a pre-existing dirty `main` worktree; do not stage unrelated file changes.

### Task 2: Create owner-only outbox and call the Worker claim endpoint

**Files:**
- Modify: `src/lib/db-utils.js`
- Modify: `src/services/booking/createBooking.js`
- Modify: `src/services/availabilityService.js`
- Modify: `firestore.rules`
- Modify: `src/test/availability-outbox.test.js`
- Modify: `src/test/booking-submit-wait.test.js`

**Interfaces:**
- Produces: `claimBookingMarked({ bookingId, trainingMode }) -> Promise<{ claimed: number }>`; obtains an ID token from `auth.currentUser` and calls `POST /claim-booking-markers` using `X-HE-AUTH`.
- Produces: outbox collection `booking_notification_jobs` and sandbox path `training_booking_notification_jobs`.
- Consumes: Worker endpoint contract from Task 3: `{ bookingId, trainingMode }` request; `{ ok: true, claimed: number }` success response; non-2xx JSON `{ error }` becomes a thrown `Error`.

- [ ] **Step 1: Write failing client/outbox tests**

In `src/test/availability-outbox.test.js`, test that `claimBookingMarked` sends the fixed URL `${VITE_GROQ_PROXY_URL}/claim-booking-markers`, current Firebase ID token, booking ID, and training flag; test missing auth/config and preserve `MARKER_CONFLICT_MESSAGE` on HTTP 409. In `src/test/booking-submit-wait.test.js`, make generated `doc()` refs expose ID `booking-fixed`, capture transaction writes, defer `claimBookingMarked`, and assert `createBooking` remains pending until the claim resolves. Assert outbox has `status: "waiting_for_markers"` and `markerDates` equal the local `nightKeys` for the stay; assert claim receives only `{ bookingId: "booking-fixed", trainingMode: false }` and result ID stays fixed.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/test/availability-outbox.test.js src/test/booking-submit-wait.test.js`
Expected: FAIL because current outbox omits `markerDates` and current claim path still uses a client Firestore transaction.

- [ ] **Step 3: Implement the client endpoint call and outbox payload**

In `createBooking.js`, write the job with `bookingId`, `guestId`, `roomId`, `roomName`, formatted `checkIn`/`checkOut`, `markerDates: nightKeys(checkIn, checkOut)`, `paymentMethod`, `status: "waiting_for_markers"`, `attempts: 0`, `nextAttemptAt`, and timestamps in the booking transaction. Remove the optional job update from `claimBookingMarkedInTx`; keep that helper's existing marker-only behavior for lifecycle callers. Change `claimBookingMarked` in `availabilityService.js` to call the authenticated Worker endpoint and parse the specified response. Missing token/config and non-2xx responses must throw explicit errors. Add outbox to `getCol` sandbox allowlist and remove `announceBookingCreated` with its client-side user/notification imports.

- [ ] **Step 4: Restrict Firestore rules to outbox creation**

Add one shared validator for exact job keys and values, including `markerDates is list`, unique-date count equal to booking `nights`, matching owner, room, payment method, and post-write active booking. Add production and training matches that allow only owner creation of the matching `waiting_for_markers` job. Do not grant client read, update, or delete.

- [ ] **Step 5: Run client tests and inspect rules**

Run: `npx vitest run src/test/availability-outbox.test.js src/test/booking-submit-wait.test.js`
Expected: PASS for token/header, payload, deferred wait, and fixed ID. No Firestore rules emulator is configured; manually verify both modes deny every client operation except valid owner creation.

- [ ] **Step 6: Preserve the shared worktree**

Do not stage or commit product files; they overlap unrelated pre-existing `main` worktree changes.

### Task 3: Implement server-owned transactional marker claim and endpoint

**Files:**
- Modify: `worker/src/firestore.js`
- Modify: `worker/src/firebase-jwt.js`
- Modify: `worker/src/booking-notifications.js`
- Modify: `worker/src/index.js`
- Modify: `worker/src/booking-notifications.test.js`

**Interfaces:**
- Produces: `resolveBookingClaimIdentity(request, workerEnv) -> Promise<{ uid: string, isAnonymous: boolean } | null>`; verify Firebase ID token from `X-HE-AUTH`, retaining anonymous status.
- Produces: `claimBookingNotificationJob({ accessToken, projectId, bookingId, trainingMode, requesterUid? }) -> Promise<{ status: "queued" | "conflict" | "cancelled", claimedMarkers: number }>`; an optional requester UID must equal the job guest ID.
- Consumes: `markerDates`, owner-only outbox create rule, and existing service-account token/helper patterns.

- [ ] **Step 1: Write failing Worker transaction and endpoint tests**

In `worker/src/booking-notifications.test.js`, assert a valid owner claim reads the booking, waiting job, and every expected marker in one REST transaction, then commits every marker write and the outbox `queued` update together. Assert an occupied marker or `markerDates` mismatch aborts with `status: "conflict"` and commits no writes. Assert already-queued duplicate requests return success without another marker commit. Test that a mismatched UID and anonymous production token are rejected without writes, while an anonymous training token can claim only its own `training_*` job. Test the endpoint's `200`, `401`, `403`, and `409` response shapes.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run worker/src/booking-notifications.test.js`
Expected: FAIL because transactional claim helpers and `/claim-booking-markers` endpoint do not exist.

- [ ] **Step 3: Add Firestore REST transaction helpers**

In `worker/src/firestore.js`, add begin, transaction-scoped GET, commit, and rollback helpers. Return document `fields` and `updateTime`; throw explicitly on non-success HTTP responses. Keep credentials server-side and use the existing Firestore REST base URL.

- [ ] **Step 4: Implement and expose the atomic claim operation**

In `booking-notifications.js`, implement the exact `claimBookingNotificationJob` interface. In one service-account transaction, read the mode-specific booking, job, and each `${roomId}_${date}` marker before writes. Validate matching owner, room, active booking status, unique ISO date keys, and that `markerDates` exactly matches the local night-key sequence derived from the booking's check-in/check-out and night count. Treat another booking's nonterminal marker as a conflict; stale terminal markers are overwritten, matching `claimBookingMarkedInTx`. On success, write all `{ roomId, date, bookingId, status, updatedAt }` markers and update only the job state to `queued`. If already queued, return idempotent success. Roll back reads when returning a conflict or invalid job.

In `firebase-jwt.js`, export the exact `resolveBookingClaimIdentity` interface without changing AI identity behavior. In `index.js`, handle `POST /claim-booking-markers` before AI rate/daily limits. Require a valid token; reject anonymous production claims, allow authenticated training identities only when UID owns the matching job, and return the specified status shapes. Never accept marker data or payload details from the request body.

- [ ] **Step 5: Run Worker claim tests**

Run: `npx vitest run worker/src/booking-notifications.test.js`
Expected: PASS for atomic success, conflict rollback, duplicate request, ownership, and training authorization.

- [ ] **Step 6: Preserve the shared worktree**

Do not stage or commit product files; they overlap unrelated pre-existing `main` worktree changes.

### Task 4: Recover waiting jobs and deliver notifications durably

**Files:**
- Modify: `worker/src/booking-notifications.js`
- Modify: `worker/src/booking-notifications.test.js`
- Modify: `worker/src/index.js`
- Modify: `worker/wrangler.toml`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: `claimBookingNotificationJob` from Task 3.
- Produces: `processBookingNotificationOutbox(workerEnv) -> Promise<summary>`; claims due waiting jobs, delivers queued jobs, and persists retry/cancel state.
- Produces: `createFirestoreDoc(accessToken, projectId, collectionPath, documentId, fields) -> Promise<boolean>`; false means already exists, never overwrites.

- [ ] **Step 1: Write failing recovery and delivery tests**

In `worker/src/booking-notifications.test.js`, assert (a) scheduled recovery claims an active production and training waiting job before delivery, (b) scheduled conflict cancels the waiting job and compensates the markerless booking (training deletes booking), (c) missing/terminal waiting bookings cancel after 15 minutes, (d) transient claim failure sets attempt/error/`nextAttemptAt`, (e) notification fan-out keeps existing payloads and recipients, (f) proof notice only for GCash/Bank Transfer, (g) partial inbox/delivered-patch failures retry with stable IDs, (h) create conflict never overwrites existing read state, and (i) empty FO list creates no staff inbox documents.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run worker/src/booking-notifications.test.js`
Expected: FAIL because processor does not claim waiting jobs and does not compensate scheduled marker conflicts.

- [ ] **Step 3: Implement create-only inbox writes and waiting-job recovery**

Keep `createFirestoreDoc` document-ID-addressed and create-only; HTTP 409 returns false, all other errors throw. In `processBookingNotificationOutbox`, read at most 50 due waiting and 50 due queued jobs per collection per run. Use the Task 3 claim function for waiting jobs. On scheduled marker conflict, atomically cancel the job and compensate the markerless booking; cancel missing/terminal waiting jobs after 15 minutes. Apply exponential backoff capped at one hour for transient claim and delivery failures.

- [ ] **Step 4: Preserve notification payload and connect the schedule**

For queued jobs, resolve `role == "fo"` from `users`/`training_guests`, exclude `guestId`, derive guest display name from the matching user collection, and preserve the existing notification types, titles, messages, and links. Create deterministic `booking_<bookingId>_<recipientId>_<type>` inbox docs, write all notifications before marking delivered, and never overwrite existing items. Add `* * * * *` to `worker/wrangler.toml`; invoke the processor on every scheduled event without changing hourly or daily sweep conditions. Add production/training indexes for `status + nextAttemptAt` and `status + createdAt`.

- [ ] **Step 5: Run Worker delivery and recovery tests**

Run: `npx vitest run worker/src/booking-notifications.test.js`
Expected: PASS for transaction recovery, compensation, retries, production/training fan-out, and idempotent create-only delivery.

- [ ] **Step 6: Preserve the shared worktree**

Do not stage or commit product files; they overlap unrelated pre-existing `main` worktree changes.

### Task 5: Validate notification reliability changes

**Files:**
- Verify: Tasks 1–4 files

- [ ] **Step 1: Run focused app and Worker tests**

Run: `npx vitest run src/test/notification-links.test.js src/test/notification-bell-visit.test.jsx src/test/availability-outbox.test.js src/test/booking-submit-wait.test.js worker/src/booking-notifications.test.js`
Expected: PASS.

- [ ] **Step 2: Run lint, build, and whitespace checks**

Run: `npx eslint src/lib/notification-links.js src/components/notifications/NotificationBell.jsx src/lib/db-utils.js src/services/booking/createBooking.js src/services/availabilityService.js worker/src/booking-notifications.js worker/src/firestore.js worker/src/firebase-jwt.js worker/src/index.js`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

Run: `git diff --check`
Expected: exit 0.

## Plan self-review

- Spec coverage: visit-boundary acknowledgement, owner-only outbox creation, server-owned atomic marker/job transaction, authenticated fast path, scheduled recovery, production/training rules and identities, payload preservation, durable retries, idempotent create-only notices, fixed booking ID, and deferred submission wait map to Tasks 1–5.
- Review Focus: all five inputs map to explicit transaction, auth, recovery, or fan-out tests.
- Interfaces: client sends only booking ID and mode; Worker derives marker data from the owner-created job, validates it against booking and marker documents, and owns all job updates.
- Proportion: five tasks separate client creation, server claim, scheduled recovery/delivery, and final validation; no dependencies added.
- Worktree: implementation steps deliberately leave product changes uncommitted because target files overlap pre-existing user modifications on `main`.
