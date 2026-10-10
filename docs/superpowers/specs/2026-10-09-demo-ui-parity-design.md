# Try Demo UI Parity Spec — real chrome, fixtures-only safety

Date: 2026-10-09. Status: proposed, awaiting user review.
Parent work: `docs/superpowers/plans/2026-10-09-try-demo.md` (shipped),
`docs/superpowers/plans/2026-10-09-demo-hybrid.md` (shipped, Tier A/B/C).
Supersedes the "tab strip" demo shell in `src/demo/DemoShell.jsx`.

## 1. Understanding

Intent: a visitor picks Guest / FO / Admin in Try Demo and explores something
that *looks and navigates* like the real product — real sidebar, real sections,
real tables and page rhythm — without logging in and without any Firestore
read or write.

Success: a visitor can walk the FO and Admin navigation and recognise which
sections exist and what they do; guest browsing stays the real public UI; no
demo interaction ever writes real data or attaches a backend listener.

Chosen reuse level: **chrome + component parity** (option A). Real route-level
page containers are explicitly out of scope.

## 2. Non-goals

- No mounting of real FA/Admin page containers (`src/pages/fo/*`,
  `src/pages/admin/*`). They import services directly; there is no seam.
- No data-source seam / dependency injection across the ~30 services.
- No service mocks, no aliased demo build, no sandbox collections, no rule
  changes.
- No new npm dependencies.
- No pixel-identical replication of heavy pages (checkout folio, refunds,
  audit detail). Depth is bounded by the L1/L2 table in section 6.
- No chatbot anywhere in the demo (`ChatbotWidget`, `AdminAssistantWidget`,
  `chatbotService`, worker AI routes).
- No GA tracking under `/demo*` (existing skip stays).

## 3. Current state (evidence, 2026-10-09)

- `src/demo/**` (~1.4k lines) owns fixtures (`fixtures.js`), scripted state
  (`DemoContext.jsx`), banner shell (`DemoShell.jsx`), role dialog, and three
  tabbed role pages — no sidebar, no per-section routes.
- Already reused: `RoomsGridView`, `RoomsTableView`, `HousekeepingList`,
  `RoomScheduleTape` (+additive props), `BookingDetails`, `DetailRow`-style
  markup; forked: `DemoRoomCard`, `DemoBookingCard`; shared pure:
  `src/lib/housekeeping-requests.js`.
- Tier A live browse exists: `/rooms` and `/rooms/:roomId` with `?demo=1` and
  `src/components/layout/DemoPreviewStrip.jsx`.
- Coupling that blocks container reuse: 76 files import `@/services`; 38 import
  Firebase config; FO pages ~5.1k lines, admin ~3.9k lines.
- `src/components/layout/Sidebar.jsx` (420 lines) reads `useAuth()`, calls
  `useFOIndicators({role})` (~8 live subscriptions for fo/admin), subscribes to
  `subscribeToUnresolvedCount` for admin, and returns `null` without a user.
  Its nav data (`FO_LINKS`, `ADMIN_LINKS`) is module-private.
- Isolation today is a direct-import ban only
  (`eslint.config.js` + `src/test/demo-isolation.test.js`). Transitive reach
  into services is not covered — the gap this work widens if unaddressed.

## 4. Architecture

Four parts: navigation data, demo chrome, demo route tree, section pages.

### 4.1 Navigation data (only prod edit)

Move `FO_LINKS` and `ADMIN_LINKS` out of `Sidebar.jsx` into
`src/lib/nav-links.js` — pure data plus lucide icon components, importing
nothing from services or firebase. `Sidebar.jsx` imports them unchanged
(behaviour byte-identical, pinned by a render-parity test). Demo maps each
link's `to` through `demoPath(to)` (prefix `/demo`) so nav labels, grouping,
order, icons and badge semantics cannot drift.

### 4.2 Demo chrome

`DemoSidebar` in `src/demo/DemoSidebar.jsx` renders the same groups with the
same class names and spacing as prod `Sidebar`, with:

- links rewritten through `demoPath`,
- indicator badges fed from fixtures (dirty rooms, pending bookings, pending
  cancellations, unresolved alerts),
- no `useAuth`, no `useFOIndicators`, no service imports,
- a role switch + "Exit demo" affordance kept at the sidebar footer.

Rationale for forking instead of adding a `demo` prop to prod `Sidebar`: prod
Sidebar's hooks subscribe on mount and cannot be conditionally skipped; a fork
costs ~120 lines of copied JSX, keeps prod untouched, and matches the existing
`DemoRoomCard` / `DemoBookingCard` precedent. Drift is mitigated by sharing the
nav data and pinned by a checklist item (section 9.4).

