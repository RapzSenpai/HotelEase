# Try Demo Hybrid Spec — real UI feel, fixtures-only safety

Date: 2026-10-09. Status: proposed, awaiting user review.
Parent plan: `docs/superpowers/plans/2026-10-09-try-demo.md` (shipped, Tasks 0–15 complete).

## 1. Understanding

Intent: visitor clicks Try Demo and feels the real system, without login,
without touching prod data. Guest browse is already public (`/rooms`,
`/rooms/:roomId`, reads allowed by rule), so that slice is free. Everything
past browse (booking, payments, FO/Admin ops) stays scripted against
in-memory fixtures, reskinned with the same components/tokens so it looks
identical.

Success: user cannot visually distinguish demo chrome from prod chrome;
`/demo/**` still imports zero `firebase/*`, `@/services/*`; suite green.

Design read: in-app demo reskin for guests/staff, trust-first operational
language, leaning toward the existing vendored-shadcn + Tailwind v3 system.
Dials: match existing, motion +1 on new demo chrome only, density match.
No new visual language — matching prod IS the feature.

## 2. Non-goals

- No demo backend, demo users, or sandbox collections. No rule changes.
- No data-access seam/DI across the 30 service files. Containers untouched.
- No new deps (framer-motion + lucide-react already cover motion/icons).
- No chatbot in demo. No GA tracking under `/demo*` (keep skip).
- No pixel work on prod pages; prod pages are the reference, not the canvas.

## 3. Architecture — three tiers

| Tier | Surface | Data | Cost |
|------|---------|------|------|
| A. Live browse | Real `/rooms`, `/rooms/:roomId` + `?demo=1` strip | Real public reads (already allowed) | ~1 small additive strip |
| B. Scripted guest flows | `DemoGuestPage` reskinned: booking wizard look, my-bookings look, housekeeping look | Fixtures, reducer-local | Fork 2–3 cards with props |
| C. View-only staff | `DemoFoPage`/`DemoAdminPage` rebuilt from real presentational components | Fixtures, reducer-local | Wire callbacks to `DemoContext` |

Tier A is the only place visitors touch prod code paths, and both are
read-only by rule for anon. Tiers B/C never import services (guard stays).

## 4. Entry and routing

- Landing Try Demo → `/demo` picker (unchanged). Guest pick → `/demo/guest`
  (unchanged); the guest page gains a prominent "Browse live rooms" button
  → real `/rooms?demo=1`.
- `?demo=1`: `AppShell` renders a slim strip under navbar — "Demo preview —
  booking needs an account. Back to simulated demo →" (link `/demo/guest`).
  Read-only, no behavior change to the pages. Strip hidden without the query.
- Book Now inside `?demo=1` keeps real behavior (login prompt). That IS the
  lesson: see the gate, then return to the sandbox to play past it.
- Close/X/Esc semantics unchanged (picker close → `/`).

## 5. Component reuse matrix

Reuse directly (service-free, props-driven):

| Component | Props | Used in |
|-----------|-------|---------|
| `RoomsGridView` / `RoomsTableView` | `{rooms, onEdit, onArchive, onRestore}` | Admin demo rooms tab (callbacks → `demoUpdateRoom` + demo toast) |
| `RoomStatusBadge` | `{status}` | Anywhere statuses render |
| `BookingDetails` | `{booking, status}` | Guest/FO demo detail views |
| `HousekeepingKanban` | rooms + assignment callbacks + staff lists | FO demo housekeeping (all callbacks → context; dnd-kit already dep) |
| `HousekeepingList` | same minus dnd + `{mode}` | FO demo simplest path; prefer over kanban unless drag matters |
| `ui/*` (table, card, badge, dialog, button) | shadcn-style | All demo chrome |
| `HeroSection` Try Demo button | already wired | Unchanged |

Fork with props (container deps inside, extract the pure part):

