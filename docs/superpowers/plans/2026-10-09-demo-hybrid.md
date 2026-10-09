# Demo Hybrid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Try Demo feel like the real system by routing guest browse to the real public rooms pages and reskinning scripted demo tabs with the same presentational components prod uses, keeping `/demo/**` fixtures-only.

**Architecture:** Three tiers — Tier A live browse (real `/rooms` + `?demo=1` strip, zero behavior change), Tier B scripted guest flows (demo forks of container-coupled cards), Tier C view-only staff (real presentational tables/kanban wired to `DemoContext`). No service-layer seam, no rule changes, no new deps.

**Tech Stack:** React + react-router-dom, Tailwind v3, vendored shadcn `ui/*`, lucide-react icons, framer-motion (existing), Vitest + react-dom act tests.

**Spec:** `docs/superpowers/specs/2026-10-09-demo-hybrid-design.md`

## Global Constraints

- No new dependencies (framer-motion, lucide-react, dnd-kit already present cover all needs).
- `src/demo/**` imports zero `firebase/*`, `@/firebase/*`, `@/services/*` (eslint `no-restricted-imports` guard stays green).
- `DemoPreviewStrip` lives OUTSIDE `src/demo/` (`src/components/layout/`) so the guard never blocks its router imports; it still imports zero services/firebase.
- Demo components live in `src/demo/`; never add `demo={true}` flags to prod components (explicit variants rule).
- New props on prod components are optional with defaults; prod call sites untouched.
- GA skip for `/demo*` stays; strip/real-pages tracking behavior unchanged.
- One icon family: lucide-react. No hand-rolled SVGs.
- New demo chrome matches existing tokens/radius; `tabular-nums` on all money/numbers; `text-wrap: balance` on new headings.
- TDD every task: failing test first, minimal code, green suite. Commit per task. Push only when user says so.
- Gates per task: `npm run lint` exit 0; final task also `npm run knip`, `npm run test:run`, `npm run build`.

## Review Focus

- `?demo=1` strip rendering on a non-demo route (e.g. `/about?demo=1`) shows/hides correctly and never breaks layout when absent — pinned by Task 1 test.
- `RoomScheduleTape` with no new props behaves byte-identical to today in prod FO dashboard — pinned by Task 7 test rendering it prop-less against current output.
- Anonymous visitor on Tier A pages can read rooms but the strip's "back to demo" link never exposes authed demo state — pinned by Task 1 test (link target only).
- Forked `DemoRoomCard`/`DemoBookingCard` keep prod class names (`.room-card-enter`) so future prod CSS changes flow through — pinned by Task 3/4 class-name assertions.
- Disabled actions never mutate fixture state AND toast exactly once per click (no double-sonner) — pinned by Task 9 test.

---

### Task 1: Tier A preview strip

**Files:**
- Create: `src/components/layout/DemoPreviewStrip.jsx`
- Modify: `src/layouts/AppShell.jsx` (render strip when `?demo=1`)
- Test: `src/test/demo-preview-strip.test.js`

**Interfaces:**
- Consumes: react-router-dom `useSearchParams`, `Link`; `ui/button` `Button`.
- Produces: `DemoPreviewStrip()` (no props) — renders slim strip with copy "Demo preview — booking needs an account." + `Link to="/demo/guest"` labeled "Back to simulated demo". Renders `null` unless `demo=1`.

- [ ] **Step 1: Write the failing test** — `src/test/demo-preview-strip.test.js`: render `AppShell`-adjacent minimal tree (MemoryRouter `/rooms?demo=1` + strip) asserting strip text + link target `/demo/guest`; second case `/rooms` without query asserting strip absent.

```jsx
// assert: getByText(/Demo preview/) present with ?demo=1, absent without;
// assert: getByText(/Back to simulated demo/).closest("a").getAttribute("href") === "/demo/guest"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/demo-preview-strip.test.js`
Expected: FAIL with "DemoPreviewStrip not defined" (module missing).

- [ ] **Step 3: Implement `DemoPreviewStrip` in `src/components/layout/DemoPreviewStrip.jsx`** — `useSearchParams`, return null unless `get("demo")==="1"`; strip `div` one class, `Button asChild` wrapping `Link`.

