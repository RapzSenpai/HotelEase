# Try Demo Parity Checklist

One-page companion to `2026-10-09-try-demo.md`. Update it whenever the product changes.

## Journeys per role (scripted)

- Guest (`src/demo/guest/DemoGuestPage.jsx`): browse rooms → book (Pending + toast) → review pre-seeded completed stay → housekeeping on pre-seeded checked-in stay.
- FO (`src/demo/fo/DemoFoPage.jsx`): dashboard counts + schedule → approve Pending → check in → record payment (balance guard, prefilled) → advance cleaning (simulated ~3s notification).
- Admin (`src/demo/admin/DemoAdminPage.jsx`): rooms table (rate/status in-memory), users role switch (in-memory), analytics view-only aggregates.

## View-only (no actions)

Messages, announcements, testimonials, audit logs, health, performance, availability, alerts, user management detail — intentionally unlinked from demo.

## Rules for product changes

1. New service contract (new field, status, or flow) → update `src/demo/fixtures.js` + `src/test/demo-fixtures.test.js` in the same PR.
2. New notification type → decide toast policy in `src/demo/DemoContext.jsx` inbox; demo links must stay under `/demo/`.
3. Never import `firebase/*`, `@/firebase/*`, or `@/services/*` from `src/demo/**` — eslint fails the build.
4. Chatbot stays out of demo (no widget, no service import).
5. GA skips `/demo*` (`src/App.jsx` tracker) — verify in realtime after shipping.
