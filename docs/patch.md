# HotelEase Patch Plan

**Instructions for AI agent:** Execute ONE phase at a time. Stop after each phase and wait for manual verification before proceeding to next phase. Do not skip ahead. Do not modify files outside the scope listed per phase.

---

## PHASE 0 — Documentation only (no code changes)

- [ ] Add code comment above Groq client init in `src/services/chatbotService.js` documenting known limitation:
  ```
  // KNOWN LIMITATION: Groq API key is exposed client-side (dangerouslyAllowBrowser: true).
  // Firebase Spark (free) plan does not support Cloud Functions to proxy this call.
  // Future work: migrate to serverless proxy (Vercel Edge Function / Cloudflare Worker)
  // once deployment platform is finalized. Accepted as academic-scope risk for capstone.
  ```
- [ ] No other changes in this phase.

**Verify:** comment present, nothing else touched, app still runs.

---

## PHASE 1 — Critical security fixes

### 1.1 Rate-limit `messages` collection abuse
- File: `firestore.rules`
- Add honeypot field check to `messages` create rule — reject if a hidden field (e.g. `honeypot`) is non-empty.
- File: `src/pages/public/ContactPage.jsx` — add hidden input field named `honeypot` (CSS `display:none`, not `type=hidden` — bots skip hidden inputs but fill visible-but-offscreen ones less reliably; use `tabIndex={-1}` + `autoComplete="off"` + visually hidden CSS), submit blocked client-side if filled.

### 1.2 Password strength validation
- File: `src/pages/public/RegisterPage.jsx`
- Add: min length 8, require at least 1 number. Show inline validation message.
- File: `src/pages/public/LoginPage.jsx` — no change needed (login just checks credentials).

**Verify:** submit spam-test on contact form (fill honeypot) → rejected. Register with `pass` → rejected; register with `password1` → accepted.

---

## PHASE 2 — Wire half-built features

### 2.1 Guest booking cancellation UI
- File: `src/pages/public/MyBookingsPage.jsx`
- Add "Cancel Booking" button, visible only when `status` is `Pending` or `Approved` (not `Checked In`/`Checked Out`/`Cancelled`).
- Call existing `cancelBooking()` from `src/services/bookingsService.js`.
- Confirm dialog before cancel (reuse existing Dialog component from `src/components/ui/`).
- On success: toast via `sonner`, refresh booking list.

### 2.2 Sandbox reviews in training mode
- File: `src/services/reviewsService.js`
- Replace direct `reviews` collection reference with `getCol('reviews')` pattern (same as `bookingsService.js`, `roomsService.js`).
- File: `firestore.rules` — add `training_reviews` rule block mirroring existing `training_*` permissive pattern.

### 2.3 List training guests in Admin User Management
- File: `src/pages/admin/AdminUserManagementPage.jsx`
- Add toggle or tab: "Production Users" / "Training Session Users".
- Training tab calls `listUsers({ trainingMode: true })` — check `userService.js` for existing param support, add if missing.

**Verify:** cancel a Pending booking as guest → status becomes Cancelled, room stays unaffected. Submit review in training mode → lands in `training_reviews` not `reviews`. Admin page shows training_guests when toggled.

---

## PHASE 3 — Content/cosmetic fixes (fast, do before any demo)

- File: `src/pages/public/AboutPage.jsx` — replace "Profile details coming soon" placeholder with actual team member info (names, roles) or remove the section if not ready.
- File: `src/pages/public/ContactPage.jsx` — replace placeholder phone `+63 000 000 0000` and example email with real (or realistic mock) contact info.

**Verify:** visually check both pages render real content, no lorem-ipsum-style placeholders visible.

---

## PHASE 4 — UX improvement (medium priority)

### 4.1 Date-range availability filter on RoomsPage
- File: `src/pages/public/RoomsPage.jsx`
- Add check-in/check-out date pickers above existing filters.
- Reuse date-conflict logic pattern already in `src/services/bookingsService.js` (checks against `Pending`/`Approved`/`Checked In` bookings) — adapt into a `getAvailableRooms(checkIn, checkOut)` function in `roomsService.js` or `bookingsService.js`.
- Filter room list client-side or via new service call.

**Verify:** pick a date range that overlaps an existing Approved booking for Room X → Room X excluded from results. Empty date fields → shows all rooms (unchanged default behavior).

---

## PHASE 5 — Dead code cleanup

- [ ] Remove `src/components/AIChatbot.jsx` (unused legacy, never mounted) — confirm zero imports first via grep before deleting.
- [ ] Remove `@google/generative-ai` from `package.json` dependencies (zero usage in `src/`) — run `npm install` after to update lockfile.
- [ ] Remove `VITE_AI_API_KEY` reference from `.env.example` if present (belonged to deleted `AIChatbot.jsx`).

**Verify:** `npm run build` succeeds after removal. Grep confirms no remaining references to deleted component/package.

---

## PHASE 6 — Booking lifecycle bugs (found via edge-case audit)

### 6.1 Fix race condition in createBooking()
- File: `src/services/bookingsService.js`, lines ~256-312
- Current: conflict check (`getDocs`) runs OUTSIDE `runTransaction`, transaction only writes.
- Fix: move the overlap query INSIDE `runTransaction` — query conflicting bookings for `roomId` + date range using `transaction.get()`, abort (throw) if overlap found, THEN `transaction.set()` the new booking. Firestore transactions auto-retry on write contention, so this closes the double-booking window.
- Do not change the public function signature — same inputs/outputs, only internal logic changes.

### 6.2 Fix stale room status on cancelBooking()
- File: `src/services/bookingsService.js`, lines ~413-442
- Current: only updates booking doc to `Cancelled`, room status untouched.
- Fix: before updating booking, read booking's current `status`. If it was `Approved` or `Checked In`, also update linked room's `status` back to `Available` in the same transaction/batch as the booking update.
- Verify `rejectBooking()` (~382-396) — confirm it does NOT need the same fix (reject typically happens pre-approval, room was never touched) — if reject also touches room status incorrectly, apply same pattern there.

