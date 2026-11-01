// Xendit TEST-mode payments for HotelEase (capstone scope — no live money).
//
// Two endpoints, wired in src/index.js before the AI section:
//
//   POST /xendit/invoice   guest-facing. Verifies the guest's Firebase ID
//                          token, re-validates the booking SERVER-side
//                          (owner, status, method, deadline), computes the
//                          amount SERVER-side (deposit rule mirrors
//                          lib/paymentDetails.js), creates a Xendit hosted
//                          checkout invoice and stores its id/url on the
//                          booking. The guest never writes gateway fields.
//
//   POST /xendit/webhook   Xendit → server. The `x-callback-token` header is
//                          the gate. Only invoice.status === "PAID" flips a
//                          booking (Awaiting Payment → Pending, exactly like
//                          paymentGatewayService.completeSimulatedPayment),
//                          inside a Firestore REST transaction so duplicate
//                          webhooks are idempotent and can never double-apply.
//                          EXPIRED/UNPAID/VOIDED do nothing — abandonment is
//                          the 48h deadline sweep's job.
//
// Secrets: XENDIT_SECRET_KEY, XENDIT_WEBHOOK_TOKEN (wrangler secret put /
// .dev.vars — never in code or git). Writes bypass Firestore rules because
// they run as the service account; rules need no change.
import { resolveBookingClaimIdentity } from "./firebase-jwt.js";
import { getAllowedOrigin, json } from "./http.js";
import { getGoogleAccessToken } from "./google-auth.js";
import {
  beginFirestoreTransaction,
  commitFirestoreTransaction,
  createFirestoreDoc,
  getFirestoreDoc,
  getFirestoreDocInTransaction,
  fsValue,
  patchFirestoreDoc,
  rollbackFirestoreTransaction,
  runFirestoreQuery} from "./firestore.js";

const XENDIT_INVOICE_API = "https://api.xendit.co/v2/invoices";
const PROOF_METHODS = ["GCash", "Bank Transfer"];
const MAX_INVOICE_SECONDS = 48 * 3600; // matches the paymentDeadline cap

// Pin the invoice to the guest's chosen method so Xendit's checkout does not
// ask for the channel a second time. GCash cannot carry more than its channel
// cap — such invoices fall back to Xendit's own picker.
const INVOICE_CHANNELS = {
  GCash: ["GCASH"],
  "Bank Transfer": ["BANK_TRANSFER"],
};
const GCASH_MAX_AMOUNT = 100_000;
// PARTIAL_PAYMENT_PERCENTAGE mirrors lib/paymentDetails.js — server copy so a
// forged client payload can never influence the charged amount.
const PARTIAL_PAYMENT_PERCENTAGE = 0.5;

function fsDocName(projectId, collectionId, docId) {
  return `projects/${projectId}/databases/(default)/documents/${collectionId}/${encodeURIComponent(docId)}`;
}

/** Source-of-truth payable amount for a booking, in whole pesos. */
export function expectedAmount(fields) {
  const totalCost = Number(fsValue(fields, "totalCost") ?? 0);
  const amount = fsValue(fields, "paymentType") === "Partial"
    ? Math.round(totalCost * PARTIAL_PAYMENT_PERCENTAGE)
    : Math.round(totalCost);
  return Number.isFinite(amount) ? amount : 0;
}

// Constant-time-ish token compare — length leak is harmless; value leak is not.
function tokenEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function projectIdOf(workerEnv) {
  try {
    return JSON.parse(workerEnv.FIREBASE_SERVICE_ACCOUNT || "").project_id || null;
  } catch {
    return null;
  }
}

/**
 * The app inbox reads `notifications/{uid}/items` — the exact collection
 * notificationService.js (client) and booking-notifications.js (worker's own
 * fan-out) use. Writes bypass rules via the service account. Notification
 * docs are created at deterministic doc IDs so a retried webhook cannot
 * double-send even across races; Firestore 409 returns without writing.
 */
const NOTIF_COLLECTION_BASE = "notifications";