| Real | Demo variant | Change |
|------|--------------|--------|
| `RoomsPage` inline `RoomCard` (has `useAuth`) | `DemoRoomCard` in `src/demo/` | Same layout classes (`.room-card-enter`), `user/isFavorite` via props, favorite toggle → demo toast |
| `BookingCard` / `PastBookingRow` (4 service imports) | `DemoBookingCard` | Same JSX skeleton, `payments[]`/callbacks via props |
| `GuestHousekeepingCard` (service subscribe) | reuse `buildRequests` + `PastRequestRow` only | Already partially extracted; finish the split |
| `RoomScheduleTape` (`subscribeToBookingsPage` inside) | pass `bookings[]` prop + `onSelect` nav callback | Small additive props, defaults preserve prod behavior |

Explicit variants, not boolean modes: demo components live in `src/demo/`,
never `demo={true}` flags threaded through prod components (composition
rule). Prod defaults unchanged; new props optional.

## 6. Data and isolation guarantees

- Fixtures remain sole demo data owner (`buildDemoData`, deep-clone).
  Extend shapes only additively if new tabs need fields (e.g. folio lines).
- Eslint guard extends to new demo files automatically (`src/demo/**`).
  Add Tier A strip files (`DemoPreviewStrip.jsx`) OUTSIDE `src/demo/` so the
  guard does not block its `useSearchParams`/router imports — but it must
  import zero services too (eyeball in review; it needs none).
- New callbacks in `DemoContext` only for newly exposed actions
  (check-in/out, cancellations read-only, announcements list). Mutations stay
  reducer-local; `resetDemo` unchanged.
- Disabled-action pattern: every demo button that would write in prod
  renders the real variant/shadcn button, onClick → sonner toast
  "Demo — nothing was saved" + in-memory effect where the journey needs it.
  Disabled look only where the journey ends (e.g. delete user); otherwise
  keep buttons enabled-feeling so the flow is explorable.

## 7. Visual conformance (UI-skill rules, applied to NEW chrome only)

- Tokens: existing `--radius-*`, `bg-background text-foreground font-inter`,
  zinc/neutral + single accent. No new palette, no purple glow, no new font.
- Shape lock: match existing radius scale (read it off `ui/card` + `ui/button`).
- Numbers (prices, folio, analytics): `tabular-nums`.
- Headings: `text-wrap: balance`; body: `text-wrap: pretty`.
- Press feedback: `active:scale-[0.96]` on demo-only buttons; exact-property
  transitions only, never `transition: all`.
- Banner/strip: reuse `DemoShell` banner language ("Simulated data"), one
  eyebrow-style label max, no new hero, no marquee, no scroll-hijack.
- Icons: lucide-react only (sole family). No hand-rolled SVGs.
- Mobile: every reused grid already collapses; new demo grids declare
  `<768px` single-column explicitly. Touch targets ≥40px dense / 44px guest.
- Reduced motion: framer-motion usage honors `useReducedMotion` (already dep).

## 8. Testing

- Isolation test: extend `demo-isolation.test.js` scan to cover
  `DemoPreviewStrip` (assert zero `services`/`firebase` imports).
- Entry test: `?demo=1` strip renders on `/rooms`, link returns `/demo/guest`.
- Journey tests: reskinned tabs render (grid/table/kanban with fixtures),
  disabled actions toast + mutate nothing, checks against fixture counts.
- Full gates unchanged: lint 0, knip 0, suite green, build ok.
- Manual smoke: browse live rooms → back to demo → guest book → FO approve →
  admin rooms edit, all laptop + 390px wide.

## 9. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Forked cards drift from prod look | Forks copy JSX skeleton + same ui/* + same classes; review side-by-side at PR |
| `RoomScheduleTape` prop change breaks prod | New props optional with defaults; prod call sites untouched; suite covers |
| Strip in `AppShell` leaks into prod layout | Rendered only when `?demo=1`; snapshot-free pages unaffected; CSS one class |
| Fixture shape growth breaks journey tests | Additive fields only; shape test pins required keys |
| Scope creep (more tabs, more flows) | Tier table is the gate: anything needing a new service mock stays out |

## 10. Rollout

Commit per phase, push only on user approval (standing rule). No deploys
needed beyond normal frontend CI (no rule/worker changes). Parity doc
`2026-10-09-try-demo-parity.md` updated with Tier A/B/C coverage + remaining
gaps (the 4 deferred minors carry over unless fixed in passing).