### 6.3 Fix orphaned room stub in MyBookingsPage
- File: `src/pages/public/MyBookingsPage.jsx`, line ~579
- Current: stub room object `{ id: b.roomId }` for missing rooms — `isActive` undefined causes `isRoomActive()` to incorrectly return true, showing "Book This Room Again" for a room that no longer exists.
- Fix: stub should be `{ id: b.roomId, isActive: false }` explicitly.

**Verify:**
- Simulate two near-simultaneous booking requests for same room/overlapping dates (two browser tabs, submit within same second) → only one succeeds, other gets clear conflict error.
- Cancel an Approved booking → room status reverts to Available, room bookable again immediately.
- Cancel a Pending booking → room status unaffected (was never Reserved).
- View My Bookings for a booking whose room was archived/deleted → no incorrect "Book Again" CTA.

---

## Explicitly deferred (not in this patch, future work only)

- SMS notifications — out of scope, in-app + email sufficient.
- Multi-language / multi-currency — out of scope for local demo.
- Payment gateway integration — booking-request model is intentional design, not a gap; document as such in SRS.
- Automated tests / CI — not worth capstone-timeline investment.
- Groq proxy migration — see Phase 0 comment, revisit only if deployment platform changes.

---

## PHASE 7 — Booking abuse prevention & checkout integrity (found via booking-lifecycle audit)

### 7.1 Limit active bookings per guest
- File: `src/services/bookingsService.js`, inside `createBooking()`
- Before creating new booking: query count of existing bookings where `guestId == currentUser.uid` AND `status in ["Pending", "Approved"]`.
- If count >= 3 (adjustable constant `MAX_ACTIVE_BOOKINGS_PER_GUEST`), throw error: "You have reached the maximum number of active bookings. Cancel or complete an existing booking before making a new one."
- Surface this error in `BookingPage.jsx` as a user-facing message, not console error.

### 7.2 Cancellation deterrent for Approved bookings
- File: `src/services/bookingsService.js`, `cancelBooking()`
- Add field `cancellationCount` (number, default 0) to `users/{uid}` doc — increment on every cancel where prior booking status was `Approved` (not `Pending`).
- File: `src/pages/public/MyBookingsPage.jsx` — before calling cancel on an `Approved` booking, show confirm dialog with warning text: "Cancelling an approved booking may be noted on your account. Continue?"
- No hard block — just friction + audit trail. FO/Admin can view `cancellationCount` on `AdminUserManagementPage.jsx` (add as a column, read-only).

### 7.3 Fix room-status branch in cancelBooking()
- File: `src/services/bookingsService.js`, `cancelBooking()` (~413-442)
- Current: always sets room status to `Available` regardless of booking's prior status.
- Fix: branch on booking's status BEFORE it's overwritten:
  - prior status `Checked In` → room status → `Dirty / Needs Cleaning`
  - prior status `Approved` → room status → `Available`
  - prior status `Pending` → no room status change (room was never reserved)
- Apply same branch logic to any FO/Admin-triggered cancel-from-Checked-In path if one exists in `FoCheckInPage.jsx` or elsewhere.

### 7.4 Server-side balance enforcement on checkout
- File: `firestore.rules`, `bookings` update rule
- Add condition: booking update to `status == "Checked Out"` only allowed if `resource.data.payment.deposit >= resource.data.totalCost` (or equivalent field comparison matching your schema).
- This prevents bypassing the UI-only balance check in `FoCheckOutPage.jsx` via direct API/console write.
- Verify existing legit checkout flow still passes rule after full payment recorded.

**Verify:**
- Guest tries to create a 4th active booking (3 already Pending/Approved) → blocked with clear message.
- Cancel an Approved booking → confirm dialog appears, `cancellationCount` increments on user doc, room status correctly resets to Available.
- Manually cancel a Checked-In booking (as FO/Admin) → room status goes to Dirty / Needs Cleaning, not Available.
- Attempt checkout with `deposit < totalCost` via direct Firestore write (simulate in console or script) → rejected by rules.
- Attempt checkout with `deposit >= totalCost` → succeeds normally.

---

## PHASE 8 — FO-mediated cancellation flow + User Management table view

### 8.1 New booking status: Cancellation Requested
- File: `src/services/bookingsService.js`
- Add new status value `"Cancellation Requested"` to the booking status enum/type used across the app.
- New function `requestCancellation(bookingId, guestId, reason)`:
  - Only allowed if booking status is `Approved` (Pending can still self-cancel instantly, no FO review needed — low stakes, room never left Available).
  - Sets booking status → `Cancellation Requested`, stores `cancellationReason`, `cancellationRequestedAt`.
  - Does NOT change room status yet — room stays `Reserved` until FO decides.
  - Sends notification to all `fo` users (reuse existing `notificationService.js` pattern, new type `cancellation_requested`).

### 8.2 FO cancellation review actions
- New function `approveCancellation(bookingId)`:
  - Booking status `Cancellation Requested` → `Cancelled`.
  - Room status → `Available`.
  - Increment guest's `cancellationCount` (see 7.2 — apply limit check at `requestCancellation()` time instead, so guest hits the limit before making FO review it).
  - Notify guest: cancellation approved.
- New function `rejectCancellation(bookingId, rejectionReason)`:
  - Booking status `Cancellation Requested` → back to `Approved`.
  - Room status unchanged (stays `Reserved`).
  - Notify guest: cancellation rejected, with reason, booking stands.

### 8.3 Guest-side UI changes
- File: `src/pages/public/MyBookingsPage.jsx`
- Cancel button on an `Approved` booking now calls `requestCancellation()` instead of `cancelBooking()`. Add reason textarea in the confirm dialog (required field).
- Cancel button on a `Pending` booking still calls existing `cancelBooking()` directly — instant, no FO review, no limit applied.
- Booking card shows `Cancellation Requested` status distinctly (badge/color) while awaiting FO decision.

