import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveBookingClaimIdentity: vi.fn(),
  getGoogleAccessToken: vi.fn(),
  claimBookingNotificationJob: vi.fn(),
  deliverQueuedJob: vi.fn(),
  rateLimited: vi.fn(),
  getAiDailyCount: vi.fn(),
  incrementAiDailyCount: vi.fn(),
}));

vi.mock("./firebase-jwt.js", () => ({
  resolveAiIdentity: vi.fn(),
  resolveBookingClaimIdentity: mocks.resolveBookingClaimIdentity,
}));
vi.mock("./google-auth.js", () => ({
  getGoogleAccessToken: mocks.getGoogleAccessToken,
}));
vi.mock("./booking-notifications.js", () => ({
  claimBookingNotificationJob: mocks.claimBookingNotificationJob,
  deliverQueuedJob: mocks.deliverQueuedJob,
  processBookingNotificationOutbox: vi.fn(),
}));
vi.mock("./rate-limit.js", () => ({ rateLimited: mocks.rateLimited }));
vi.mock("./ai-limits.js", () => ({
  getAiDailyCount: mocks.getAiDailyCount,
  incrementAiDailyCount: mocks.incrementAiDailyCount,
}));
vi.mock("./sweeps.js", () => ({
  expireStaleHolds: vi.fn(),
  sweepOrphanMarkers: vi.fn(),
  sweepStaleTrainingGuests: vi.fn(),
  purgeNotificationInboxes: vi.fn(),
}));
vi.mock("./handlers/delete-user.js", () => ({ handleDeleteUser: vi.fn() }));
vi.mock("./handlers/chat.js", () => ({ handleChatRequest: vi.fn() }));
vi.mock("./handlers/insights.js", () => ({ handleInsightsRequest: vi.fn() }));
vi.mock("./handlers/briefing.js", () => ({ handleBriefingRequest: vi.fn() }));
vi.mock("./handlers/admin-chat.js", () => ({ handleAdminChatRequest: vi.fn() }));

const { default: worker } = await import("./index.js");

const workerEnv = {
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "hotel-project" }),
};

function request(body, token = "firebase-token") {
  return new Request("https://hotel-worker.example/claim-booking-markers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-HE-AUTH": token ? `Bearer ${token}` : "",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGoogleAccessToken.mockResolvedValue("service-token");
  mocks.claimBookingNotificationJob.mockResolvedValue({
    status: "queued",
    claimedMarkers: 2,
  });
  mocks.deliverQueuedJob.mockResolvedValue({ delivered: true });
});

describe("POST /claim-booking-markers", () => {
  it("requires a verified Firebase identity", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue(null);
    const response = await worker.fetch(request({
      bookingId: "booking-1",
    }), workerEnv);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect(mocks.claimBookingNotificationJob).not.toHaveBeenCalled();
  });

  it("rejects anonymous production claims and non-owner jobs", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({
      uid: "anonymous-1",
      isAnonymous: true,
    });
    const anonymousResponse = await worker.fetch(request({
      bookingId: "booking-1",
    }), workerEnv);
    expect(anonymousResponse.status).toBe(403);

    mocks.resolveBookingClaimIdentity.mockResolvedValue({
      uid: "other-guest",
      isAnonymous: false,
    });
    mocks.claimBookingNotificationJob.mockResolvedValue({
      status: "cancelled",
      claimedMarkers: 0,
    });
    const ownerResponse = await worker.fetch(request({
      bookingId: "booking-1",
    }), workerEnv);
    expect(ownerResponse.status).toBe(403);
    expect(mocks.claimBookingNotificationJob).toHaveBeenCalledWith({
      accessToken: "service-token",
      projectId: "hotel-project",
      bookingId: "booking-1",
      requesterUid: "other-guest",
    });
  });

  it("rejects anonymous callers and maps conflicts to 409", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({
      uid: "anonymous-1",
      isAnonymous: true,
    });
    const anonDenied = await worker.fetch(request({
      bookingId: "booking-1",
    }), workerEnv);
    expect(anonDenied.status).toBe(403);
    expect(mocks.claimBookingNotificationJob).not.toHaveBeenCalled();

    mocks.resolveBookingClaimIdentity.mockResolvedValue({
      uid: "guest-1",
      isAnonymous: false,
    });
    mocks.claimBookingNotificationJob.mockResolvedValue({
      status: "conflict",
      claimedMarkers: 0,
    });
    const conflict = await worker.fetch(request({
      bookingId: "booking-2",
    }), workerEnv);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: expect.any(String) });
  });

  it("fans out queued jobs immediately but stays ok when delivery fails", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({
      uid: "guest-1",
      isAnonymous: false,
    });
    const response = await worker.fetch(request({
      bookingId: "booking-1",
    }), workerEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, claimed: 2 });
    expect(mocks.deliverQueuedJob).toHaveBeenCalledWith({
      accessToken: "service-token",
      projectId: "hotel-project",
      bookingId: "booking-1",
    });

    mocks.deliverQueuedJob.mockRejectedValueOnce(new Error("inbox write failed"));
    const retryResponse = await worker.fetch(request({
      bookingId: "booking-1",
    }), workerEnv);
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toEqual({ ok: true, claimed: 2 });
  });

  it("validates request data and bypasses AI rate limits", async () => {
    mocks.resolveBookingClaimIdentity.mockResolvedValue({
      uid: "guest-1",
      isAnonymous: false,
    });
    const response = await worker.fetch(request({
      bookingId: "",
    }), workerEnv);

    expect(response.status).toBe(400);
    expect(mocks.rateLimited).not.toHaveBeenCalled();
    expect(mocks.getAiDailyCount).not.toHaveBeenCalled();
  });

  it("reports missing Worker service-account configuration explicitly", async () => {
    const response = await worker.fetch(request({
      bookingId: "booking-1",
    }), {});

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("not configured") });
    expect(mocks.resolveBookingClaimIdentity).not.toHaveBeenCalled();
  });
});
