# Try Demo Parity Checklist

One-page companion to `2026-10-09-try-demo.md`. Update it whenever the product changes.

## Tiers (hybrid — real UI feel, fixtures-only safety)

- Tier A live browse: retired in Phase 5. The guest demo used to send visitors to the real `/rooms?demo=1`; that was the "no rooms found" path (it reads Firestore) and the demo is now fixtures-only end to end. `DemoPreviewStrip` and the prod `?demo=1` handling stay in the codebase, unreachable from the demo tree.
- Tier B guest flows (scripted): `DemoRoomCard` (prod card skeleton, CTA → demo detail) → room detail with nights + simulated total → book (Pending + toast) → `DemoBookingCard` (cancel Pending/Awaiting Payment) → simulated payment → review pre-seeded stay → housekeeping active + history via shared `src/lib/housekeeping-requests.js`.
- Tier C staff view-only (scripted): FO dashboard `RoomScheduleTape` on fixtures (select → Bookings tab) → approve/check-in/check-out (Task 2 actions) → record payment → `HousekeepingList` full cycle (Start Clean → Submit Review → Approve, uploads disabled). Admin rooms on real `RoomsGridView`/`RoomsTableView` (edit toggles availability, archive/restore toasted); users role switch; analytics aggregates.

## Reused vs forked

- Reused directly: `RoomsGridView`, `RoomsTableView`, `RoomStatusBadge`, `BookingDetails`, `HousekeepingList` (+ additive `disableUploads`), `RoomScheduleTape` (+ additive `bookings`/`onSelectBooking`), `ui/*`.
- Forked in `src/demo/`: `DemoRoomCard`, `DemoBookingCard` (prod skeletons, same classes). Shared pure: `src/lib/housekeeping-requests.js` (also used by prod `GuestHousekeepingCard`). Disabled actions → `demoToast()` ("Demo — nothing was saved.").

## Journeys per role (scripted)

- Guest (route per section, `src/demo/guest/*`): `/demo/guest` hero + bento room catalogue + "your stay so far" → `/demo/guest/rooms/:roomId` gallery, amenities, nights stepper, simulated total, book → `/demo/guest/bookings` simulated payment (prefilled to balance, over-amount rejected) + cancel → `/demo/guest/stay` mid-stay housekeeping and review. The old tabbed `DemoGuestPage.jsx` is deleted.
- FO (route per section, `src/demo/fo/*`): `/demo/fo` dashboard counts + schedule → `/demo/fo/bookings` approve Pending → `/demo/fo/check-in` check in → `/demo/fo/check-out` (blocked while balance due) → `/demo/fo/payments` record (amount prefilled to balance, over-amount rejected) → `/demo/fo/housekeeping` advance cleaning (simulated ~3s notification). The old tabbed `DemoFoPage.jsx` is deleted.
- Admin (route per section, `src/demo/admin/*`): `/demo/admin` analytics aggregates → `/demo/admin/operations` bulk status (in-memory) → `/demo/admin/users` role switch (in-memory) → `/demo/admin/rooms` real grid/table with rate edits. The old tabbed `DemoAdminPage.jsx` is deleted.

## Demo chrome and routes (Phase 2)

- Demo sidebar (`src/demo/DemoSidebar.jsx`) is a fork of the production staff sidebar: same width, classes, group labels, link order, icons and badge styles, with paths rewritten into `/demo` and badges derived from fixtures.
- Route table (`src/demo/routes.js`) is derived from `@/lib/nav-links`, so a nav item without a route cannot exist; `src/test/demo-routes.test.js` pins that plus the `/demo`-only link prefix.
- `/demo/fo` and `/demo/admin` are sections like any other: `App.jsx` renders every entry of `STAFF_SECTIONS` through `sectionElement`, so the nav table is the only route source (the separate index-route list is gone).
- Guests get no sidebar, matching the real app: `DemoGuestLayout` renders a slim bar (section links + Exit demo) instead.
- The role-tab header that used to sit above every demo page is gone. Exit paths: staff sidebar `Exit demo`, guest bar `Exit demo`, both to `/`. Changing roles means exiting and picking again from the landing page.
- The picker navigates on the first click (`onPick` → `role.to`); it used to route to `/demo`, which re-mounted the same dialog and made every pick take two clicks.
- Mobile: demo has no Navbar hamburger, so the staff sidebar collapses to a horizontally scrollable link strip. Known ceiling; upgrade path is a drawer with its own toggle button.

## FO sections (Phase 3)

- L2 scripted pages: `DemoFoDashboard`, `DemoFoBookings`, `DemoFoCheckIn`, `DemoFoCheckOut`, `DemoFoPayments`, `DemoFoHousekeeping` — registered in `SECTION_PAGES` (`src/demo/routes.js`).
- L1 view-only tables via `DemoFixtureTable`: `/demo/fo/cancellations`, `/demo/fo/announcements`, `/demo/fo/messages` — registered in `SECTION_TABLES`, columns + `rows(data)` selector, zero inputs on the page.
- Shared pure selectors: `src/demo/fo/foDemoData.js` (`paidFor`, `balanceOf`, `dirtyRooms`, `byCheckIn`); dirty statuses live in `fixtures.js` and drive both the sidebar dot and the housekeeping filter.
- Fixtures gain `announcements`, `messages`, `testimonials`, `refunds`, and a `Cancelled` booking (shape-pinned in `demo-fixtures.test.js`).
- `src/test/demo-fo-sections.test.js` pins: actions flip in-memory state, the checkout balance guard, the payment prefill/guard, every L1 table renders rows with no inputs, and no section config exists for a path the nav table does not route.
- FO has no Testimonials section (production keeps it under admin nav) — it lives in the admin tree.

