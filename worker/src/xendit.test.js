import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Xendit test-mode integration (worker). firestore/google-auth/firebase-jwt
 * are mocked at module seams (same idiom as sweeps.test.js); the Xendit REST
 * API is fetch-stubbed. Money rules under test:
 *   - webhook token is the gate (401 otherwise)
 *   - ONLY invoice.status === "PAID" may flip a booking
 *   - duplicate PAID webhooks are idempotent (no second transition, no writes)
 *   - amount mismatch / wrong booking state never flip the booking
 */

const mocks = vi.hoisted(() => ({
  getGoogleAccessToken: vi.fn(),
  resolveBookingClaimIdentity: vi.fn()}));

vi.mock("./google-auth.js", () => ({
  getGoogleAccessToken: mocks.getGoogleAccessToken}));

vi.mock("./firebase-jwt.js", () => ({
  resolveBookingClaimIdentity: mocks.resolveBookingClaimIdentity}));

vi.mock("./firestore.js", () => ({
  beginFirestoreTransaction: vi.fn(async () => "tx-1"),
  getFirestoreDoc: vi.fn(),
  getFirestoreDocInTransaction: vi.fn(),
  commitFirestoreTransaction: vi.fn(async () => ({})),
  rollbackFirestoreTransaction: vi.fn(async () => ({})),
  createFirestoreDoc: vi.fn(async () => true),
  patchFirestoreDoc: vi.fn(),
  runFirestoreQuery: vi.fn(async () => []),
  fsValue: (fields, key) => {
    const v = fields?.[key];
    if (!v) return undefined;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.timestampValue !== undefined) return v.timestampValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.booleanValue !== undefined) return v.booleanValue;
    return undefined;
  }}));

import {
  handleXenditInvoiceRequest,
  handleXenditWebhookRequest} from "./xendit.js";
import {
  beginFirestoreTransaction,
  commitFirestoreTransaction,
  createFirestoreDoc,
  getFirestoreDoc,
  getFirestoreDocInTransaction,
  patchFirestoreDoc,
  runFirestoreQuery} from "./firestore.js";

const env = {
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "test-project" }),
  XENDIT_SECRET_KEY: "xnd_development_test",
  XENDIT_WEBHOOK_TOKEN: "wh-token-123"};

function bookingFS(overrides = {}) {
  const fields = {
    guestId: { stringValue: "guest-1" },
    status: { stringValue: "Awaiting Payment" },
    paymentMethod: { stringValue: "GCash" },
    paymentType: { stringValue: "Full" },
    totalCost: { doubleValue: 3000 },
    paymentDeadline: {
      timestampValue: new Date(Date.now() + 48 * 3600 * 1000).toISOString()},
    ...overrides};
  return { exists: true, fields };
}

function webhookRequestP(payload, token = "wh-token-123") {
  const headers = new Map(token === null ? [] : [["x-callback-token", token]]);
  return {
    headers: { get: (name) => headers.get(String(name).toLowerCase()) || null },
    json: async () => payload};
}

function invoiceRequest({ uid = "guest-1", body = { bookingId: "bk-1" } } = {}) {
  const headers = new Map(
    uid ? [["x-he-auth", `Bearer token-${uid}`]] : []);
  // Browsers always send Origin on fetch; use one getAllowedOrigin() accepts.
  headers.set("origin", "https://hotelease-9e3a0.web.app");
  return {
    headers: { get: (name) => headers.get(String(name).toLowerCase()) || null },
    json: async () => body};
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.getGoogleAccessToken.mockResolvedValue("google-token");
  getFirestoreDoc.mockResolvedValue({ exists: false, fields: {} });
  getFirestoreDocInTransaction.mockResolvedValue({
    exists: false, fields: {}, updateTime: null});
  runFirestoreQuery.mockResolvedValue([]);
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => ({
      id: "inv-123",
      invoice_url: "https://checkout.xendit.co/web/inv-123",
      status: "PENDING"}),
    text: async () => ""}));
  vi.stubGlobal("fetch", fetchMock);
});