- [ ] **Step 4: Wire into `src/layouts/AppShell.jsx`** — render `<DemoPreviewStrip />` directly under navbar element, no other changes.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/demo-preview-strip.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/DemoPreviewStrip.jsx src/layouts/AppShell.jsx src/test/demo-preview-strip.test.js
git commit -m "feat(demo): Tier A preview strip on ?demo=1"
```

---

### Task 2: DemoContext check-in / check-out / cancel actions

**Files:**
- Modify: `src/demo/DemoContext.jsx`
- Modify: `src/test/demo-journeys.test.js` (append new describes)

**Interfaces:**
- Consumes: fixture booking shape `{id, status}` (existing).
- Produces: `fo.demoCheckIn(bookingId)` (`Approved→Checked In`), `fo.demoCheckOut(bookingId)` (`Checked In→Checked Out`), `guest.demoCancelBooking(bookingId)` (`Pending|Awaiting Payment→Cancelled`); illegal transitions are no-ops.

- [ ] **Step 1: Write the failing tests** — three cases: check-in flips Approved→Checked In; check-out flips Checked In→Checked Out; cancel flips Pending→Cancelled; illegal (cancel Checked In) is a no-op.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/test/demo-journeys.test.js`
Expected: FAIL with "demoCheckIn is not a function" (or equivalent).

- [ ] **Step 3: Implement the three reducer cases + exposures in `src/demo/DemoContext.jsx`** — follow existing `demoApproveBooking` pattern exactly.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/demo-journeys.test.js`
Expected: PASS.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/demo/DemoContext.jsx src/test/demo-journeys.test.js
git commit -m "feat(demo): context check-in check-out cancel actions"
```

---

### Task 3: DemoRoomCard + guest browse reskin

**Files:**
- Create: `src/demo/DemoRoomCard.jsx`
- Modify: `src/demo/guest/DemoGuestPage.jsx` (browse tab)
- Test: `src/test/demo-hybrid.test.js` (new file)

**Interfaces:**
- Consumes: room fixture `{id, name, pricePerNight, capacity, status, photos[]}`; `RoomStatusBadge` from `@/components/rooms/RoomStatusBadge`.
- Produces: `DemoRoomCard({room, isFavorite, onToggleFavorite})` — same layout skeleton + `.room-card-enter` class as prod `RoomsPage` inline card, favorite toggle via props (no `useAuth`), "View" affordance is display-only.

- [ ] **Step 1: Write the failing test** — render `DemoRoomCard` with a fixture room: asserts `.room-card-enter` class present, room name + price text present, clicking favorite calls `onToggleFavorite` with room id.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/demo-hybrid.test.js`
Expected: FAIL with module missing.

- [ ] **Step 3: Implement `DemoRoomCard`** — copy the JSX skeleton of prod inline card (read `RoomsPage.jsx` lines for structure first), replace `useAuth`/service bits with props, keep class names.

- [ ] **Step 4: Reskin browse tab in `DemoGuestPage.jsx`** — grid of `DemoRoomCard` from `data.rooms`, favorites via local demo state, plus prominent "Browse live rooms" `Link to="/rooms?demo=1"`.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/test/demo-hybrid.test.js`
Expected: PASS.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/demo/DemoRoomCard.jsx src/demo/guest/DemoGuestPage.jsx src/test/demo-hybrid.test.js
git commit -m "feat(demo): guest browse reskin with DemoRoomCard"
```

---

### Task 4: DemoBookingCard + guest bookings reskin

**Files:**
- Create: `src/demo/DemoBookingCard.jsx`
- Modify: `src/demo/guest/DemoGuestPage.jsx` (bookings tab)
- Test: append to `src/test/demo-hybrid.test.js`

**Interfaces:**
- Consumes: `booking` fixture, `room` fixture, `payments[]` via props; `BookingDetails` from `@/components/bookings/BookingDetails`; Task 2 `demoCancelBooking`.
- Produces: `DemoBookingCard({booking, room, payments, onCancel})` — prod card skeleton + `.tabular-nums` on money, cancel button → `onCancel(booking.id)`.

- [ ] **Step 1: Write the failing test** — renders booking id + `tabular-nums` money element + `BookingDetails` content; clicking Cancel calls `onCancel` with id.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/demo-hybrid.test.js -t "DemoBookingCard"`
Expected: FAIL with module missing.

- [ ] **Step 3: Implement `DemoBookingCard`** — mirror prod `BookingCard` skeleton (read it first), all data/callbacks via props, zero service imports.

