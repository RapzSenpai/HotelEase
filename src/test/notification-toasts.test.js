import { describe, expect, it } from "vitest";
import { shouldToast } from "@/hooks/useNotificationToasts";

describe("notification toast policy", () => {
  it("toasts core booking, cancellation, refund and payment events", () => {
    const core = [
      "booking_request",
      "booking_approved",
      "booking_rejected",
      "booking_cancelled",
      "cancellation_requested",
      "cancellation_approved",
      "cancellation_rejected",
      "refund_requested",
      "refund_approved",
      "refund_paid",
      "refund_rejected",
      "payment_proof_required",
      "payment_proof_uploaded",
      "payment_received",
      "support_message",
      "midstay_requested",
      "housekeeping_in_progress",
    ];
    for (const type of core) expect(shouldToast(type)).toBe(true);
  });

  it("stays quiet for turnover chatter, announcements and ratings", () => {
    const quiet = [
      "room_dirty",
      "housekeeping_done",
      "housekeeping_cancelled",
      "housekeeping_rated",
      "announcement",
      "stay_extended",
    ];
    for (const type of quiet) expect(shouldToast(type)).toBe(false);
  });

  it("never toasts unknown or missing types", () => {
    expect(shouldToast(undefined)).toBe(false);
    expect(shouldToast(null)).toBe(false);
    expect(shouldToast("")).toBe(false);
    expect(shouldToast("something_new")).toBe(false);
  });
});