### 8.4 New FO page: Cancellation Requests
- New file: `src/pages/fo/FoCancellationsPage.jsx`
- New route: `/fo/cancellations` (role: `fo`, add to `FO_LINKS` in `src/components/layout/Sidebar.jsx`)
- List all bookings with status `Cancellation Requested`, show guest name, room, dates, reason, requested date.
- Approve / Reject buttons per row, calling `approveCancellation()` / `rejectCancellation()`.
- Mirror layout/pattern of existing `FoBookingsPage.jsx` (approve/reject bookings) for consistency.

### 8.5 Firestore rules update
- File: `firestore.rules`, `bookings` section
- Guest can update own booking to `Cancellation Requested` only from `Approved` status.
- Guest can update own booking to `Cancelled` only from `Pending` status (unchanged instant-cancel path).
- Only FO/Admin can transition `Cancellation Requested` → `Cancelled` or back to `Approved`.

### 8.6 Convert Admin User Management to table view
- File: `src/pages/admin/AdminUserManagementPage.jsx`
- Replace card grid with a table: columns — Name, Email, Role, Cancellation Count (from 7.2), Created Date, Actions (Change Role, Delete).
- Add filter tabs/dropdown above table: **All Users | Front Office | Admin | Training Session Users**.
  - "Training Session Users" tab calls `listUsers({ trainingMode: true })` (per Phase 2.3 — confirm this param exists, wire if not).
  - Other filters just filter the existing prod `users` list client-side by `role` field.