function roleQuery(role) {
  return {
    from: [{ collectionId: "users" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "role" },
        op: "EQUAL",
        value: { stringValue: role }}},
  };
}

/**
 * Payment notif recipients: FO only. Admin is oversight/analytics and does
 * not act on individual payments — the bell would fill with FO's own queue.
 */
async function listPaymentStaff(accessToken, projectId) {
  const docs = await runFirestoreQuery(
    accessToken, projectId, "users", roleQuery("fo"));
  return docs.map((doc) => doc.id).filter(Boolean);
}

function notifFields(nowIso, docId, title, message, link) {
  return {
    id: { stringValue: docId },
    type: { stringValue: "payment_received" },
    title: { stringValue: title },
    message: { stringValue: message },
    link: { stringValue: link },
    isRead: { booleanValue: false },
    createdAt: { timestampValue: nowIso }};
}

function guestNotifAttempt(nowIso, docId, guestId) {
  return {
    uid: guestId,
    docId,
    title: "Payment received — pending approval",
    message: "Your online payment came through. Front Office will review and approve your booking shortly.",
    link: "/my-bookings",
    nowIso};
}

function staffNotifAttempt(nowIso, docId, staffId, title, message) {
  return { uid: staffId, docId, title, message, link: "/fo/bookings", nowIso };
}

async function deliverNotifications(accessToken, projectId, attempts) {
  for (const attempt of attempts) {
    try {
      await createFirestoreDoc(
        accessToken, projectId,
        `${NOTIF_COLLECTION_BASE}/${encodeURIComponent(attempt.uid)}/items`,
        attempt.docId,
        notifFields(attempt.nowIso, attempt.docId, attempt.title, attempt.message, attempt.link));
    } catch (e) {
      // 409 (already delivered) is fine; other failures must not break the ack.
      console.error("[xendit] notification failed:", String(e?.message || e).slice(0, 200));
    }
  }
}

/**
 * Auto-read: payment supersedes the booking outbox's "payment proof
 * required" hint. Deterministic doc ID (booking_{id}_{guest}_{type}) means no
 * query. GET first — a REST PATCH on a missing doc would create a bare
 * { isRead: true } stub row; demo data / outbox gaps must stay invisible.
 */
async function markProofNotificationRead(accessToken, projectId, bookingId, guestId) {
  if (!guestId) return;
  try {
    const docPath = `booking_${bookingId}_${guestId}_payment_proof_required`;
    const snap = await getFirestoreDoc(
      accessToken, projectId,
      `${NOTIF_COLLECTION_BASE}/${encodeURIComponent(guestId)}/items`,
      docPath);
    if (!snap?.exists) return;
    await patchFirestoreDoc(
      accessToken, projectId,
      `${NOTIF_COLLECTION_BASE}/${encodeURIComponent(guestId)}/items`,
      docPath,
      { isRead: { booleanValue: true } },
      ["isRead"]);
  } catch (e) {
    console.error("[xendit] proof-notif auto-read failed:", String(e?.message || e).slice(0, 200));
  }
}

/**
 * PAID confirmation: guest + FO fan-out at `xendit-paid-<invoiceId>`.
 */
async function notifyPaymentConfirmed({ accessToken, projectId, guestId, invoiceId }) {
  const nowIso = new Date().toISOString();
  const docId = `xendit-paid-${invoiceId}`;
  const attempts = guestId
    ? [guestNotifAttempt(nowIso, docId, guestId)]
    : [];
  const staff = await listPaymentStaff(accessToken, projectId);
  for (const staffId of staff) {
    attempts.push(staffNotifAttempt(
      nowIso, docId, staffId,
      "Payment Received (Xendit test)",
      `Xendit invoice ${invoiceId} was paid. Booking is awaiting Front Office review.`));
  }
  await deliverNotifications(accessToken, projectId, attempts);
}

/**
 * Money landed in a state the webhook refuses to auto-confirm (amount
 * mismatch, a second/third paid invoice, or a cancelled booking). The
 * booking is left untouched; staff decide (refund manually). Deterministic
 * per-recipient IDs keep Xendit's retries from double-notifying.
 */