`DemoShell` keeps its banner (simulated-data copy, reset, exit) but switches its
body to `Outlet` over the demo route tree.

### 4.3 Demo route tree

Nested routes under the existing `DemoProvider` in `src/App.jsx`:

```
/demo                     DemoIndex (role picker, unchanged)
/demo/guest               DemoGuestHome
/demo/guest/book/:roomId  DemoGuestBooking (scripted wizard)
/demo/guest/pay           DemoGuestPayment (scripted, no gateway)
/demo/guest/bookings      DemoGuestBookings
/demo/guest/reviews       DemoGuestReviews
/demo/guest/housekeeping  DemoGuestHousekeeping
/demo/fo                  DemoFoDashboard
/demo/fo/bookings         DemoFoBookings
/demo/fo/check-in         DemoFoCheckIn
/demo/fo/check-out        DemoFoCheckOut
/demo/fo/payments         DemoFoPayments
/demo/fo/housekeeping     DemoFoHousekeeping
/demo/fo/cancellations    DemoFoCancellations   (L1)
/demo/fo/announcements    DemoFoAnnouncements   (L1)
/demo/fo/messages         DemoFoMessages        (L1)
/demo/fo/testimonials     DemoFoTestimonials    (L1)
/demo/admin               DemoAdminAnalytics
/demo/admin/operations    DemoAdminOperations
/demo/admin/users         DemoAdminUsers
/demo/admin/rooms         DemoAdminRooms
/demo/admin/settings      DemoAdminSettings     (L1)
/demo/admin/health        DemoAdminHealth       (L1)
/demo/admin/availability  DemoAdminAvailability (L1)
/demo/admin/performance   DemoAdminPerformance  (L1)
/demo/admin/audit-logs    DemoAdminAuditLogs    (L1)
/demo/admin/alerts        DemoAdminAlerts       (L1)
/demo/admin/messages      DemoAdminMessages     (L1)
/demo/admin/testimonials  DemoAdminTestimonials (L1)
```

Routes are declared in a single route table (`src/demo/routes.js`) that both
the router and `DemoSidebar` consume, so a section can never appear in nav
without a route (pinned by test). `DemoIndex` (role picker) keeps its current
behaviour; deep links without a role still redirect to the picker.

### 4.4 Section page model

Every section page is small, fixture-fed, and service-free:

- **Page header**: eyebrow + title + one-line description using the same
  rhythm/tokens as prod pages.
- **Body**: real presentational components where they are service-free
  (tables, lists, kanban, badges, `RoomScheduleTape`, `RoomsFilterBar` for
  view-only filtering, recharts for analytics if the chart wrapper is pure);
  otherwise local markup that copies prod class names.
- **Actions**: L2 sections wire in-memory reducer actions; L1 sections toast.

## 5. Reuse rules

1. A prod component may be imported from `src/demo/**` only if its import graph
   reaches no `@/services/**` and no `@/firebase/**` module. Pinned by the
   transitive walk test (section 7.2).
2. When a component fails rule 1, fork it into `src/demo/` and copy the prod
   class names and JSX skeleton so future CSS changes flow through.
3. Never add `demo`/`isDemo` boolean flags to prod components. New props on
   prod components are additive, optional, and defaulted to prod behaviour.
4. Existing consumers of a shared pure module (e.g.
   `src/lib/housekeeping-requests.js`) keep working; shared pure modules live in
   `src/lib/` because `src/demo/**` cannot be imported *by* prod code.

## 6. Section coverage (depth)

| Level | Meaning |
|---|---|
| L2 scripted | in-memory actions, simulated notifications, toasts |
| L1 view-only | fixture data rendered, writes disabled via `demoToast()` |

- **Guest** — browse L2-real (`/rooms`, `/rooms/:roomId` + `?demo=1`), booking
  wizard L2 scripted, simulated payment L2 scripted, bookings L2
  (cancel/review), housekeeping L2 (request + status cycle), reviews L2.
- **FO** — dashboard, bookings, check-in, check-out, payments, housekeeping L2;
  cancellations, announcements, messages, testimonials L1.
- **Admin** — analytics, operations, users, rooms L2; settings, health,
  availability, performance, audit logs, alerts, messages, testimonials L1.

## 7. Data, fixtures, isolation

### 7.1 Fixtures

`src/demo/fixtures.js` stays the sole owner of demo data. Additive fields only:
staff list (housekeeping assignment), announcements, testimonials, audit rows,
health/performance sample metrics, one cancellation/refund sample, folio-style
lines for the checkout panel. Every fixture set keeps date-relative generation
and per-call deep clone. `src/test/demo-fixtures.test.js` gains a required-key
shape assertion per section so fixture drift fails the suite instead of
rendering blanks.