- [ ] **Step 4: Reskin bookings tab** — list `DemoBookingCard` per user booking with room lookup + payments filter + `demoCancelBooking` wiring.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/test/demo-hybrid.test.js`
Expected: PASS.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/demo/DemoBookingCard.jsx src/demo/guest/DemoGuestPage.jsx src/test/demo-hybrid.test.js
git commit -m "feat(demo): guest bookings reskin with DemoBookingCard"
```

---

### Task 5: Admin rooms tab on real Grid/Table views

**Files:**
- Modify: `src/demo/admin/DemoAdminPage.jsx`
- Test: append to `src/test/demo-hybrid.test.js`

**Interfaces:**
- Consumes: `RoomsGridView`/`RoomsTableView` (`{rooms, onEdit, onArchive, onRestore}`), `admin.demoUpdateRoom` (existing), demo toast helper (Task 9 defines canonical; this task uses inline sonner toast — Task 9 later unifies, note the temporary duplication in code comment).
- Produces: rooms tab rendering real views with fixture rooms; edit → `demoUpdateRoom`; archive/restore → toast "Demo — nothing was saved".

- [ ] **Step 1: Write the failing test** — admin rooms tab renders view with all 6 fixture room names; clicking edit updates name via context.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/demo-hybrid.test.js -t "admin rooms"`
Expected: FAIL (real views not yet rendered with fixtures).

- [ ] **Step 3: Implement tab swap in `DemoAdminPage.jsx`** — grid/table toggle reusing the two real views, callbacks wired as above.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/demo-hybrid.test.js`
Expected: PASS.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/demo/admin/DemoAdminPage.jsx src/test/demo-hybrid.test.js
git commit -m "feat(demo): admin rooms on real grid table views"
```

---

### Task 6: FO housekeeping on real List view

**Files:**
- Modify: `src/demo/fo/DemoFoPage.jsx`
- Test: append to `src/test/demo-hybrid.test.js`

**Interfaces:**
- Consumes: `HousekeepingList` (`{rooms, getAssignmentForRoom, ..., onApproveRoom, onReassign, mode}` — read exact props first), `fo.demoAdvanceCleaning` (existing), fixture rooms/logs.
- Produces: housekeeping tab rendering `HousekeepingList mode="turnover"` with fixture-derived props; approve/move callbacks → `demoAdvanceCleaning` + assigns to demo staff user.

- [ ] **Step 1: Write the failing test** — tab renders list with fixture room names; approving advances a Dirty room's status in context.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/demo-hybrid.test.js -t "FO housekeeping"`
Expected: FAIL.

- [ ] **Step 3: Implement tab swap** — derive `getAssignmentForRoom` etc. from fixture logs inline in the page (small local functions, no new files).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/demo-hybrid.test.js`
Expected: PASS.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/demo/fo/DemoFoPage.jsx src/test/demo-hybrid.test.js
git commit -m "feat(demo): FO housekeeping on real list view"
```

---

### Task 7: RoomScheduleTape fixture props (additive)

**Files:**
- Modify: `src/components/dashboard/RoomScheduleTape.jsx` (optional props only)
- Modify: `src/demo/fo/DemoFoPage.jsx` (dashboard tab)
- Test: append to `src/test/demo-hybrid.test.js`

**Interfaces:**
- Consumes: existing tape internals unchanged.
- Produces: `RoomScheduleTape({rooms, bookings?, onSelectBooking?})` — when `bookings` omitted, current `subscribeToBookingsPage` behavior intact; when provided, renders from props and calls `onSelectBooking(booking)` instead of `useNavigate`.

