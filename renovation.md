# HotelEase Guest Booking Flow Renovation

**Status:** Planning document. Do not execute until phases below are individually approved, same discipline as patch.md — one phase at a time, verify before next.

**Scope:** Full redesign of guest-facing browse → room detail → booking → confirmation flow. Separate from patch.md (bug fixes) — this is a UX/architecture renovation on top of an already-patched, working system (Phases 1-16 complete or in progress).

**Decisions locked:**
- Room Overview replaces existing `/rooms/:roomId` route — no new route, rebuild in place.
- Customer Info step pre-fills from guest profile, editable (supports booking-for-someone-else).
- Availability check happens on-action ("Check Availability" / proceed to booking), not live per date-change.
- Hide-unavailable-rooms applies once guest selects check-in/check-out dates on Browse Rooms page (Option A).
- FullCalendar stays — no library swap, just relocate date-picking earlier in the flow.
- Multi-step wizard absorbs BookingPage.jsx's existing responsibilities (Phase 10-16 payment-proof logic must be ported in, not lost).

---

## Prerequisites (must complete before any UI phase starts)

### P0.1 — Date-range availability service function
- New/extended function in `roomsService.js` or `bookingsService.js`: `getAvailableRooms(checkInDate, checkOutDate)`.
- Logic: return rooms NOT matching any existing booking (`Pending`/`Approved`/`Checked In` per existing conflict-check pattern) that overlaps the given date range. Reuse the overlap logic already in `createBooking()`'s conflict check — extract into a shared helper if not already reusable.
- This is the single source of truth both Browse Rooms filtering AND the wizard's final booking submission will use.

### P0.2 — Room schema extension for policies/facilities
- Add fields to `rooms/{roomId}` doc: `policies` (string/rich text — cancellation policy, house rules), `checkInTime`, `checkOutTime` (if not already present — verify first), `facilities` (array of strings — hotel-wide amenities, distinct from room-specific `amenities`).
- Update `src/pages/admin/AdminRoomManagementPage.jsx` form to include input fields for these new fields.
- Existing rooms will lack these fields until manually edited — Room Overview page must handle missing/empty gracefully (no crash, show "Not specified" or hide section).

### P0.3 — Booking schema: lead guest fields
- Add `leadGuestName`, `leadGuestEmail`, `leadGuestPhone`, `arrivalTime` (nullable, default "I don't know") to `bookings/{id}` doc — separate from `guestId` (account holder) to support booking-on-behalf-of.
- `createBooking()` accepts these as new optional params, defaults to guest profile values if not overridden.

---

## Phase Breakdown

### RENO-1 — Simplify Browse Rooms cards + add date-range filter (P0.1 dependency)
- File: `src/pages/public/RoomsPage.jsx`
- Add check-in/check-out date pickers at top of page (reuse FullCalendar, scoped to a simple range-select UI — not the full booking calendar component).
- Room card content reduced to: image, name, star rating (confirm rating field exists — check reviews aggregate or room doc field), starting price, short subtitle. Remove status badges, full amenity lists, etc. from card view.
- On date selection + "Check Availability" click: call `getAvailableRooms()` (P0.1), filter displayed rooms to only available ones for that range.
- No dates selected yet: show all active rooms (unfiltered), consistent with current default behavior — don't force date selection before browsing.
- Existing type/price filters stay, layered on top of availability filter.

**Conflict watch:** existing status filter tabs (Available/Reserved/Occupied/etc, per earlier audit) — these were built for FO-style filtering, likely don't belong on guest-facing page anymore. Remove status filter tabs from guest view entirely, replace with the date-based availability filter.

**Verify:** browsing without dates shows all rooms as before. Selecting dates + clicking check → only genuinely available rooms for that range appear. Room already booked for those dates does not appear even if currently "Available" status today.

---

### RENO-2 — Rebuild Room Overview page (replaces RoomDetailPage.jsx)
- File: `src/pages/public/RoomDetailPage.jsx` (rebuilt in place, same route)
- Sections: hero image, room name/type, full description, amenities, guest reviews (existing `reviewsService.js` data), check-in/check-out times (P0.2 fields), hotel facilities (P0.2), room policies with a clickable "Cancellation Policy" modal/popover.
- Date range carries over from RENO-1 if guest arrived here after selecting dates on Browse Rooms; if arrived directly (e.g. bookmarked link, first visit), show date picker here too.
- Sticky/bottom bar: price, selected dates summary, "Book Now" button — button disabled until dates are selected.
- "Book Now" triggers `getAvailableRooms()` check (P0.1) one more time defensively (dates may be stale if guest lingered on page) before proceeding to wizard — prevents booking a room that got taken while they were reading the description.

