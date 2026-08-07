# Backlog

**Why this exists:** `react-doctor` scanned the codebase (146 files) and flagged issues by severity. Most are **quality / performance / accessibility (a11y) / maintainability** concerns — NOT breakage. The site is functional and deploy-safe. This file is the **source of truth for future bug triage**: if a bug appears later, start by checking whether it lives in one of the categories below.

> Baseline: React Doctor health score **38/100 (Critical)** — 218 issues
> (Security: 2 errors + 2 warnings | Maintainability 67 | Bugs 2 errors + 30 warnings | Performance 73 | Accessibility 42)

---

## ✅ Already fixed (no longer backlogs)

| Area | What |
|------|------|
| **Training self-escalation** | `firestore.rules` `training_guests` — self-create now requires `role == 'guest'`; self-update can no longer change `role`. Prods `/users` path was already safe. |
| **`window.open` noopener** | `src/pages/fo/FoCheckInPage.jsx:538` — added `'noopener,noreferrer'` to kill link-tab-hijack. |
| **Impure state updater** | `src/pages/public/ContactPage.jsx` — moved `clearInterval` out of `setCooldown` into a `useRef` + cleanup effect (StrictMode-safe). |
| **Dead Groq key in CI** | `.github/workflows/deploy.yml` — removed `VITE_GROQ_API_KEY` (re-exposed key in bundle), replaced with `VITE_GROQ_PROXY_URL`. |

---

## 🔴 Security / correctness — check FIRST on any likely-bug

These are the ones most likely to surface as an actual runtime or security bug. If someone reports an odd behavior, look here.

- **Array index used as `key`** ×12 — reordered/mutated lists can render stale or wrong rows.
  - `src/components/chatbot/ChatbotWidget.jsx` (73, 76, 83, 111)
  - `src/pages/admin/AdminAnalyticsPage.jsx:238`
  - `src/pages/admin/AdminRoomManagementPage.jsx` (172, 208)
  - `src/pages/public/RoomDetailPage.jsx` (244, 724, 745)
  - `src/pages/public/RoomsPage.jsx` (84, 247)
- **`await` inside a loop** ×3 — sequential awaits; N+1 latency on large data.
  - `src/components/housekeeping/HousekeepingPhotoUpload.jsx:33`
  - `src/pages/admin/AdminRoomManagementPage.jsx:126`
  - `src/services/bookingsService.js:1062`
- **State update after `await` in an effect** ×7 — unmounted-component race → "Can't perform a React state update" warnings or stale UI.
  - `src/pages/common/MaintenancePage.jsx:14`
  - `src/pages/fo/FoBookingsPage.jsx:352`
  - `src/pages/fo/FoCancellationsPage.jsx:184`
  - `src/pages/fo/FoPaymentsPage.jsx` (115, 148)
  - `src/pages/public/FavoritesPage.jsx:159`
  - `src/pages/public/RoomDetailPage.jsx:375`
- **`window.open` without `noopener`** — remaining occurrences (already fixed FoCheckInPage).
- **`Sloats` unversioned `localStorage` key** — `src/services/performanceService.js:97`. Key changes on schema change = stale data.
- **BaaS auth map shipped in bundle** — `dist/assets/firebase.config-DYC4C4fE.js` (expected for Firestore; just don't put secrets there).

---

## 🟠 Bugs / logic (30 warnings, 2 errors)

- **State updater with side effects** — `src/pages/public/ForgotPasswordPage.jsx:43` (same pattern fixed in ContactPage — may reappear, cooldown timer inside updater).
- **Loading flag reset outside `finally`** ×5 — a thrown error can leave a stuck spinner.
  - `src/contexts/AuthContext.jsx` (241, 273, 336)
  - `src/pages/admin/AdminPerformancePage.jsx:88`
  - `src/pages/admin/AdminSystemHealthPage.jsx:75`
- **Chained `.map().filter(Boolean)`** — `src/services/alertService.js:157` — loops twice.
- **Chained array iterations** ×5 — `src/services/activityService.js` (20, 46), `AdminRoomManagementPage.jsx:205`, `FoHousekeepingPage.jsx:219`, `chatbotService.js:35`.
- **`js-set-map-lookups`** — O(n²) array lookups in loops.
  - `src/pages/admin/AdminOperationsPage.jsx` (123, 312, 328)
  - `src/pages/admin/AdminRoomManagementPage.jsx:294`
- **`window.open` without `noopener`** — `src/pages/fo/FoCheckInPage.jsx:538` ✅ fixed.

---

## 🟡 Maintainability (large components, dead code)

- **Giant components (hard to read/change)** ×22 — top offenders:
  - `src/components/chatbot/ChatbotWidget.jsx`
  - `src/pages/admin/AdminRoomManagementPage.jsx` (352, 659)
  - `src/pages/fo/FoDashboardPage.jsx:134`
  - `src/pages/public/RoomsPage.jsx:308`
  - `src/pages/public/BookingPage.jsx:75`
  - `src/pages/public/MyBookingsPage.jsx` (122, 699)
  - `src/pages/public/RoomDetailPage.jsx:269`
- **Many `useState` (could be a reducer)** ×4 — `AuthContext.jsx:32`, `AdminSystemSettingsPage.jsx:31`, `FoCheckInPage.jsx:97`, `FoCheckOutPage.jsx:38`.
- **Unused exports** ×20 — dead code in `services/*` (activityService, analyticsService, auditService, availabilityService, bookingsService, emailHtml, favoritesService, healthService, maintenanceService, messageService, performanceService, sessionService, testimonialsService, userService).
- **Unused files** ×5 — `src/components/fo/FoStatusBoard.jsx`, `src/components/rooms/HousekeepingProgressStepper.jsx`, `src/services/chatService.js`, `src/services/seedService.js`, `worker/src/index.js`.
- **Unused dependencies** ×7 — `page.html`? in `package.json` (verify before removing).

---

## 🟡 Accessibility (42 warnings)

- **Control missing accessible label** ×17 (NotificationBell, AdminRoomManagementPage buttons, BookingPage, MyBookingsPage, ProfilePage, HousekeepingList, HousekeepingPhotoUpload).
- **Label missing associated control** ×10 (GuestHousekeepingCard, FoRoomRatesPage, BookingPage, MyBookingsPage, RoomDetailPage).
- **Placeholder-only field (no label)** ×7 (MyBookingsPage, FoBookingPage, FoCancellationsPage, FoDashboardPage, GuestHousekeepingCard, AdminUserManagementPage).
- **Redundant alt text** ×3 (`AdminRoomManagementPage.jsx:175`, `RoomDetailPage.jsx` 176, 200).
- **Click without keyboard handler / static element interaction** ×2 — `Sidebar.jsx:340`, `AdminRoomManagementPage.jsx:360`.

---

## 🟡 Environmental docs (minor perf wins)

- **`prefer-dynamic-import`** — `src/pages/admin/AdminAnalyticsPage.jsx:6` (heavy chunk is 408KB / 107KB gzip). Lazy-load on demand.
- **Static value rebuilt every render** ×5 — `RoomStatusBadge.jsx:10`, `components/ui/badge.jsx:5`, `FoDashboardPage.jsx:37`, `RoomShowcaseSection.jsx:25,31`.

---

## How to use this file

1. **New bug appears?** Search here first — the root cause is often a row above.
2. **Triage order** = 🔴 Security → 🟠 Bugs → 🟠 Perf → 🟡 A11y.
3. When you fix something here, **move it up to "Already fixed"** so the doc stays honest.

Re-run the baseline anytime with:

```bash
npx react-doctor@latest --verbose
```