### 7.2 Isolation hardening (required before reuse grows)

Add `src/test/demo-import-graph.test.js`: walk static import specifiers
recursively from every file under `src/demo/**` (plus
`src/components/layout/DemoPreviewStrip.jsx`) and assert the reachable set
contains no `src/services/**` and no `src/firebase/**` module. Keep the
existing eslint `no-restricted-imports` block. This converts "reuse is safe"
from a promise into a failing test.

### 7.3 Runtime boundaries

- Demo routes stay public (no `PrivateRoute`) and work signed-out and
  signed-in; demo code never reads the signed-in user's data.
- Link-prefix test: every `to`/`href` rendered inside the demo tree starts with
  `/demo`, except the four intentional exits (`/`, `/login`, `/rooms?demo=1`,
  `/rooms/:id?demo=1`).
- `resetDemo()` runs on role switch and on demo entry, so a session cannot
  carry mutated state between visitors on a shared device.
- Demo interactions mutate reducer state only. No writes, no gateway calls, no
  refund math, no receipt PDFs, no real notifications.
- GA `trackPageView` keeps skipping `/demo*`; chatbot widgets stay unmounted.

## 8. Phases

**Phase 0 — baseline.** Record `git status`, current commit, and
`npm run test:run` result as the revert point. No code.

**Phase 1 — safety rails.** `src/lib/nav-links.js` extraction + Sidebar parity
test; `demo-import-graph.test.js` with an exact-edge exception list for the two
prod-only service branches (`RoomScheduleTape`, `HousekeepingPhotoUpload`); the
demo link-prefix test lands in Phase 2, where demo nav links first exist. Gate:
`npm run lint && npm run knip && npm run test:run && npm run build`.

**Phase 2 — chrome + route tree.** `routes.js` table, `DemoSidebar`,
`DemoShell` → `Outlet`, nested routes in `App.jsx`, route-table/nav consistency
test. Gate: same four commands + manual nav walk at desktop and 390px.

**Phase 3 — FO sections.** Dashboard, bookings, check-in, check-out, payments,
housekeeping (L2) then cancellations, announcements, messages, testimonials
(L1). One section per commit, each with a behaviour or render test.

**Phase 4 — Admin sections.** Analytics, operations, users, rooms (L2) then
settings, health, availability, performance, audit logs, alerts, messages,
testimonials (L1).

**Phase 5 — Guest journeys (done).** Room catalogue, room detail, scripted
booking with a nights stepper, simulated payment, then
bookings/reviews/housekeeping on demo routes. The "Browse live rooms" bridge to
`/rooms?demo=1` was dropped here: it read Firestore from the demo, and an empty
room collection surfaced as "no rooms found". `DemoPreviewStrip` and the prod
`?demo=1` handling remain, just unreachable from the demo tree.

**Phase 6 — parity and hardening.** Disabled-action audit, fixture shape
coverage, mobile pass, GA realtime spot-check, parity doc update
(`docs/superpowers/plans/2026-10-09-try-demo-parity.md`).

**Phase 7 — spec/plan bookkeeping.** Task-level implementation plan via the
writing-plans skill; keep this spec as the design of record.

## 9. Risks, ceilings, verification

1. **Forked chrome drifts** from prod Sidebar. Mitigation: shared
   `nav-links.js`, copied classes, parity checklist item; ceiling: cosmetic
   drift can still happen between reviews.
2. **Transitive reach regression** when someone reuses a container. Mitigation:
   Phase 1 import-graph test fails the suite.
3. **L1 sections feel thin.** Deliberate: honest view-only fixtures beat
   fake depth. Ceiling: `ponytail:` comment on the generic L1 view naming the
   ceiling and the upgrade path (promote a section to L2 by adding reducer
   actions).
4. **Fixture shape creep.** Mitigation: shape test + the parity doc rule that a
   new service contract updates fixtures in the same change.
5. **Nav/route divergence.** Mitigation: single route table consumed by both
   router and sidebar, pinned by test.
6. **Prod regression from the nav-data extraction.** Mitigation: additive-only
   edit, Sidebar render-parity test, full suite green before Phase 2 starts.

## 10. Open items for review

- Confirm the L1/L2 split per section (section 6) matches what visitors should
  learn about the product.
- Confirm L1 pages may ship without deep drill-downs (no detail modals).
- Confirm Phase 5 payment simulation stays visual-only (no "receipt", no
  reference-number persistence).