**Conflict watch:** this file currently has proof-of-concept logic for archived-room fallback (`isRoomActive` check, "no longer available" banner per earlier gap-fix). Preserve that graceful-degradation logic in the rebuild, don't lose it.

**Verify:** page loads with full info, missing P0.2 fields show gracefully. Book Now blocked without dates. Book Now re-validates availability before proceeding — test by having two tabs, book the room in tab A, hit Book Now in tab B, confirm rejection.

---

### RENO-3 — Multi-step booking wizard (absorbs BookingPage.jsx)
- File: `src/pages/public/BookingPage.jsx` (rebuilt), likely renamed conceptually to a wizard but keep route `/booking/:roomId` for now unless a cleaner route makes sense.
- **Step 1 — Customer Information:** pre-filled from guest profile (`fullName`, `email` — check phone field exists, add if not), editable. Fields: lead guest first/last name, email, country, country code, mobile number. Note text about confirmation email. Expected arrival time selector (default "I don't know"). "Next" button.
- **Step 2 — Payment Information:** payment method selector (Phase 16's multi-method work — DO NOT rebuild, reuse that component/logic directly). Booking summary: room, dates, total price, confirmation email address, subtext confirming email will be sent. "Book Now" button triggers `createBooking()` with P0.3's new lead-guest fields + existing payment-proof flow (Phase 10-16 logic, ported not rewritten).
- **Step 3 — trigger point:** on successful `createBooking()`, immediately proceed to RENO-4 confirmation page/state. Since no real payment gateway, "Book Now" completing IS the confirmation trigger (per your original note) — no separate async wait step needed.
- Progress indicator: connected circles/steps at top, standard pattern, use existing shadcn/ui primitives (check for a Stepper-like component already in `src/components/ui/`, build minimal one if not — don't pull in a new library).

**Conflict watch:** this is the highest-risk file in the whole renovation — Phases 10 (payment proof), 11 (upload widget), 13 (immediate post-booking prompt), 14 (payment instructions), 16 (multi-method) all currently live inside or adjacent to BookingPage.jsx's existing flow. Before touching this file, get your AI agent to produce a full inventory of every function/state/effect currently in BookingPage.jsx tied to those phases, so nothing gets silently dropped during the rebuild.

**Verify:** Step 1 pre-fills correctly, editable, validates required fields before Next. Step 2 shows correct payment methods (Phase 16 intact), booking summary accurate. Book Now creates booking with correct schema (P0.3 fields + existing payment fields), fires EmailJS (Phase 12, still tied to `approveBooking()` — confirm this wizard doesn't wrongly try to fire confirmation email at creation time instead of approval time, since email is currently tied to FO approval not guest submission).

---

### RENO-4 — Booking confirmation page
- New/rebuilt view shown immediately after successful `createBooking()` in RENO-3's Step 2.
- Content: success icon, thank-you message, booking reference (booking ID), room details, dates, guest info (lead guest name/email), payment summary (method + amount + type Full/Partial), confirmation that "a confirmation email will be sent once your booking is approved" (accurate wording — actual EmailJS send is tied to approval per Phase 12, not creation — don't imply email already sent).
- This likely replaces or extends whatever the current post-Phase-13 modal/redirect behavior does (immediate payment-proof prompt). Decide: does proof upload happen ON this confirmation page (combined), or does confirmation page show first then guest proceeds to upload separately? Recommend: combine — confirmation page IS where payment proof upload lives now (this absorbs Phase 13's "immediate prompt" requirement naturally, since guest is already here).

**Verify:** confirmation shows accurate data, no false claims about email already sent, payment proof upload accessible right here (Phase 13's UX goal achieved through page placement, not a separate modal).

---

## Sequencing

1. P0.1, P0.2, P0.3 (prerequisites, can be done in parallel — different files, no interdependency)
2. RENO-1 (depends on P0.1 only)
3. RENO-2 (depends on P0.1, P0.2)
4. RENO-3 (depends on P0.3, and requires full inventory of existing BookingPage.jsx logic before touching — highest risk phase)
5. RENO-4 (depends on RENO-3 being functional)

Do not start RENO-3 until RENO-1 and RENO-2 are verified working — wizard's entry point assumes dates are already selected upstream.

## Explicitly out of scope for this renovation
- Real payment gateway integration — still manual proof-upload based (Phase 10-16 architecture unchanged, just relocated/reorganized in UI).
- Calendar library replacement — FullCalendar retained.
- Real-time (per-keystroke) availability checking — on-action check only, per agreed approach.