- Keep existing actions working: change role (dropdown/modal), delete user (confirm dialog).
- Use existing table component pattern already in app (check `FoPaymentsPage.jsx` or `FoBookingsPage.jsx` for the shadcn/ui table primitives already in use — reuse, don't reinvent).

**Verify:**
- Guest requests cancellation on an Approved booking → status becomes `Cancellation Requested`, room stays Reserved, FO gets notified.
- FO approves cancellation request → booking Cancelled, room Available, guest notified.
- FO rejects cancellation request → booking back to Approved, room still Reserved, guest notified with reason.
- Guest cancels a Pending booking → still instant, no FO step, unchanged behavior.
- Guest who hit cancellationCount limit tries to request cancellation → blocked with limit message before it reaches FO.
- Admin User Management page: table renders all users, each filter tab shows correct subset, role change + delete still work, Training Session Users tab shows anonymous training accounts.

---

## PHASE 9 — Notification system fixes (found via notification audit)

### 9.1 Fix broken notification links
- File: `src/services/bookingsService.js`, line ~414 — guest-facing booking notifications link to `/bookings` (404s). Change to `/my-bookings`.
- File: `src/services/announcementsService.js`, line ~114 — guest notification links to `/announcements` (no such route exists). Change to `/` (landing page, where announcements are likely displayed) — confirm actual display location first, adjust link accordingly.
- Grep entire codebase for any other hardcoded notification `link` field values, cross-check each against actual routes in `src/App.jsx`. Fix any other mismatches found.

### 9.2 Tighten notifications create rule
- File: `firestore.rules`, `notifications/{userId}/items` create rule (~line 179)
- Current: `allow create: if isAuthenticated();` — no restriction on target userId or payload shape.
- Fix: keep `create` open to authenticated users (required for guest→FO alerts), but add payload validation:
  - `request.resource.data.type` must be in allowed list (e.g. `["booking_request","booking_approved","booking_rejected","booking_cancelled","room_dirty","announcement","support_message","cancellation_requested","cancellation_approved","cancellation_rejected"]`)
  - `request.resource.data.isRead` must be `false` on create (can't create a pre-read fake notification)
  - Required string fields present: `title`, `message`, `link`, `createdAt`
- Do not restrict which `userId` path can be written to — that's the legitimate guest-to-FO notification pattern. Only lock down the shape/type of what's written.

### 9.3 Clean up training notifications on reset
- File: `src/services/trainingService.js`, `resetTrainingData()` (~line 129)
- Current: deletes training bookings/rooms/users, does NOT delete notifications written to those training users' `notifications/{uid}/items` subcollections.
- Fix: before deleting training user docs, also delete their `notifications/{uid}/items` subcollection (loop training user IDs, batch-delete their notification items).

**Verify:**
- Click a booking-status notification as guest → lands on `/my-bookings`, not 404.
- Click an announcement notification as guest → lands on correct working page.
- Attempt to write a notification via console/direct API with invalid `type` value → rejected by rules.
- Attempt to write a notification with `isRead: true` on create → rejected by rules.
- Run `resetTrainingData()` → confirm training users' notification subcollections are also cleared, not just bookings/rooms/users.

---

## PHASE 10 — Payment-first booking: data model & core logic

### 10.1 Extend booking schema for payment proof
- File: `src/services/bookingsService.js`
- Add fields to booking doc on creation: `paymentProofUrl` (string, null until uploaded), `paymentType` ("Full" | "Partial"), `paymentDeadline` (timestamp, createdAt + 24-48hrs, pick your window), `proofUploadedAt` (timestamp, null until uploaded), `proofVerifiedAt` (timestamp, null until FO verifies).
- Booking status flow update: new status `"Awaiting Payment"` inserted before `"Pending"`. Guest creates booking → `Awaiting Payment` → guest uploads proof → `Pending` (existing FO review step, now proof-gated) → `Approved`/`Rejected` (unchanged).

### 10.2 Payment proof upload
- New function `uploadPaymentProof(bookingId, file, paymentType)` in `bookingsService.js` (or new `paymentProofService.js` if cleaner separation).
- Use existing `cloudinaryService.js` pattern (already used for room photos) — upload proof image, store returned URL in `paymentProofUrl`.
- On successful upload: booking status `Awaiting Payment` → `Pending`, set `proofUploadedAt`, set `paymentType`.
- Validate: only booking owner (`guestId == currentUser.uid`) can upload, only allowed while status is `Awaiting Payment`.

### 10.3 FO verification gate on approveBooking()
- File: `src/services/bookingsService.js`, `approveBooking()`
- Add check: booking must have `paymentProofUrl` set (non-null) before approval is allowed. Throw error otherwise: "Cannot approve — no payment proof submitted."
- On approve: set `proofVerifiedAt`. Room status logic unchanged (still → `Reserved`).

### 10.4 Payment deadline lazy-expiry check
- New function `checkAndExpireStaleBookings()` in `bookingsService.js`.
- Logic: query bookings where `status == "Awaiting Payment"` AND `paymentDeadline < now`. For each: set status → `Cancelled`, `rejectionReason: "Payment deadline expired"`, notify guest (in-app notification, existing pattern).
- Call this function on: guest login/dashboard load, FO bookings page load, room listing page load (wherever "is this room actually available" matters). Lazy-expiry pattern — no Cloud Function/cron needed, runs opportunistically on page visits.
- Add note in code comment: this is a workaround for Spark plan's lack of scheduled functions; real deployment would use a Cloud Scheduler + Function instead.

### 10.5 Firestore rules update
- File: `firestore.rules`, `bookings` section
- Guest can update own booking's `paymentProofUrl`/`paymentType`/`proofUploadedAt` fields only while status == `Awaiting Payment`.
- Guest cannot set status directly to `Pending` — only the service-layer function transitions it (rule should still just check status is one of the guest-allowed transitions, matching existing pattern).

**Verify:**
- Create booking → status `Awaiting Payment`, room NOT yet shown as Reserved (still bookable-blocking via conflict check, but visually distinct in FO view as unpaid).
- Upload proof → status flips to `Pending`, FO sees it in queue with proof image visible/clickable.
- FO tries to approve booking with no proof (simulate by skipping upload) → blocked with error.
- Let `paymentDeadline` pass without proof upload → next page load (guest dashboard or FO bookings) triggers expiry, booking auto-cancels, room freed.

---

## PHASE 11 — Payment-first booking: UI

### 11.1 Guest — payment proof upload widget
- File: `src/pages/public/BookingPage.jsx` or `src/pages/public/MyBookingsPage.jsx` (whichever currently shows a booking right after creation — likely redirect to MyBookingsPage after submit)
- After booking created (status `Awaiting Payment`), show upload widget on that booking's card:
  - Payment type selector: Full / Partial (radio or toggle)
  - File input (image) — reuse existing Cloudinary upload UI pattern from room photos / housekeeping photos
  - Submit button calls `uploadPaymentProof(bookingId, file, paymentType)`
  - Show `paymentDeadline` countdown/timestamp so guest knows urgency ("Upload proof by [date/time] or booking will be cancelled")
- After successful upload: card updates to show status `Pending`, proof thumbnail, "Awaiting FO verification" message.
- If booking status is `Awaiting Payment` and deadline has passed on load, trigger `checkAndExpireStaleBookings()` (already wired per Phase 10 follow-up) so stale card refreshes to `Cancelled`.

### 11.2 FO — proof viewer in booking review
- File: `src/pages/fo/FoBookingsPage.jsx`
- For each booking in `Pending` status, show payment proof thumbnail (clickable to open full image — reuse existing image modal/lightbox pattern if one exists in app, else simple `<img>` in a Dialog).
- Show `paymentType` (Full/Partial) and `proofUploadedAt` timestamp next to guest/room info.
- Approve button already blocked server-side (Phase 10.3) if no proof — but also disable button client-side with tooltip "No payment proof submitted" as a UX nicety (defense-in-depth, not required since rule/service already blocks it).

### 11.3 Status badges — Awaiting Payment / Pending / Cancellation Requested
- File: wherever booking status badges are rendered (likely a shared `BookingStatusBadge` component or inline in `MyBookingsPage.jsx` / `FoBookingsPage.jsx` — check for existing badge component first, extend it rather than duplicating styles)
- Add distinct color/label for `Awaiting Payment` (e.g. amber/orange — "action needed") vs `Pending` (existing) vs `Cancellation Requested` (from Phase 8 — confirm this badge already exists, add if missing).

### 11.4 Payment tab / sidebar review
- File: `src/components/layout/Sidebar.jsx`, `src/pages/fo/FoPaymentsPage.jsx`
- Confirm `FoPaymentsPage.jsx` (the manual ledger) still makes sense post-change — it now only handles the REMAINING balance on arrival (for Partial payers) plus any future ad-hoc charges, not the initial payment anymore.
- Update page heading/copy if needed to reflect: "Record remaining balance and on-site charges" rather than implying it's the primary payment entry point.

### 11.5 Remove Role field from guest profile
- File: `src/pages/public/ProfilePage.jsx`
- Remove the Role display field entirely from guest-facing profile view. (FO/Admin can still see role via Admin User Management table — no change there.)

**Verify:**
- Guest creates booking → sees upload widget immediately, uploads proof → status flips to Pending, widget replaced with "awaiting verification" state.
- FO opens Pending booking → sees proof thumbnail, can click to view full size, sees payment type.
- FO tries to approve with proof missing (shouldn't be possible via normal flow, but test by manually clearing `paymentProofUrl` in console) → button disabled/error shown.
- Badges render correctly for all statuses including new `Awaiting Payment`.
- Guest profile page no longer shows Role field.
- FoPaymentsPage copy/context makes sense for remaining-balance-only use case.

---

## PHASE 12 — EmailJS booking confirmation integration

### 12.1 Install & configure
- Run: `npm install @emailjs/browser`
- Add to `.env` (and `.env.example` with placeholder values):
VITE_EMAILJS_SERVICE_ID=service_be8k5h7
VITE_EMAILJS_TEMPLATE_ID=template_stxdu0b
VITE_EMAILJS_PUBLIC_KEY=H4jwN09knsD8Ei4A2

### 12.2 Create email service wrapper
- New file: `src/services/emailService.js`
- Export `sendBookingConfirmation({ toEmail, toName, roomName, checkIn, checkOut, bookingId, paymentType })`:
  - Uses `emailjs.send()` from `@emailjs/browser`
  - Maps params to template variables: `to_email`, `to_name`, `room_name`, `check_in`, `check_out`, `booking_id`, `payment_type`
  - Reads service/template/public key from `import.meta.env.VITE_EMAILJS_*`
  - Wrap in try/catch — email failure must NOT block the booking approval flow. Log error, don't throw.

### 12.3 Wire into approveBooking()
- File: `src/services/bookingsService.js`, `approveBooking()`
- After successful room/booking status update (approval confirmed), call `sendBookingConfirmation()` with the guest's email (from `users/{guestId}` doc) and booking details.
- Fire-and-forget pattern: don't `await` blocking the approval response to guest UI — call it, let it resolve in background, catch errors silently (log only).

### 12.4 Format dates before sending
- `checkIn`/`checkOut` likely stored as Firestore Timestamps — convert to readable string (e.g. "July 20, 2026") before passing to `sendBookingConfirmation()`. Check existing date-formatting utility in codebase (likely already used in `MyBookingsPage.jsx` or `FoBookingsPage.jsx` — reuse, don't duplicate).

**Verify:**
- Approve a Pending booking as FO → guest receives actual email within a minute, correct room/dates/booking ID/payment type shown.
- Approve a booking where guest email is somehow missing/invalid → approval still succeeds, error logged to console, no crash.
- Check EmailJS dashboard "Email History" tab → confirms send logged, check remaining free-tier quota (200/month).


## PHASE 13 — Guest payment-proof upload flow (UX fix)

### 13.1 Immediate proof upload after booking submission
- File: `src/pages/public/BookingPage.jsx`
- After `createBooking()` succeeds, do NOT just redirect/toast. Show the payment proof upload widget (same component/logic from Phase 11.1) immediately, either:
  - In a Dialog/modal on the same page, or
  - Redirect to `/my-bookings` with that specific booking auto-expanded/scrolled-into-view and visually highlighted (e.g. brief pulse/border animation)
- Pick whichever is less duplicate code — if the upload widget from 11.1 is already a reusable component, embedding it in a post-submit Dialog on BookingPage.jsx is cleanest (no navigation, no risk of guest closing tab before seeing it).

### 13.2 Self-notification on booking creation
- File: `src/services/bookingsService.js`, `createBooking()`
- After successful creation, also create a notification for the guest themselves (not just the FO-facing `booking_request` notification that already exists):
  - type: `payment_proof_required`
  - message: "Upload payment proof to complete your booking for [room name]"
  - link: `/my-bookings`
- Reuse existing `notificationService.js` `createNotification()` pattern.

**Verify:**
- Submit a booking as guest → immediately prompted to upload proof, no separate navigation required to discover this step.
- Check guest's notification bell → confirm `payment_proof_required` notification appears, clicking it lands on `/my-bookings`.
- Close tab/leave without uploading, come back later → booking still shows `Awaiting Payment` with clear upload prompt, deadline countdown visible.

---

## PHASE 14 — Payment instructions display

### 14.1 Add hotel payment details (static config)
- New file or constant: `src/lib/paymentDetails.js` (or add to existing constants/config file)
- Export static values: `HOTEL_GCASH_NUMBER`, `HOTEL_GCASH_QR_IMAGE_URL` (upload a QR image to Cloudinary manually, paste URL here), optionally `HOTEL_BANK_NAME`, `HOTEL_BANK_ACCOUNT_NUMBER`, `HOTEL_BANK_ACCOUNT_NAME`.
- These are placeholder/demo values — clearly comment as such: `// Demo values for capstone presentation — not a real merchant account`.

### 14.2 Display payment instructions before upload widget
- File: wherever the Phase 11.1 / 13.1 upload widget lives (BookingPage.jsx modal or MyBookingsPage.jsx)
- Above the file upload input, show:
  - "Please send ₱[amount] via GCash to [HOTEL_GCASH_NUMBER]" (show QR code image too)
  - `[amount]` = full `totalCost` if `paymentType == "Full"`, or a defined deposit percentage/fixed amount if `"Partial"` (confirm what partial amount logic currently is — check if `MIN_PARTIAL_PAYMENT` or similar constant already exists from Phase 10, define one if not, e.g. 50% of total)
  - "After sending, upload your payment screenshot below as proof."

### 14.3 Show partial payment amount clearly
- If `paymentType == "Partial"` is selected, dynamically display the required partial amount (not just "partial" as a vague label) so guest knows the exact figure to send.

**Verify:**
- Guest selects Full payment → sees full total amount + GCash number/QR clearly before upload field.
- Guest selects Partial payment → sees calculated partial amount (not just "some amount"), same GCash details.
- QR code image loads correctly, GCash number is readable/copyable.


## PHASE 15 — Link payment proof to payments collection + check-in/checkout/payments-tab sync

### 15.1 Record actual payment on proof verification
- File: `src/services/bookingsService.js`, `approveBooking()` (this is where proof gets verified, per Phase 10.3)
- On approval (proof already confirmed present): call `recordPayment()` from `paymentsService.js` to create a real payment record:
  - `bookingId`, `amount` (full totalCost if paymentType=="Full", or the calculated partial amount from Phase 14 if "Partial"), `method: "GCash"` (or generic "Online Proof" if you want to distinguish from FO-recorded methods), `note: "Initial payment via proof upload"`, `processedBy: "system"` or the approving FO's uid.
  - This must update `booking.payment.deposit` the same way `recordPayment()` already does for manual FO-recorded payments (check `paymentsService.js` — confirm it increments `deposit` field consistently).
- Do this INSIDE the same approval flow so it's atomic with the status change to "Approved" — avoid a separate un-linked write.

### 15.2 Check-in page shows payment status
- File: `src/pages/fo/FoCheckInPage.jsx`
- Display: `paymentType` (Full/Partial), amount paid so far (`booking.payment.deposit`), remaining balance (`totalCost - deposit`), and a clickable proof thumbnail (reuse Phase 11.2 pattern from FoBookingsPage.jsx).
- No blocking logic needed here — check-in already only fires post-approval, and approval already gates on proof. This is informational display for FO staff, not a new gate.

### 15.3 Fix checkout balance calculation
- File: `src/pages/fo/FoCheckOutPage.jsx`, lines ~164-168, ~267-272
- Once 15.1 correctly populates `booking.payment.deposit` on approval, the existing balance calc (`totalCost - payment.deposit`) should self-correct — verify this after 15.1 lands before writing any new checkout-specific code.
- If balance calc pulls from `payments` collection query instead of the `deposit` field directly (per audit line ~125-133, ~627-630), confirm that query correctly picks up the new proof-verified payment record from 15.1 too — no separate fix needed if 15.1's `recordPayment()` call writes to the same collection checkout already queries.

### 15.4 Payment source tracking for audit trail
- File: `src/services/paymentsService.js`, `recordPayment()` — confirm/add a `source` field on payment records: `"guest_proof"` (set when called from 15.1's approval-triggered record) vs `"fo_manual"` (default for existing FO-entered payments via FoPaymentsPage.jsx).
- File: `src/pages/fo/FoPaymentsPage.jsx`, payment history display (~lines 510-545) — show a small badge/label per line item indicating source: "Guest Upload" vs "Front Desk".
- This gives FO/Admin a clear audit trail distinguishing self-service proof payments from staff-recorded ones.

**Verify:**
- Approve a booking with Partial proof → check `payments` collection: new record exists with correct amount and `source: "guest_proof"`, `booking.payment.deposit` updated.
- Open that booking in Check-In page → payment type, amount paid, remaining balance, proof thumbnail all visible.
- Open same booking in Check-Out page → balance shown correctly reflects remaining amount only (not full total), payment history shows BOTH the initial partial payment and any final payment recorded at checkout.
- Approve a Full-payment booking → checkout balance shows ₱0 due, no remaining payment needed.
- Folio summary on FoPaymentsPage.jsx correctly shows proof-verified partial payment as "Paid," not ₱0.
- Attempt to manually record a new FO payment for a booking that already has a proof-verified partial payment covering it in full → form correctly blocks (balance shows ≤0).
- Payment history shows "Guest Upload" badge on the proof-verified entry, "Front Desk" on any FO-entered ones.

## PHASE 16 — Check-in filtering, payment method options, QR removal

### 16.1 Filter Check-In page to arrival-relevant bookings
- File: `src/pages/fo/FoCheckInPage.jsx`
- Current: shows all bookings with `status == "Approved"` regardless of date.
- Fix: filter to bookings where `checkInDate` is today or within a defined upcoming window (e.g. next 24-48hrs) — adjustable constant `CHECK_IN_WINDOW_HOURS`.
- Add a toggle or secondary tab "Show all approved" for FO to see the full approved list if needed (edge case: early arrivals), but default view should be arrival-relevant only.
- This is what differentiates it from FoBookingsPage.jsx (approval queue, all pending/approved regardless of date) — document this distinction in a comment at top of both files for clarity.

### 16.2 Multiple payment method options in proof upload
- File: wherever the upload widget lives (BookingPage.jsx Dialog / MyBookingsPage.jsx, per Phase 11/13)
- Replace single implied "GCash only" flow with a method selector: GCash, Bank Transfer, Credit/Debit Card, Over-the-Counter.
- Each method shows its own static payment details block (reuse `src/lib/paymentDetails.js`, expand it with entries per method — bank account details, generic "pay at counter, upload receipt" instructions for OTC, etc.)
- `paymentMethod` field gets stored alongside `paymentType` on the booking doc, passed through to `recordPayment()` in Phase 15.1's approval flow so the actual method shows correctly in FoPaymentsPage/FoCheckOutPage history (currently hardcoded to "GCash" — fix to use the guest-selected method instead).

### 16.3 Remove QR code, show payment number only
- File: `src/lib/paymentDetails.js` — remove `HOTEL_GCASH_QR_IMAGE_URL` constant (or leave unused, but stop referencing it in UI).
- File: upload widget component — remove QR `<img>` display, show only the payment number/account details as plain text (per method selected in 16.2).

**Verify:**
- FoCheckInPage.jsx shows only bookings arriving today/soon by default, full list accessible via toggle/tab.
- Guest can select from 4 payment methods in upload widget, each shows correct static details (no QR image anywhere).
- Selected payment method carries through to the actual payment record created on approval — FoPaymentsPage/FoCheckOutPage show the correct method (not hardcoded "GCash") in history.

## PHASE 17 — UI refinement + conditional payment proof requirement

### 17.1 Room Overview page redesign
- File: `src/pages/public/RoomDetailPage.jsx`
- Redesign layout using existing shadcn/ui components, skills that are installed in this project use it for ideas (Card, Separator, Badge, etc. — check `src/components/ui/` for what's already available, don't introduce new libraries).
- Improve visual hierarchy: better spacing, section dividers, card-based grouping for description/amenities/facilities/policies instead of flat stacked text blocks.
- Facility pills: change background from current gray to a softer gray (e.g. `bg-muted/50` or `bg-secondary` instead of a harsh `bg-gray-200`-equivalent) — match existing soft-grey design token already used elsewhere in the app (check `tailwind.config` or existing components like room cards for the established soft-grey value, reuse it, don't invent a new shade).

### 17.2 Phone number field — country code split
- File: `src/pages/public/BookingPage.jsx`, Step 1 Customer Information section
- Split single phone input into two: country code selector (default `+63`, dropdown or fixed prefix if only supporting PH for now) + phone number field.
- Placeholder on phone field: e.g. "912 345 6789" (realistic PH mobile format hint).
- Store as combined string or two fields in `leadGuestPhone` — decide based on what's simpler for `createBooking()` payload (recommend: store combined `+63XXXXXXXXXX` string, split only in UI).

### 17.3 Conditional payment proof requirement by method
- File: `src/services/bookingsService.js`, `approveBooking()` (Phase 10.3's gate)
- Current: blocks approval unconditionally if `paymentProofUrl` is null.
- Fix: only require `paymentProofUrl` when `paymentMethod` is `"GCash"` or `"Bank Transfer"`. If `paymentMethod` is `"Over-the-Counter"` or `"Credit/Debit Card"`, allow approval without proof.
- File: `src/pages/public/BookingPage.jsx`, Step 3 — conditionally show/hide the upload widget based on `paymentMethod`. If OTC/Card selected, Step 3 shows a different message instead: "Pay the amount due at the front desk upon arrival. Your booking is pending FO review." No file input shown.
- File: `src/pages/fo/FoBookingsPage.jsx` — proof thumbnail display (Phase 11.2) should conditionally render: show proof if present, show "Pay at arrival (OTC/Card)" label if method doesn't require proof, instead of "No payment proof submitted" (which would now be a false-negative-looking message for legitimately proof-exempt bookings).

### 17.4 Fix "Go to My Bookings" button styling
- File: `src/pages/public/BookingPage.jsx`, Step 3 summary column
- Change button variant from current `outline` to match the app's primary yellow button style (check what variant/class other primary CTAs use, e.g. the "Book Now" button on the same page — reuse that exact styling).

### 17.5 Default cancellation policy (Admin Room Management)
- File: `src/pages/admin/AdminRoomManagementPage.jsx`, P0.2's policies field
- Add a default placeholder/pre-filled value for the cancellation policy field when creating a NEW room (admin can still edit/override).
- Draft default text must accurately reflect actual system behavior (per Phase 8 FO-mediated cancellation flow): e.g. "Bookings may be cancelled while Pending at no cost. Once Approved, cancellation requests must be reviewed and approved by Front Office staff. Guests who repeatedly cancel approved bookings may be restricted from future cancellations (see cancellation limit). Cancellations are not guaranteed after check-in."
- Confirm wording matches actual limits (Phase 7's `MAX_CANCELLATIONS` value, Phase 8's FO-approval flow) — don't let the policy text drift from real enforced behavior.

**Verify:**
- Room Overview page visually matches app's design language, facility pills use softer gray tone.
- Phone field shows country code + number split, realistic placeholder.
- Select GCash or Bank Transfer → Step 3 shows upload widget as before.
- Select OTC or Credit/Debit Card → Step 3 shows "pay at arrival" message instead, no upload required, booking still reaches Pending correctly.
- FO can approve an OTC/Card booking without proof — confirm `approveBooking()` no longer blocks it.
- FoBookingsPage shows correct label per method (proof thumbnail vs "pay at arrival" text).
- "Go to My Bookings" button matches primary yellow style.
- New room creation in Admin shows pre-filled cancellation policy text, editable, accurate to actual system rules.

---

## PHASE 18 — Fix conditional payment messaging + stuck status bug + UI cleanup

### 18.1 Fix "pay at front desk" message condition
- File: `src/pages/public/BookingPage.jsx`, Step 3
- Bug: message currently conditioned on wrong variable (likely `paymentType` instead of `paymentMethod`).
- Fix: message "Pay the amount due at the front desk upon arrival..." should show ONLY when `paymentMethod` is `"Over-the-Counter"` or `"Credit/Debit Card"` — regardless of `paymentType` (Full/Partial). GCash/Bank Transfer with Full payment should show the upload widget, not this message.

### 18.2 Fix stuck "Awaiting Payment" status for proof-exempt methods
- File: `src/services/bookingsService.js`, `createBooking()`
- Bug: bookings created with `paymentMethod` = OTC or Credit/Debit Card never transition out of `Awaiting Payment`, because that transition currently only fires inside `uploadPaymentProof()` (Phase 10.2), which these methods never call.
- Fix: in `createBooking()`, if `paymentMethod` is `"Over-the-Counter"` or `"Credit/Debit Card"`, set initial status directly to `"Pending"` instead of `"Awaiting Payment"` — these bookings skip the proof step entirely and go straight to FO review, per Phase 17.3's intent.
- GCash/Bank Transfer bookings keep current behavior: start at `"Awaiting Payment"`, transition to `"Pending"` only after proof upload.

### 18.3 My Bookings page — payment-aware status display
- File: `src/pages/public/MyBookingsPage.jsx`
- Confirm booking status badges correctly reflect the fixed logic from 18.2 — a Full-paid OTC/Card booking should show "Pending," never "Waiting for Payment."
- Add payment info display on each booking card/detail view: show `paymentType` (Full/Partial) and `paymentMethod`, plus any payment records (reuse pattern from FoPaymentsPage.jsx's payment history display, scoped to guest's own booking).
- Confirm "Waiting for Payment" badge only shows for bookings still in `Awaiting Payment` status (i.e. GCash/Bank Transfer bookings that haven't uploaded proof yet) — never for OTC/Card or post-upload bookings.

### 18.4 Remove duplicate "Go to My Bookings" button
- File: `src/pages/public/BookingPage.jsx`, Step 3
- Restore the original informational note below the Payment Information/instructions section (text pointing guest to My Bookings for payment details) — remove the button that Phase 17 mistakenly added there.
- Keep ONLY the "Go to My Bookings" button in the Booking Summary (right column) — already styled yellow/primary per Phase 17.4, no further change needed there.

### 18.5 Cancellation Policy link color
- File: `src/pages/public/RoomDetailPage.jsx`
- Change "View Full Policy" link/button color to red (destructive/warning tone — use existing `text-destructive` or equivalent token already in the design system) for clarity/visibility.

**Verify:**
- Select Full + GCash → upload widget shows, no "pay at front desk" message.
- Select Full + OTC → "pay at front desk" message shows, no upload widget.
- Select Partial + Credit/Debit Card → "pay at front desk" message shows correctly (not gated by Full/Partial).
- Book with OTC/Card → booking immediately shows "Pending" in My Bookings and appears in FO Bookings queue right away, not stuck at "Waiting for Payment."
- Book with GCash, don't upload proof yet → correctly shows "Waiting for Payment" until proof uploaded.
- My Bookings shows payment type/method/records clearly per booking.
- Step 3 shows only ONE "Go to My Bookings" button (Summary column), informational note restored below Payment Information section.
- "View Full Policy" link is red on Room Overview page.

-----

## PHASE 19 — Critical audit fixes (payment integrity + availability logic)

### 19.1 Stop phantom payment recording for OTC/Card
- File: `src/services/bookingsService.js`, `approveBooking()`
- Current bug: auto-calls `recordPayment()` for Full/Partial amount on approval regardless of method, even when no money actually moved (OTC/Card).
- Fix: only auto-call `recordPayment()` on approval if `paymentMethod` is in `PROOF_REQUIRED_METHODS` (GCash/Bank Transfer) AND `paymentProofUrl` exists. For OTC/Card, do NOT record payment on approval — `deposit` stays 0 until FO manually records it via FoPaymentsPage/FoCheckOutPage when guest actually pays at the desk.
- This directly fixes landmine #1 (checkout showing "fully paid" with no money collected).

### 19.2 Include Awaiting Payment in conflict/availability queries + re-check on approve
- File: `src/services/bookingsService.js`, wherever conflict-check queries filter by status (`createBooking()`'s conflict check, `getAvailableRooms()`)
- Current bug: `Awaiting Payment` bookings are excluded from the conflict set, so two guests can both hold "Awaiting Payment" on the same room/dates, both upload proof, and FO can approve both.
- Fix: add `"Awaiting Payment"` to the status list used in conflict/overlap queries (alongside existing `Pending`/`Approved`/`Checked In`).
- Also add a conflict re-check before `approveBooking()` — verify no OTHER booking for the same room/dates already has status `Approved` or later. If conflict found, block approval with a clear error.
- This fixes landmine #2 (double-approval race).

### 19.3 Decouple date availability from current room housekeeping status
- File: `src/services/bookingsService.js` / `roomsService.js`, `getAvailableRooms()` and `isRoomBookable()`
- Current bug: `isRoomBookable()` requires room status == "Available" right now, but `getAvailableRooms()` filters only by date conflicts — mismatch means a room correctly shown as available for a FUTURE date range still fails at submit if its CURRENT status is Occupied/Reserved/Dirty.
- Fix: `isRoomBookable()` used at submit-time should check `isActive` (not archived) — NOT current operational status. Availability for specific dates is entirely determined by the conflict-check (19.2), not today's housekeeping state. A room being cleaned today can still be booked for next month.
- This fixes landmine #3.

### 19.4 Fix notification rules whitelist + proof-exempt notification spam + widen active-booking cap
- File: `firestore.rules`, notifications create rule
- Add `"payment_proof_required"` to the allowed `type` whitelist (per Phase 9.2's validation list) — currently missing, causing silent permission-denied errors on every booking creation.
- File: `src/services/bookingsService.js`, `createBooking()` — only fire the `payment_proof_required` notification if `paymentMethod` is in `PROOF_REQUIRED_METHODS`. Don't send it for OTC/Card (they don't need to upload anything).
- File: `src/services/bookingsService.js`, `createBooking()` — widen Phase 7.1's `MAX_ACTIVE_BOOKINGS_PER_GUEST` query to also count `"Awaiting Payment"` status (not just `Pending`/`Approved`). Guests cannot self-cancel out of Awaiting Payment (48hr deadline throttles holds instead), so the cap must include it or a guest could hold unlimited rooms.

### 19.5 Guest payment folio read access + cleanup + training listRooms fix
- File: `firestore.rules`, `payments` collection — allow guest read-only access to payment docs linked to their own bookings (Phase 18.3 Payment Folio intent). FO/Admin write unchanged.
- File: `src/services/bookingsService.js`, `src/pages/public/BookingPage.jsx`, `src/services/paymentsService.js` — remove all `[DEBUG …]` and troubleshooting `console.log` statements.
- File: `src/pages/fo/FoCheckInPage.jsx` — pass `trainingMode` into its `listRooms()` call so training FO sessions don't see production room data.
- File: `src/lib/paymentDetails.js` — fix OTC/Card instructions (no longer say "upload receipt").
- File: `src/services/chatbotService.js` — update payment method list to match current 4-method booking flow.
- File: `.env.example` — remove unused `VITE_CLOUDINARY_API_SECRET` (unsigned upload only).

### Explicitly out of scope for Phase 19
- **Cancel on Awaiting Payment (#5):** Intentionally NOT added. No self-cancel + 48hr deadline throttles spam book/cancel cycling. Revert any prior cancel-on-Awaiting-Payment rules/UI if present.
- **Training bleed on testimonials/messages/announcements (#12):** Accepted capstone scope — document as known limitation only.
- **Non-realtime FO pages (#8), Check-In "Paid" badge (#13):** Deprioritized — fix only if time remains after critical items.
- **TOCTOU conflict check (#14):** Verified — `createBooking()` still runs overlap `getDocs` outside `runTransaction()` (partial Phase 6.1 regression). Mitigated by approve-time re-check (19.2). Full in-transaction fix deferred unless time permits.

**Verify (test each landmine directly):**
- Book OTC + Full → FO approves → check-out shows correct ₱0 paid, full balance still due, FO must manually record payment before checkout balance clears.
- Two tabs, same room/dates, both GCash Awaiting Payment, both upload proof → FO can only approve ONE, second attempt blocked with conflict error.
- Room currently Occupied → book it for a date range 2 months out → submission succeeds (no false "not bookable" error).
- Open DevTools during any booking → zero `[DEBUG]` spam, zero permission-denied console errors on notification creation.
- Guest with 3 Awaiting Payment bookings → 4th booking blocked by active-booking cap.
- Guest expands Payment Folio on My Bookings → payment records load (no permission denied).
- Log into training FO account → Check-In page room list shows training rooms only, not production rooms.