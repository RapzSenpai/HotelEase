# Xendit Test-Mode Payments — Setup

Xendit runs in **TEST mode only** for this capstone. No live keys, no real
money, nothing chargeable. The integration is OFF until you add the env flag
below — with it absent, the existing simulated checkout page is used exactly
as before.

## What you need from Xendit (free test account)

1. Sign up at dashboard.xendit.com and stay in **test / development** mode
   (toggle in the dashboard header). Test mode is marked everywhere and never
   touches real funds.
2. Copy the **secret key** starting with `xnd_development_` (Dashboard →
   Settings → API Keys). That is the WORKER credential, never the frontend.
3. Create an integration under **Settings → Webhooks**:
   - Invoices URL: `https://<your-worker>.workers.dev/xendit/webhook`
     (local dev: `http://localhost:8787/xendit/webhook` behind a tunnel — or
     test webhooks against the deployed worker after approval).
   - Copy the **callback verification token** Xendit shows there.

## Where the secrets live (never in code, never in git)

| Secret | Local dev | Production |
| --- | --- | --- |
| `XENDIT_SECRET_KEY` | `worker/.dev.vars` (gitignored) | `npx wrangler secret put XENDIT_SECRET_KEY` |
| `XENDIT_WEBHOOK_TOKEN` | `worker/.dev.vars` | `npx wrangler secret put XENDIT_WEBHOOK_TOKEN` |

`worker/.dev.vars` format:

```
XENDIT_SECRET_KEY=xnd_development_xxx
XENDIT_WEBHOOK_TOKEN=wh_token_xxx
```

The Worker already has `FIREBASE_SERVICE_ACCOUNT` configured — nothing there
changes. Firestore rules need **no changes** (worker writes use the service
account and bypass rules by design).

## Turning the guest-facing button on

In the app `.env` (gitignored):

```
VITE_XENDIT_ENABLED=1
```

`VITE_GROQ_PROXY_URL` (already in use) must point at the Worker. Without the
`VITE_XENDIT_ENABLED` flag the app keeps the existing simulated payment page —
the demo mode is untouched.

## Guest flow while the flag is on

1. Book a GCash/Bank-Transfer stay as usual → status **Awaiting Payment**.
2. "Pay Online via GCash" → Worker verifies the signed-in guest, validates the
   booking **server-side** (owner, status, method, payment deadline) and
   computes the amount **server-side** (Full = total; Partial = 50% deposit).
3. Browser opens Xendit's hosted test checkout (sandbox amounts). The redirect
   back lands on `/my-bookings?bookingId=…`, which opens with the booking card
   already expanded.
4. Xendit fires the webhook; the Worker verifies the callback token inside a
   Firestore **transaction** and — only for `PAID` — flips the booking to
   **Pending** (like the simulated gateway does) and notifies guest + FO.
   Duplicate callbacks commit nothing (idempotent).
5. FO approves as normal → payment record auto-added with source
   `xendit_test` ("Online" badge) and note "Initial payment via Xendit test
   invoice". Refunds keep working exactly as with proof uploads.

During the Xendit test checkout use the sandbox controls ("Test Payment
Success" / test failure simulators) — they exercise real webhook traffic.

## What the demo proves

- Server-side verification: closing the browser tab or killing the redirect
  does NOT confirm payment — only the Xendit webhook does.
- Idempotency: a repeated webhook is acknowledged without side effects.
- Failed/expired invoices never mark anything paid (statuses ≠ PAID are
  ignored; the existing 48h deadline sweep still owns abandonment).
- Approval is not bypassed: a paid booking still sits in Pending until FO
  approves.

## Known limitations

- Webhook URL must be publicly reachable → test against the deployed worker
  (deploying requires your explicit approval) or a local tunnel.
- Two different invoices paid for the same booking (double payment) is flagged
  in FO notifications and left for manual refund handling.
- Payment received for an already-cancelled booking is logged loudly; staff
  refund manually.
- Invoice lifetime is capped at what remains of the payment deadline (min ~1
  min — a hold with under a minute left is rejected instead, max 48 h).