async function notifyStaffReview({
  accessToken, projectId, kind, invoiceId, bookingId, detail }) {
  const nowIso = new Date().toISOString();
  const docId = {
    review: `xendit-review-${invoiceId}`,
    doublepay: `xendit-doublepaid-${invoiceId}`,
    cancelled: `xendit-cancelled-${invoiceId}`}[kind];
  if (!docId) return;
  const title = {
    review: "Payment review needed (Xendit test)",
    doublepay: "Duplicate payment received (Xendit test)",
    cancelled: "Payment on cancelled booking (Xendit test)"}[kind];
  const message = {
    review: `Xendit invoice ${invoiceId} for booking ${bookingId} was paid ${detail}. The booking was NOT confirmed — record a manual proof or refund.`,
    doublepay: `Xendit invoice ${invoiceId} for booking ${bookingId} was paid while the booking is already under review. Refund the extra payment manually.`,
    cancelled: `Xendit invoice ${invoiceId} for booking ${bookingId} was paid after the booking was cancelled. Refund manually.`}[kind];
  const staff = await listPaymentStaff(accessToken, projectId);
  await deliverNotifications(
    accessToken, projectId,
    staff.map((staffId) => staffNotifAttempt(nowIso, docId, staffId, title, message)));
}

/** Guest redirect target: the My Bookings page (its deep-link auto-expand). */
function redirectUrls(origin, bookingId) {
  if (!origin) return {};
  return {
    success_redirect_url: `${origin}/my-bookings?bookingId=${bookingId}&xendit=paid`,
    failure_redirect_url: `${origin}/my-bookings?bookingId=${bookingId}&xendit=failed`};
}

/**
 * POST /xendit/invoice — start the hosted test checkout for one booking.
 * Returns { ok, invoiceId, invoiceUrl }; the client assigns the URL and the
 * guest leaves the app for Xendit's sandbox.
 */