- [ ] **Step 1: Write the failing tests** — (a) prop-less render output identical to today (snapshot of booking count chips with mocked subscription); (b) with `bookings` prop renders fixture bookings with zero subscription calls; (c) click calls `onSelectBooking`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/test/demo-hybrid.test.js -t "schedule tape"`
Expected: FAIL with "bookings prop is not recognized" (or prop ignored).

- [ ] **Step 3: Implement optional props** — branch at the subscription call site only; prod call sites untouched.

- [ ] **Step 4: Wire FO demo dashboard tab** — tape with fixture rooms/bookings, `onSelectBooking` scrolling to bookings tab (or toast with booking id — pick scroll if trivially available, else toast).

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/test/demo-hybrid.test.js`
Expected: PASS.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/RoomScheduleTape.jsx src/demo/fo/DemoFoPage.jsx src/test/demo-hybrid.test.js
git commit -m "feat(demo): schedule tape fixture props, FO dashboard"
```

---

### Task 8: Housekeeping pure-extract + guest housekeeping reskin

**Files:**
- Create: `src/demo/demoHousekeeping.js` (pure helpers)
- Modify: `src/demo/guest/DemoGuestPage.jsx` (housekeeping tab)
- Test: append to `src/test/demo-hybrid.test.js`

**Interfaces:**
- Consumes: fixture bookings/logs shape (existing).
- Produces: `buildDemoRequests(booking, logs)` + `requestStatusOf(request)` pure functions; guest tab renders request-cycle cards reusing `PastRequestRow` markup pattern with demo rate/cancel → context actions (`demoRequestHousekeeping` exists; add rating as local state only).

- [ ] **Step 1: Write the failing tests** — `buildDemoRequests` groups two log entries into one cycle; tab renders active request + history count.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/test/demo-hybrid.test.js -t "housekeeping"`
Expected: FAIL with module missing.

- [ ] **Step 3: Implement helpers** — port the pure grouping logic from `GuestHousekeepingCard.jsx` (read it first), no service imports.

- [ ] **Step 4: Reskin tab** — active request inline + history list, same visual order as prod card.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/test/demo-hybrid.test.js`
Expected: PASS.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/demo/demoHousekeeping.js src/demo/guest/DemoGuestPage.jsx src/test/demo-hybrid.test.js
git commit -m "feat(demo): guest housekeeping reskin, pure helpers"
```

---

### Task 9: Disabled-action pattern + demo-wide audit

**Files:**
- Create: `src/demo/demoToast.js` — `demoToast(message = "Demo — nothing was saved")` wrapping sonner `toast.info` exactly once.
- Modify: every demo page/button using ad-hoc toasts (unify to helper, remove Task 5 temp duplication).
- Test: append to `src/test/demo-hybrid.test.js`

**Interfaces:**
- Consumes: `sonner` `toast` (already dep).
- Produces: `demoToast(message?)` — single `toast.info` call per invocation; audit list in commit message of every button converted.

- [ ] **Step 1: Write the failing test** — call `demoToast()` twice, assert `toast.info` called exactly twice (once each, no doubles); default message matches spec copy.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/demo-hybrid.test.js -t "demoToast"`
Expected: FAIL with module missing.

- [ ] **Step 3: Implement helper + audit** — replace all ad-hoc demo toasts; every write-like demo button without an in-memory effect routes through it.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/test/demo-hybrid.test.js`
Expected: PASS.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/demo/demoToast.js src/demo/guest/DemoGuestPage.jsx src/demo/fo/DemoFoPage.jsx src/demo/admin/DemoAdminPage.jsx src/test/demo-hybrid.test.js
git commit -m "feat(demo): unified disabled-action toast"
```

---

### Task 10: Guards, parity doc, final verify

**Files:**
- Modify: `src/test/demo-isolation.test.js` (include `DemoPreviewStrip` path, assert zero services/firebase imports)
- Modify: `docs/superpowers/plans/2026-10-09-try-demo-parity.md` (Tier A/B/C coverage + gaps)
- Test: full suite

**Interfaces:**
- Consumes: all prior tasks.
- Produces: isolation scan covering `src/demo/**` + `src/components/layout/DemoPreviewStrip.jsx`; updated parity doc; green gates.

- [ ] **Step 1: Extend isolation test** — add strip path to scanned files, same zero-import assertion.

- [ ] **Step 2: Run to verify it fails (if strip violates) or passes**

Run: `npx vitest run src/test/demo-isolation.test.js`
Expected: PASS (strip is clean by construction); if FAIL, remove the offending import (strip needs none).

- [ ] **Step 3: Update parity doc** — Tier table, reused-vs-forked list, remaining gaps (4 deferred minors + new known gaps).

- [ ] **Step 4: Run full gates**

Run: `npm run lint && npm run knip && npm run test:run && npm run build`
Expected: lint 0, knip 0, all tests pass, build ok.

- [ ] **Step 5: Manual smoke (report results in commit message)** — `/rooms?demo=1` strip → back to demo → guest book/cancel → FO check-in/out → admin rooms edit, laptop + 390px.

- [ ] **Step 6: Commit**

```bash
git add src/test/demo-isolation.test.js docs/superpowers/plans/2026-10-09-try-demo-parity.md
git commit -m "docs(demo): hybrid parity + isolation guard"
```