## Admin sections (Phase 4)

- L2 scripted pages: `DemoAdminAnalytics` (`/admin`), `DemoAdminOperations` (`/admin/operations`), `DemoAdminUsers` (`/admin/users`), `DemoAdminRooms` (`/admin/rooms`) — `SECTION_PAGES` in `src/demo/routes.js`.
- L1 view-only tables via `DemoFixtureTable`: `/admin/messages`, `/admin/testimonials`, `/admin/alerts`, `/admin/health`, `/admin/performance`, `/admin/availability`, `/admin/audit-logs`, `/admin/settings`. Messages reuse one shared config for both nav items.
- Shared pure selectors: `src/demo/admin/adminDemoData.js` (`collected`, `outstanding`, `occupancy`, `openAlerts`, `pendingTestimonials`, `revenueByRoomType`) — also drive the sidebar's Alerts/Testimonials badges.
- Fixtures gain `auditLogs`, `alerts`, `healthChecks`, `performanceMetrics`, `settings` (shape-pinned in `demo-fixtures.test.js`). Availability is derived from rooms + bookings, not seeded.
- `src/test/demo-admin-sections.test.js` pins: analytics aggregates, bulk status apply (and its empty-selection guard), the disabled exports, the role switch, every L1 table (header, rows, zero inputs), no placeholder left in the admin tree, and the fixture-driven sidebar badges.
- `DemoSectionPage` is now an unreachable fallback: every nav item has a real page.

## Guest sections (Phase 5)

- `DemoGuestLayout` + `DemoGuestRooms`, `DemoGuestRoomDetail`, `DemoGuestBookings`, `DemoGuestStay`; selectors in `src/demo/guest/guestDemoData.js` (`stayBooking`, `upcomingBooking`, `payableBookings`, `reviewableBooking`, `balanceOf` reused from `foDemoData`).
- Room photos come from the landing artwork (`src/assets/{2,3,4,5}.webp`) mapped per room id in `fixtures.js`; the real app reads Cloudinary URLs, so these stand-ins keep the demo offline and photo-less rooms impossible.
- `GUEST_BOOK` takes `nights` (1–14, default 2) and `guest.demoPayBooking` reuses the Front Office payment reducer, so the balance guard is shared.  
- Room photo gallery reuses the production `RoomPhotoCarousel`.
- `src/test/demo-guest-flow.test.js` pins: the catalogue (rooms, photos, amenities, prices), every room link staying under `/demo/guest/rooms/`, the nights→total maths, booking into my bookings, the unknown-room state, the payment prefill + over-amount guard, housekeeping and review actions, and the guest exit.

## View-only (no actions)

Messages, testimonials, alerts, health, performance, availability, audit logs, settings — rendered as tables or read-only cards with no writes. Every nav item now has a real demo page.

## Known gaps (carried)

- Dead `TRAINING_A_COL` const + stale sandbox comments (availabilityService, favoritesService, reviewsService, userService).
- FO demo housekeeping lookup is per-room not per-request (masks repeat requests).
- L1 pages (FO and admin) are flat fixture tables: no detail views, no filters, no pagination.
- Admin demo has no bulk-export or emergency-override flow: those buttons toast "nothing was saved" instead of simulating a file or a forced status.
- Admin analytics are fixed snapshots (no date range, no charts); the real screen charts live aggregates.
- Guest demo booking dates are always "today + n nights" — the nights stepper is real, the date picker is not (pax/extra-guest fees are not simulated either).
- Demo room photos are shared landing artwork, not per-room shots, so a room's gallery can show an unrelated scene.
- Fixture `demo-102` room status (Dirty) disagrees with its completed log cycle (Available) — pre-existing; list actions on it no-op gracefully.
- Chain-level service reach (Phase 1 finding): `RoomScheduleTape` imports `bookingsService` and `HousekeepingPhotoUpload` imports `cloudinaryService`, both for prod-only branches. The demo passes `bookings`/`disableUploads`, so no listener attaches and no upload fires; `src/test/demo-import-graph.test.js` allowlists exactly those two edges. Fix by moving each branch behind a prod-side container (still open after Phase 4).
- Nav data now lives in `src/lib/nav-links.js` (single source for prod sidebar + the demo sidebar); prod parity pinned by `src/test/sidebar-nav-parity.test.js`.
- Mobile: the demo shell has no Navbar hamburger, so the staff sidebar becomes a horizontally scrollable strip and the guest bar wraps into two rows. Ceiling: a real drawer needs its own toggle button.

## Rules for product changes

1. New service contract (new field, status, or flow) → update `src/demo/fixtures.js` + `src/test/demo-fixtures.test.js` in the same PR.
2. New notification type → decide toast policy in `src/demo/DemoContext.jsx` inbox; demo links must stay under `/demo/`.
3. Never import `firebase/*`, `@/firebase/*`, or `@/services/*` from `src/demo/**` — eslint fails the build. Same ban applies to `DemoPreviewStrip.jsx` and `housekeeping-requests.js` (pinned by `demo-isolation.test.js`).
4. Chatbot stays out of demo (no widget, no service import).
5. GA skips `/demo*` (`src/App.jsx` tracker) — verify in realtime after shipping.
6. New optional props on reused components must default to prod behavior; prod call sites untouched (pinned by tape parity test).