export async function handleXenditInvoiceRequest(request, workerEnv) {
  if (!workerEnv.XENDIT_SECRET_KEY) {
    return json({ error: "Online payment is not configured." }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "bookingId") ||
    typeof body.bookingId !== "string" ||
    !body.bookingId || body.bookingId.length > 256
  ) {
    return json({ error: "Invalid payment request." }, 400);
  }

  const identity = await resolveBookingClaimIdentity(request, workerEnv);
  if (!identity) return json({ error: "Sign in required." }, 401);
  if (identity.isAnonymous) return json({ error: "Sign in to pay online." }, 403);

  const projectId = projectIdOf(workerEnv);
  if (!projectId) return json({ error: "Payment service is not configured." }, 503);

  // Firestore/token failures are infra errors → 502, so the client sees a
  // retryable upstream outage instead of an unhandled template crash.
  let accessToken;
  let booking;
  try {
    accessToken = await getGoogleAccessToken(workerEnv.FIREBASE_SERVICE_ACCOUNT);
    booking = await getFirestoreDoc(accessToken, projectId, "bookings", body.bookingId);
  } catch (e) {
    console.error("[xendit] firestore/token failure before invoice:", String(e?.message || e).slice(0, 200));
    return json({ error: "Payment service is unavailable. Try again shortly." }, 502);
  }
  if (!booking.exists) return json({ error: "Booking not found." }, 404);

  const fields = booking.fields;
  if (fsValue(fields, "guestId") !== identity.uid) {
    return json({ error: "You can only pay for your own bookings." }, 403);
  }
  if (fsValue(fields, "status") !== "Awaiting Payment") {
    return json({
      error: "This booking is not awaiting payment — it may already be paid, approved, or cancelled."}, 409);
  }
  const method = fsValue(fields, "paymentMethod");
  if (!PROOF_METHODS.includes(method)) {
    return json({ error: "This booking method does not use the online checkout." }, 409);
  }
  const amount = expectedAmount(fields);
  if (!(amount > 0)) return json({ error: "Booking has no payable amount." }, 409);

  // Invoice lifetime is capped by the booking's payment deadline so a paid
  // invoice can never outlive the hotel's own hold/expiration logic. With
  // under a minute left, refuse instead of extending the payment window.
  const deadlineIso = fsValue(fields, "paymentDeadline");
  const deadlineMs = deadlineIso ? new Date(deadlineIso).getTime() : NaN;
  const secondsLeft = Number.isFinite(deadlineMs)
    ? Math.floor((deadlineMs - Date.now()) / 1000)
    : MAX_INVOICE_SECONDS;
  if (secondsLeft <= 0) {
    return json({ error: "This payment hold has expired — booking will be cancelled." }, 409);
  }
  if (secondsLeft < 60) {
    return json({ error: "Payment hold is about to expire — please create a new booking." }, 409);
  }

  // Stored-invoice handling. Payability depends on the live status probe, so:
  // probe fails → retryable 502 (a replacement create would supersede an
  // invoice whose state we do not know); confirmed payable → reuse; confirmed
  // non-payable or amount-drifted → fresh create below. Amount must match the
  // current expected total — Xendit v2 has no expire/update-amount endpoint,
  // and the webhook's amount-mismatch staff review backstops a late payment
  // of the superseded invoice.
  // ponytail: two parallel clicks can still race two invoices (serial reuse
  // only) — upgrade path: transaction claim on xenditInvoiceId.
  const storedInvoiceId = fsValue(fields, "xenditInvoiceId");
  const lookupUnavailable = { error: "Payment service is unavailable. Try again shortly." };
  if (storedInvoiceId) {
    let existing;
    try {
      const respGet = await fetch(`${XENDIT_INVOICE_API}/${storedInvoiceId}`, {
        method: "GET",
        headers: { Authorization: `Basic ${btoa(`${workerEnv.XENDIT_SECRET_KEY}:`)}`}});
      if (!respGet.ok) {
        console.error(`[xendit] stored invoice lookup failed (${respGet.status})`);
        return json(lookupUnavailable, 502);
      }
      existing = await respGet.json().catch(() => null);
    } catch (e) {
      console.error("[xendit] stored invoice lookup failed:", String(e?.message || e).slice(0, 200));
      return json(lookupUnavailable, 502);
    }
    if (!existing?.invoice_url) {
      console.error(`[xendit] stored invoice lookup returned no usable body for ${storedInvoiceId}`);
      return json(lookupUnavailable, 502);
    }
    if (Number(existing.amount) !== amount) {
      console.warn(
        `[xendit] stored invoice ${storedInvoiceId} amount ${existing.amount} != expected ${amount} — replacing it`);
    } else if (["PENDING", "ACTIVE", "UNPAID"].includes(existing.status)) {
      return json({ ok: true, invoiceId: String(existing.id), invoiceUrl: String(existing.invoice_url) });
    }
  }

  const origin = getAllowedOrigin(request, workerEnv);
  const overGCashCap = method === "GCash" && amount > GCASH_MAX_AMOUNT;
  const invoiceChannel = overGCashCap ? null : INVOICE_CHANNELS[method];
  let resp;
  try {
    resp = await fetch(XENDIT_INVOICE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${workerEnv.XENDIT_SECRET_KEY}:`)}`},
      body: JSON.stringify({
        external_id: body.bookingId,
        amount,
        currency: "PHP",
        description: `HotelEase booking ${body.bookingId} (${method})`,
        invoice_duration: Math.min(secondsLeft, MAX_INVOICE_SECONDS),
        ...(invoiceChannel ? { payment_methods: invoiceChannel } : {}),
        ...redirectUrls(origin, body.bookingId)})});
  } catch (e) {
    console.error("[xendit] invoice API unreachable:", String(e?.message || e).slice(0, 200));
    return json({ error: "Payment provider could not be reached. Try again." }, 502);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(`[xendit] invoice create failed (${resp.status}): ${text.slice(0, 300)}`);
    return json({ error: "Payment provider rejected the request." }, 502);
  }
  const invoice = await resp.json().catch(() => null);
  if (!invoice?.id || !invoice?.invoice_url) {
    return json({ error: "Payment provider returned an invalid response." }, 502);
  }

  // Store the reference server-side (service-account write — no rules change).
  await patchFirestoreDoc(
    accessToken, projectId, "bookings", body.bookingId,
    {
      xenditInvoiceId: { stringValue: String(invoice.id) },
      xenditInvoiceUrl: { stringValue: String(invoice.invoice_url) },
      updatedAt: { timestampValue: new Date().toISOString()}},
    ["xenditInvoiceId", "xenditInvoiceUrl", "updatedAt"]);

  return json({ ok: true, invoiceId: String(invoice.id), invoiceUrl: String(invoice.invoice_url) });
}

