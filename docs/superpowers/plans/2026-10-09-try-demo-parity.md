# Try Demo Parity Checklist

One-page companion to `2026-10-09-try-demo.md`. Update it whenever the product changes.

## Tiers (hybrid — real UI feel, fixtures-only safety)

- Tier A live browse: Try Demo → `/demo` picker → Guest → "Browse live rooms" → real `/rooms?demo=1` + `DemoPreviewStrip` (read-only, login gates unchanged, strip links back to `/demo/guest`).
- Tier B guest flows (scripted): `DemoRoomCard` (prod card skeleton, View → real detail `?demo=1`) → book (Pending + toast) → `DemoBookingCard` (cancel Pending/Awaiting Payment) → review pre-seeded stay → housekeeping active + history via shared `src/lib/housekeeping-requests.js`.
- Tier C staff view-only (scripted): FO dashboard `RoomScheduleTape` on fixtures (select → Bookings tab) → approve/check-in/check-out (Task 2 actions) → record payment → `HousekeepingList` full cycle (Start Clean → Submit Review → Approve, uploads disabled). Admin rooms on real `RoomsGridView`/`RoomsTableView` (edit toggles availability, archive/restore toasted); users role switch; analytics aggregates.

## Reused vs forked

- Reused directly: `RoomsGridView`, `RoomsTableView`, `RoomStatusBadge`, `BookingDetails`, `HousekeepingList` (+ additive `disableUploads`), `RoomScheduleTape` (+ additive `bookings`/`onSelectBooking`), `ui/*`.
- Forked in `src/demo/`: `DemoRoomCard`, `DemoBookingCard` (prod skeletons, same classes). Shared pure: `src/lib/housekeeping-requests.js` (also used by prod `GuestHousekeepingCard`). Disabled actions → `demoToast()` ("Demo — nothing was saved.").

## Journeys per role (scripted)

- Guest (`src/demo/guest/DemoGuestPage.jsx`): browse rooms → book (Pending + toast) → review pre-seeded completed stay → housekeeping on pre-seeded checked-in stay.
- FO (`src/demo/fo/DemoFoPage.jsx`): dashboard counts + schedule → approve Pending → check in → record payment (balance guard, prefilled) → advance cleaning (simulated ~3s notification).
- Admin (`src/demo/admin/DemoAdminPage.jsx`): rooms table (rate/status in-memory), users role switch (in-memory), analytics view-only aggregates.

## View-only (no actions)

Messages, announcements, testimonials, audit logs, health, performance, availability, alerts, user management detail — intentionally unlinked from demo.

## Known gaps (carried)

- Dead `TRAINING_A_COL` const + stale sandbox comments (availabilityService, favoritesService, reviewsService, userService).
- FO demo payment amount not prefilled to balance; fixture id is demo-bk-approved (doc name demo-fo-partial outdated).
- FO demo housekeeping lookup is per-room not per-request (masks repeat requests).
- Guest demo book action hardcodes nights=2, ignores date/pax params.
- Fixture `demo-102` room status (Dirty) disagrees with its completed log cycle (Available) — pre-existing; list actions on it no-op gracefully.

## Rules for product changes

1. New service contract (new field, status, or flow) → update `src/demo/fixtures.js` + `src/test/demo-fixtures.test.js` in the same PR.
2. New notification type → decide toast policy in `src/demo/DemoContext.jsx` inbox; demo links must stay under `/demo/`.
3. Never import `firebase/*`, `@/firebase/*`, or `@/services/*` from `src/demo/**` — eslint fails the build. Same ban applies to `DemoPreviewStrip.jsx` and `housekeeping-requests.js` (pinned by `demo-isolation.test.js`).
4. Chatbot stays out of demo (no widget, no service import).
5. GA skips `/demo*` (`src/App.jsx` tracker) — verify in realtime after shipping.
6. New optional props on reused components must default to prod behavior; prod call sites untouched (pinned by tape parity test).