function xenditCall() {
  const mocks = vi.mocked(globalThis.fetch);
  return mocks.mock.calls.filter((c) => String(c[0]).includes("xendit.co"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook — Xendit → worker (server-side truth)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /xendit/webhook — verify payment server-side", () => {
  it("rejects callbacks without the configured token", async () => {
    const res = await handleXenditWebhookRequest(
      webhookRequestP({ status: "PAID", id: "inv-1", external_id: "bk-1" }, null),
      env);
    expect(res.status).toBe(401);
    expect(beginFirestoreTransaction).not.toHaveBeenCalled();
  });

  it("rejects callbacks with a wrong token", async () => {
    const res = await handleXenditWebhookRequest(
      webhookRequestP({ status: "PAID" }, "wrong-token"),
      env);
    expect(res.status).toBe(401);
  });

  it("never marks a booking paid for EXPIRED / UNPAID / VOIDED invoices", async () => {
    for (const status of ["EXPIRED", "UNPAID", "VOIDED"]) {
      beginFirestoreTransaction.mockClear();
      await handleXenditWebhookRequest(
        webhookRequestP({ status, id: "inv-1", external_id: "bk-1" }),
        env);
      expect(beginFirestoreTransaction).not.toHaveBeenCalled();
    }
  });

  it("confirms a PAID invoice: Awaiting Payment → Pending with gateway fields", async () => {
    getFirestoreDocInTransaction.mockResolvedValue(bookingFS());
    // Auto-read existence check for the notifications subcollection doc.
    getFirestoreDoc.mockResolvedValue({ exists: true, fields: {} });
    runFirestoreQuery.mockResolvedValue([
      { id: "fo-1", fields: { role: { stringValue: "fo" } } }]);

    const res = await handleXenditWebhookRequest(
      webhookRequestP({
        status: "PAID",
        id: "inv-123",
        external_id: "bk-1",
        paid_amount: 3000}),
      env);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(commitFirestoreTransaction).toHaveBeenCalledTimes(1);
    const write = commitFirestoreTransaction.mock.calls[0][3][0];
    expect(write.update.fields.status).toEqual({ stringValue: "Pending" });
    expect(write.update.fields.paymentGateway).toEqual({ stringValue: "xendit" });
    expect(write.update.fields.gatewayRef).toEqual({ stringValue: "inv-123" });
    expect(write.update.fields.paidAt.timestampValue).toBeTruthy();
    // The confirmed amount is stored server-side; approveBooking records the
    // payment from this field instead of recomputing from totalCost.
    expect(write.update.fields.xenditPaidAmount).toEqual({ integerValue: 3000 });
    // One partial mask — never a full-document replace.
    expect(write.updateMask.fieldPaths).toContain("status");
    expect(write.updateMask.fieldPaths).toContain("xenditPaidAmount");

    // Staff listing queries FO only — admins don't receive payment notifs
    // (analytics + oversight role), so the query set must be exactly ["fo"].
    const roleQueries = runFirestoreQuery.mock.calls.filter(
      (call) => call[3]?.where?.fieldFilter);
    expect(roleQueries.map((call) => call[3].where.fieldFilter.value.stringValue))
      .toEqual(["fo"]);
    expect(roleQueries[0][3].where.fieldFilter.field.fieldPath).toBe("role");

    // Deterministic notification docs in the REAL app inbox
    // (notifications/{uid}/items — see notificationService.js) so webhook
    // retries can't double-send. An admin user in the staff query result
    // never receives a payment notif.
    expect(createFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/guest-1/items",
      "xendit-paid-inv-123", expect.anything());
    expect(createFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/fo-1/items",
      "xendit-paid-inv-123", expect.anything());
    expect(createFirestoreDoc).not.toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/admin-1/items",
      expect.anything(), expect.anything());

    // Auto-read: the guest's "payment proof required" hint flips to read the
    // moment payment confirms — deterministic doc ID from the booking
    // notification outbox (booking_{id}_{uid}_{type}). Existence-checked first:
    // a REST PATCH on a missing doc would CREATE a bare { isRead: true } stub.
    expect(patchFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/guest-1/items",
      "booking_bk-1_guest-1_payment_proof_required",
      { isRead: { booleanValue: true } },
      ["isRead"]);
  });

  it("auto-read skips when the proof-required hint doc was never created", async () => {
    getFirestoreDocInTransaction.mockResolvedValue(bookingFS());
    getFirestoreDoc.mockResolvedValue({ exists: false, fields: {} });

    await handleXenditWebhookRequest(
      webhookRequestP({
        status: "PAID",
        id: "inv-123",
        external_id: "bk-1",
        paid_amount: 3000}),
      env);

    // PATCH on a missing REST doc would create a bare { isRead: true } stub
    // row in the guest's inbox — refuse instead.
    expect(patchFirestoreDoc).not.toHaveBeenCalled();
    // Guest + FO payment confirmation notifications still deliver.
    expect(createFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/guest-1/items",
      "xendit-paid-inv-123", expect.anything());
  });

  it("acks a duplicate PAID webhook without writing again", async () => {
    for (const status of ["Pending", "Approved"]) {
      // Any later status the booking reached (Approval, check-in flow) must
      // stay idempotent for THE SAME invoice — only a different invoice id is
      // the double-pay case.
      getFirestoreDocInTransaction.mockResolvedValue(bookingFS({
        status: { stringValue: status },
        paymentGateway: { stringValue: "xendit" },
        gatewayRef: { stringValue: "inv-123" }}));

      const res = await handleXenditWebhookRequest(
        webhookRequestP({
          status: "PAID", id: "inv-123", external_id: "bk-1", paid_amount: 3000}),
        env);
      const body = await res.json();

      expect(body.already).toBe(true);
      expect(commitFirestoreTransaction).not.toHaveBeenCalled();
      expect(createFirestoreDoc).not.toHaveBeenCalled();
    }
  });

  it("never flips a different invoice id that already paid once", async () => {
    // Booking already went Pending via a DIFFERENT invoice — double payment is
    // staff-refund territory, not automatic confirmation.
    getFirestoreDocInTransaction.mockResolvedValue(bookingFS({
      status: { stringValue: "Pending" },
      paymentGateway: { stringValue: "xendit" },
      gatewayRef: { stringValue: "inv-999" }}));
    runFirestoreQuery.mockResolvedValue([{ id: "fo-1", fields: {} }]);

    const res = await handleXenditWebhookRequest(
      webhookRequestP({
        status: "PAID", id: "inv-123", external_id: "bk-1", paid_amount: 3000}),
      env);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ignored: "already_awaiting_review" });
    expect(commitFirestoreTransaction).not.toHaveBeenCalled();
    // Staff still get the double-payment signal (refund territory).
    expect(createFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/fo-1/items",
      "xendit-doublepaid-inv-123", expect.anything());
  });

  it("does not resurrect a Cancelled booking (deadline sweep already owned it)", async () => {
    getFirestoreDocInTransaction.mockResolvedValue(bookingFS({
      status: { stringValue: "Cancelled" },
      rejectionReason: { stringValue: "Payment deadline expired" }}));
    runFirestoreQuery.mockResolvedValue([{ id: "fo-1", fields: {} }]);

    const res = await handleXenditWebhookRequest(
      webhookRequestP({
        status: "PAID", id: "inv-123", external_id: "bk-1", paid_amount: 3000}),
      env);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ignored: "Cancelled" });
    expect(commitFirestoreTransaction).not.toHaveBeenCalled();
    // Money on a dead hold = refund territory; staff must be notified.
    expect(createFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/fo-1/items",
      "xendit-cancelled-inv-123", expect.anything());
  });

  it("refuses to confirm when the paid amount does not match the booking price", async () => {
    getFirestoreDocInTransaction.mockResolvedValue(bookingFS()); // ₱3,000 Full
    runFirestoreQuery.mockResolvedValue([{ id: "fo-1", fields: {} }]);

    const res = await handleXenditWebhookRequest(
      webhookRequestP({
        status: "PAID", id: "inv-123", external_id: "bk-1", paid_amount: 300}),
      env);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(commitFirestoreTransaction).not.toHaveBeenCalled();
    // Amount mismatch = "review needed", never a silent drop.
    expect(createFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/fo-1/items",
      "xendit-review-inv-123", expect.anything());
  });

  it("refuses a PAID invoice that is not the one the booking started with", async () => {
    // The guest clicked twice; the older (superseded) invoice was paid.
    getFirestoreDocInTransaction.mockResolvedValue(bookingFS({
      xenditInvoiceId: { stringValue: "inv-999" }}));
    runFirestoreQuery.mockResolvedValue([{ id: "fo-1", fields: {} }]);

    const res = await handleXenditWebhookRequest(
      webhookRequestP({
        status: "PAID", id: "inv-123", external_id: "bk-1", paid_amount: 3000}),
      env);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ignored: "stale_invoice" });
    expect(commitFirestoreTransaction).not.toHaveBeenCalled();
    expect(createFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "notifications/fo-1/items",
      "xendit-doublepaid-inv-123", expect.anything());
  });

  it("answers 500 (retryable) instead of crashing when the transaction commit fails", async () => {
    getFirestoreDocInTransaction.mockResolvedValue(bookingFS());
    commitFirestoreTransaction.mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { status: 409 }));

    const res = await handleXenditWebhookRequest(
      webhookRequestP({
        status: "PAID", id: "inv-123", external_id: "bk-1", paid_amount: 3000}),
      env);
    // Xendit retries 500s; the next attempt sees the winning commit (already)
    // or another failure — either way the handler stays idempotent.
    expect([500, 200]).toContain(res.status);
    expect(res.status).toBe(500);
  });

  it("confirms a Partial booking only at the 50% deposit amount", async () => {
    getFirestoreDocInTransaction.mockResolvedValue(bookingFS({
      paymentType: { stringValue: "Partial" }}));
    runFirestoreQuery.mockResolvedValue([]);

    const res = await handleXenditWebhookRequest(
      webhookRequestP({
        status: "PAID", id: "inv-123", external_id: "bk-1", paid_amount: 1500}),
      env);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(commitFirestoreTransaction).toHaveBeenCalledTimes(1);
  });

  it("tolerates a bad body instead of crashing into a retry loop", async () => {
    const res = await handleXenditWebhookRequest(webhookRequestP({}), env);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, ignored: "invalid_payload" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invoice creation — guest → worker → Xendit
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /xendit/invoice — hosted test checkout", () => {
  it("requires a signed-in guest", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue(null);
    const res = await handleXenditInvoiceRequest(invoiceRequest({ uid: null }), env);
    expect(res.status).toBe(401);
  });

  it("blocks anonymous sessions and other guests' bookings", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({
      uid: "anon-1", isAnonymous: true});
    const res = await handleXenditInvoiceRequest(
      invoiceRequest({ uid: "anon-1", anon: true }), env);
    expect(res.status).toBe(403);

    getFirestoreDoc.mockResolvedValue(bookingFS({ guestId: { stringValue: "someone-else" } }));
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    const res2 = await handleXenditInvoiceRequest(invoiceRequest(), env);
    expect(res2.status).toBe(403);
  });

  it("refuses non-Awaiting-Payment bookings and non-proof methods", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    getFirestoreDoc.mockResolvedValue(
      bookingFS({ status: { stringValue: "Checked In" } }));
    const res = await handleXenditInvoiceRequest(invoiceRequest(), env);
    expect(res.status).toBe(409);

    getFirestoreDoc.mockResolvedValue(
      bookingFS({ paymentMethod: { stringValue: "Over-the-Counter" } }));
    const res2 = await handleXenditInvoiceRequest(invoiceRequest(), env);
    expect(res2.status).toBe(409);
  });

  it("refuses to invoice past-deadline holds", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    getFirestoreDoc.mockResolvedValue(bookingFS({
      paymentDeadline: { timestampValue: new Date(Date.now() - 1000).toISOString() }}));
    const res = await handleXenditInvoiceRequest(invoiceRequest(), env);
    expect(res.status).toBe(409);
    expect(xenditCall()).toHaveLength(0);
  });

  it("refuses to invoice when under a minute remains instead of extending the hold", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    getFirestoreDoc.mockResolvedValue(bookingFS({
      paymentDeadline: { timestampValue: new Date(Date.now() + 30 * 1000).toISOString() }}));
    const res = await handleXenditInvoiceRequest(invoiceRequest(), env);
    expect(res.status).toBe(409);
    expect(xenditCall()).toHaveLength(0);
  });

  it("creates the invoice from SERVER-computed amounts and stores the reference", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    getFirestoreDoc.mockResolvedValue(bookingFS()); // Full ₱3,000

    const res = await handleXenditInvoiceRequest(invoiceRequest(), env);
    const body = await res.json();

    expect(body).toMatchObject({
      ok: true,
      invoiceId: "inv-123",
      invoiceUrl: "https://checkout.xendit.co/web/inv-123"});
    expect(xenditCall()).toHaveLength(1);
    const [url, init] = xenditCall()[0];
    expect(String(url)).toBe("https://api.xendit.co/v2/invoices");
    expect(init.headers.Authorization).toContain("Basic ");
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      external_id: "bk-1",
      amount: 3000,
      currency: "PHP"});
    // Option A: the invoice is pinned to the guest's chosen method so Xendit's
    // checkout never asks for the channel a second time.
    expect(payload.payment_methods).toEqual(["GCASH"]);
    expect(payload.invoice_duration).toBeLessThanOrEqual(48 * 3600);
    expect(payload.success_redirect_url).toContain("/my-bookings?bookingId=bk-1");
    // Reference stored server-side — the guest never writes gateway fields.
    expect(patchFirestoreDoc).toHaveBeenCalledWith(
      "google-token", "test-project", "bookings", "bk-1",
      expect.objectContaining({
        xenditInvoiceId: { stringValue: "inv-123" }}),
      expect.anything());
  });

  it("charges the 50% deposit for Partial bookings", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    getFirestoreDoc.mockResolvedValue(bookingFS({
      paymentType: { stringValue: "Partial" }}));

    await handleXenditInvoiceRequest(invoiceRequest(), env);
    const payload = JSON.parse(xenditCall()[0][1].body);
    expect(payload.amount).toBe(1500);
  });

  it("pins a Bank Transfer booking to the BANK_TRANSFER channel", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    getFirestoreDoc.mockResolvedValue(bookingFS({
      paymentMethod: { stringValue: "Bank Transfer" }}));

    await handleXenditInvoiceRequest(invoiceRequest(), env);
    const payload = JSON.parse(xenditCall()[0][1].body);
    expect(payload.payment_methods).toEqual(["BANK_TRANSFER"]);
  });

  it("drops the channel pin when GCash cannot carry the amount", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    getFirestoreDoc.mockResolvedValue(bookingFS({ totalCost: { doubleValue: 150000 } }));

    await handleXenditInvoiceRequest(invoiceRequest(), env);
    const payload = JSON.parse(xenditCall()[0][1].body);
    expect(payload.payment_methods).toBeUndefined();
  });

  it("surfaces provider failures as 502", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({ uid: "guest-1", isAnonymous: false });
    getFirestoreDoc.mockResolvedValue(bookingFS());
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 502, text: async () => "boom", json: async () => ({})})));

    const res = await handleXenditInvoiceRequest(invoiceRequest(), env);
    expect(res.status).toBe(502);
  });
});
