import { describe, expect, it, vi } from "vitest";
import { resolveBookingClaimIdentity } from "./firebase-jwt.js";

describe("resolveBookingClaimIdentity", () => {
  it("rejects missing or malformed bearer tokens", async () => {
    const missing = new Request("https://worker.example/claim-booking-markers");
    await expect(resolveBookingClaimIdentity(missing, {
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "project" }),
    })).resolves.toBeNull();

    const malformed = new Request("https://worker.example/claim-booking-markers", {
      headers: { "X-HE-AUTH": "Bearer not-a-jwt" },
    });
    await expect(resolveBookingClaimIdentity(malformed, {
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "project" }),
    })).resolves.toBeNull();
  });

  it("rejects missing service-account configuration without verifying the token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const request = new Request("https://worker.example/claim-booking-markers", {
      headers: { "X-HE-AUTH": "Bearer header.payload.signature" },
    });

    await expect(resolveBookingClaimIdentity(request, {})).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