/**
 * POST /xendit/webhook — server-side payment confirmation. Idempotent by
 * transaction re-read: a duplicate PAID callback commits nothing and is
 * acknowledged 200 so Xendit stops retrying.
 */
export async function handleXenditWebhookRequest(request, workerEnv) {
  const received = request.headers.get("x-callback-token") || "";
  if (!workerEnv.XENDIT_WEBHOOK_TOKEN ||
      !tokenEqual(received, workerEnv.XENDIT_WEBHOOK_TOKEN)) {
    return json({ ok: false, error: "Invalid callback token." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const data = body?.data ?? body ?? {};
  const status = data?.status ?? null;
  const invoiceId = data?.id ?? null;
  const bookingId = data?.external_id ?? null;
  const paidAmount = Number(data?.paid_amount ?? 0);
  if (!status || !invoiceId || !bookingId) {
    return json({ ok: false, ignored: "invalid_payload" }, 200);
  }

  // ONLY a PAID invoice may move a booking. Unpaid/expired/voided never do.
  if (status !== "PAID") {
    console.log(`[xendit] ignored invoice ${invoiceId} webhook (status ${status})`);
    return json({ ok: true, ignored: status }, 200);
  }

  const projectId = projectIdOf(workerEnv);
  if (!projectId) return json({ error: "Payment service is not configured." }, 503);
  const accessToken = await getGoogleAccessToken(workerEnv.FIREBASE_SERVICE_ACCOUNT);

  // Any unexpected failure here yields a clean logged 500 — Xendit retries
  // and the idempotent transaction read converges. Never 200 on a failed
  // commit: that would stop retrying and silently drop a real payment.
  try {
    const trx = await beginFirestoreTransaction(accessToken, projectId);
    const snap = await getFirestoreDocInTransaction(
      accessToken, projectId, `bookings/${bookingId}`, trx);

    if (!snap.exists) {
      await rollbackFirestoreTransaction(accessToken, projectId, trx);
      console.error(`[xendit] paid invoice ${invoiceId} references missing booking ${bookingId}`);
      return json({ ok: true, ignored: "booking_not_found" }, 200);
    }

    const fields = snap.fields;
    const bookingStatus = fsValue(fields, "status");

    // Idempotency: this exact invoice already drove the transition, whatever
    // the booking's status is now (Pending, Approved, … later changes). A
    // replay stays a clean ack; a DIFFERENT invoice still falls through to
    // the staff-review branch below.
    if (fsValue(fields, "gatewayRef") === String(invoiceId) &&
        fsValue(fields, "paymentGateway") === "xendit") {
      await rollbackFirestoreTransaction(accessToken, projectId, trx);
      return json({ ok: true, already: true, bookingId }, 200);
    }

    // A second distinct invoice paying an already-paid booking = staff refund,
    // not automatic confirmation.
    if (bookingStatus !== "Awaiting Payment") {
      await rollbackFirestoreTransaction(accessToken, projectId, trx);
      console.warn(`[xendit] paid invoice ${invoiceId} for ${bookingId} in status ${bookingStatus} — not confirming`);
      const isCancelled = bookingStatus === "Cancelled";
      try {
        await notifyStaffReview({
          accessToken, projectId,
          kind: isCancelled ? "cancelled" : "doublepay",
          invoiceId, bookingId});
      } catch (e) {
        console.error("[xendit] review notification failed:", String(e?.message || e).slice(0, 200));
      }
      return json({ ok: true, ignored: isCancelled ? "Cancelled" : "already_awaiting_review" }, 200);
    }

    // Money guard: the paid amount must equal the server-computed expectation.
    const expected = expectedAmount(fields);
    if (expected <= 0 || Math.round(paidAmount) !== expected) {
      await rollbackFirestoreTransaction(accessToken, projectId, trx);
      console.error(
        `[xendit] AMOUNT MISMATCH booking ${bookingId}: paid ${paidAmount}, expected ${expected} — booking NOT confirmed, staff must review`);
      try {
        await notifyStaffReview({
          accessToken, projectId, kind: "review", invoiceId, bookingId,
          detail: `${paidAmount} (expected ${expected})`});
      } catch (e) {
        console.error("[xendit] review notification failed:", String(e?.message || e).slice(0, 200));
      }
      return json({ ok: false, error: "Amount mismatch — booking not confirmed." }, 200);
    }

    // The webhook must be the invoice the booking actually started: a PAID
    // callback for some other invoice (superseded by a later click) is extra
    // money, never a confirmation.
    const storedInvoiceId = fsValue(fields, "xenditInvoiceId");
    if (storedInvoiceId && String(invoiceId) !== String(storedInvoiceId)) {
      await rollbackFirestoreTransaction(accessToken, projectId, trx);
      console.warn(`[xendit] paid invoice ${invoiceId} does not match stored ${storedInvoiceId} for ${bookingId} — not confirming`);
      try {
        await notifyStaffReview({
          accessToken, projectId, kind: "doublepay", invoiceId, bookingId});
      } catch (e) {
        console.error("[xendit] review notification failed:", String(e?.message || e).slice(0, 200));
      }
      return json({ ok: true, ignored: "stale_invoice" }, 200);
    }

    const nowIso = new Date().toISOString();
    await commitFirestoreTransaction(accessToken, projectId, trx, [{
      update: {
        name: fsDocName(projectId, "bookings", bookingId),
        fields: {
          status: { stringValue: "Pending" },
          paymentGateway: { stringValue: "xendit" },
          gatewayRef: { stringValue: String(invoiceId) },
          // The confirmed amount, integer pesos — approveBooking records the
          // payment from this instead of re-deriving it from totalCost.
          xenditPaidAmount: { integerValue: expected },
          paidAt: { timestampValue: nowIso },
          xenditPaidAt: { timestampValue: nowIso },
          updatedAt: { timestampValue: nowIso}}},
      // Partial mask — never replace the whole booking document.
      updateMask: { fieldPaths: ["status", "paymentGateway", "gatewayRef", "xenditPaidAmount", "paidAt", "xenditPaidAt", "updatedAt"] }}]);

    // The booking is still a live hold while FO reviews it. Refresh its night
    // markers so the guest calendar stops saying "Awaiting Payment".
    try {
      const markers = await runFirestoreQuery(accessToken, projectId, "room_availability", {
        from: [{ collectionId: "room_availability" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "bookingId" },
            op: "EQUAL",
            value: { stringValue: bookingId }}}});
      await Promise.all(markers.map((marker) => patchFirestoreDoc(
        accessToken,
        projectId,
        "room_availability",
        marker.id,
        {
          status: { stringValue: "Pending" },
          updatedAt: { timestampValue: nowIso }},
        ["status", "updatedAt"])));
    } catch (e) {
      console.error("[xendit] marker refresh failed:", String(e?.message || e).slice(0, 200));
    }

    try {
      await markProofNotificationRead(
        accessToken, projectId, bookingId, fsValue(fields, "guestId"));
      await notifyPaymentConfirmed({
        accessToken, projectId, invoiceId,
        guestId: fsValue(fields, "guestId")});
    } catch (e) {
      console.error("[xendit] notification fan-out failed:", String(e?.message || e).slice(0, 200));
    }

    return json({ ok: true, bookingId }, 200);
  } catch (e) {
    console.error("[xendit] webhook processing failed:", String(e?.message || e).slice(0, 300));
    return json({ ok: false, error: "Payment confirmation failed. Xendit will retry." }, 500);
  }
}
