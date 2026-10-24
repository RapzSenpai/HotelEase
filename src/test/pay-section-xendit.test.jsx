import { MemoryRouter } from "react-router-dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The Awaiting-Payment card swaps its primary call-to-action between the
 * in-app simulated checkout and Xendit's hosted TEST checkout, controlled only
 * by isXenditEnabled(). Manual proof upload stays in both modes.
 */

const mocks = vi.hoisted(() => ({
  isXenditEnabled: vi.fn(() => false),
  createXenditInvoice: vi.fn()}));

vi.mock("@/services/xenditGatewayService", () => ({
  isXenditEnabled: mocks.isXenditEnabled,
  createXenditInvoice: mocks.createXenditInvoice}));

const { default: BookingPaymentSection } = await import(
  "@/components/bookings/BookingPaymentSection");

let root = null;
let container = null;

async function renderSection(overrides = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const props = {
    booking: {
      id: "bk-1",
      paymentMethod: "GCash",
      paymentType: "Full"},
    status: "Awaiting Payment",
    total: 3000,
    paid: 0,
    balance: 3000,
    deadlineStr: "Oct 22, 8:00 PM",
    payments: [],
    paymentsLoading: false,
    paymentFile: null,
    onPaymentFileChange: vi.fn(),
    uploadingProof: false,
    onUploadProof: vi.fn(),
    ...overrides};
  await act(async () => {
    root.render(createElement(
      MemoryRouter,
      null,
      createElement(BookingPaymentSection, props)));
  });
}

function buttonByLabel(pattern) {
  return [...container.querySelectorAll("button")]
    .find((b) => pattern.test(b.textContent || ""));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe("BookingPaymentSection — Xendit test checkout swap", () => {
  beforeEach(() => {
    mocks.createXenditInvoice.mockResolvedValue({
      invoiceId: "inv-123",
      invoiceUrl: "https://checkout.xendit.co/web/inv-123"});
  });

  it("keeps the existing simulated checkout by default (no flag)", async () => {
    mocks.isXenditEnabled.mockReturnValue(false);
    await renderSection();
    expect(container.textContent).toMatch(/Pay Now via GCash/i);
    expect(container.textContent).not.toMatch(/Pay Online via GCash/i);
  });

  it("shows Pay Online and starts the hosted Xendit checkout when enabled", async () => {
    mocks.isXenditEnabled.mockReturnValue(true);
    await renderSection();

    expect(container.textContent).toMatch(/Pay Online via GCash/i);
    const button = buttonByLabel(/Pay Online via GCash/i);
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.createXenditInvoice).toHaveBeenCalledWith({ bookingId: "bk-1" });
  });

  it("still offers the manual proof upload in Xendit mode", async () => {
    mocks.isXenditEnabled.mockReturnValue(true);
    await renderSection();
    expect(container.textContent).toMatch(/Upload proof manually/i);
  });

  it("explains an online payment received while Pending instead of a bare ₱0 folio", async () => {
    mocks.isXenditEnabled.mockReturnValue(true);
    await renderSection({
      status: "Pending",
      booking: {
        id: "bk-1",
        paymentMethod: "GCash",
        paymentType: "Full",
        paymentGateway: "xendit",
        gatewayRef: "inv-123"}});
    expect(container.textContent).toMatch(/Online Payment Received/i);
    expect(container.textContent).toMatch(/inv-123/);
    expect(container.textContent).toMatch(/Xendit test checkout/i);
  });
});
