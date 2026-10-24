import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Xendit gateway client: env-flag gating + the authenticated Worker invoice
// call. Mirrors the availability-outbox idioms (mock auth + stubbed fetch).

const mockAuth = { currentUser: null };

vi.mock("@/firebase/firebase.config", () => ({ auth: mockAuth, db: {} }));

const {
  createXenditInvoice,
  isXenditEnabled} = await import("@/services/xenditGatewayService");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mockAuth.currentUser = null;
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("VITE_GROQ_PROXY_URL", "https://worker.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isXenditEnabled", () => {
  it("stays off without the flag or the Worker URL", () => {
    // .env may define the flag for live Xendit testing — this test must not depend on it.
    vi.stubEnv("VITE_XENDIT_ENABLED", undefined);
    expect(isXenditEnabled()).toBe(false); // Worker URL set, no flag
    vi.stubEnv("VITE_XENDIT_ENABLED", "1");
    vi.stubEnv("VITE_GROQ_PROXY_URL", "");
    expect(isXenditEnabled()).toBe(false); // flag on, but no Worker URL
  });

  it("only turns on with the flag AND the Worker URL", () => {
    vi.stubEnv("VITE_XENDIT_ENABLED", "1");
    vi.stubEnv("VITE_GROQ_PROXY_URL", "https://worker.example");
    expect(isXenditEnabled()).toBe(true);
    vi.stubEnv("VITE_XENDIT_ENABLED", "0");
    expect(isXenditEnabled()).toBe(false);
  });
});

describe("createXenditInvoice", () => {
  it("requires a signed-in guest", async () => {
    mockAuth.currentUser = null;
    await expect(createXenditInvoice({ bookingId: "bk-1" })).rejects.toThrow(/sign in/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the booking to the Worker with the guest's ID token", async () => {
    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue("firebase-token") };
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        invoiceId: "inv-123",
        invoiceUrl: "https://checkout.xendit.co/web/inv-123"})});

    await expect(
      createXenditInvoice({ bookingId: "bk-1" })
    ).resolves.toEqual({
      invoiceId: "inv-123",
      invoiceUrl: "https://checkout.xendit.co/web/inv-123"});

    expect(fetch).toHaveBeenCalledWith(
      "https://worker.example/xendit/invoice",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-HE-AUTH": "Bearer firebase-token"},
        body: JSON.stringify({ bookingId: "bk-1" })}));
  });

  it("surfaces the Worker's error message verbatim", async () => {
    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue("firebase-token") };
    fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "This booking is not awaiting payment." })});

    await expect(createXenditInvoice({ bookingId: "bk-1" }))
      .rejects.toThrow("This booking is not awaiting payment.");
  });

  it("falls back to a generic message when the Worker gives nothing usable", async () => {
    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue("firebase-token") };
    fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });

    await expect(createXenditInvoice({ bookingId: "bk-1" }))
      .rejects.toThrow(/could not start/i);
  });
});
