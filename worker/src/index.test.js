import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAiIdentity: vi.fn(),
  resolveBookingClaimIdentity: vi.fn(),
  isAdminUser: vi.fn(),
  getGoogleAccessToken: vi.fn(),
  claimBookingNotificationJob: vi.fn(),
  deliverQueuedJob: vi.fn(),
  rateLimited: vi.fn(),
  getAiDailyCount: vi.fn(),
  incrementAiDailyCount: vi.fn(),
  handleChatRequest: vi.fn(),
  handleInsightsRequest: vi.fn(),
  handleBriefingRequest: vi.fn(),
  handleAdminChatRequest: vi.fn(),
}));

vi.mock("./firebase-jwt.js", () => ({
  resolveAiIdentity: mocks.resolveAiIdentity,
  resolveBookingClaimIdentity: mocks.resolveBookingClaimIdentity,
}));
vi.mock("./admin-auth.js", () => ({ isAdminUser: mocks.isAdminUser }));
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
vi.mock("./handlers/chat.js", () => ({ handleChatRequest: mocks.handleChatRequest }));
vi.mock("./handlers/insights.js", () => ({ handleInsightsRequest: mocks.handleInsightsRequest }));
vi.mock("./handlers/briefing.js", () => ({ handleBriefingRequest: mocks.handleBriefingRequest }));
vi.mock("./handlers/admin-chat.js", () => ({ handleAdminChatRequest: mocks.handleAdminChatRequest }));

const { default: worker } = await import("./index.js");

const workerEnv = {
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "hotel-project" }),
};

function request(body, token = "firebase-token", path = "/claim-booking-markers") {
  return new Request(`https://hotel-worker.example${path}`, {
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
  mocks.isAdminUser.mockResolvedValue(true);
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

describe("guest AI daily quota", () => {
  it("passes the remaining quota into the chat handler", async () => {
    mocks.resolveAiIdentity.mockResolvedValue({});
    mocks.rateLimited.mockReturnValue(false);
    mocks.getAiDailyCount.mockResolvedValue(2);
    mocks.handleChatRequest.mockResolvedValue(
      Response.json({ content: "ok", remainingToday: 2, dailyLimit: 5 }),
    );

    const response = await worker.fetch(
      request({ messages: [{ role: "user", content: "hi" }] }, null, "/"),
      workerEnv,
    );

    expect(response.status).toBe(200);
    expect(mocks.handleChatRequest).toHaveBeenCalledWith(expect.any(Request), workerEnv, {
      remainingToday: 2,
      dailyLimit: 5,
    });
    expect(mocks.incrementAiDailyCount).toHaveBeenCalledTimes(1);
  });

  it("blocks at the daily cap and reports when it resets", async () => {
    mocks.resolveAiIdentity.mockResolvedValue({});
    mocks.rateLimited.mockReturnValue(false);
    mocks.getAiDailyCount.mockResolvedValue(5);

    const response = await worker.fetch(
      request({ messages: [{ role: "user", content: "hi" }] }, null, "/"),
      workerEnv,
    );

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("DAILY_CAP");
    const resetAt = new Date(body.resetAt);
    expect(resetAt.getTime()).toBeGreaterThan(Date.now());
    expect(resetAt.getUTCHours()).toBe(0);
    expect(resetAt.getUTCMinutes()).toBe(0);
    expect(mocks.handleChatRequest).not.toHaveBeenCalled();
    expect(mocks.incrementAiDailyCount).not.toHaveBeenCalled();
  });
});

describe("admin AI endpoints", () => {
  const aiRequest = (path) => request({ context: { ok: true } }, "firebase-token", path);

  it("rejects signed-in non-admins on every admin endpoint without spending quota", async () => {
    mocks.resolveAiIdentity.mockResolvedValue({ uid: "guest-1" });
    mocks.rateLimited.mockReturnValue(false);
    mocks.isAdminUser.mockResolvedValue(false);

    for (const path of ["/insights", "/briefing", "/admin-chat"]) {
      const response = await worker.fetch(aiRequest(path), workerEnv);
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("FORBIDDEN");
    }

    expect(mocks.getAiDailyCount).not.toHaveBeenCalled();
    expect(mocks.incrementAiDailyCount).not.toHaveBeenCalled();
    expect(mocks.handleInsightsRequest).not.toHaveBeenCalled();
    expect(mocks.handleBriefingRequest).not.toHaveBeenCalled();
    expect(mocks.handleAdminChatRequest).not.toHaveBeenCalled();
  });

  it("requires sign-in before the role check", async () => {
    mocks.resolveAiIdentity.mockResolvedValue({});
    mocks.rateLimited.mockReturnValue(false);

    const response = await worker.fetch(aiRequest("/insights"), workerEnv);

    expect(response.status).toBe(401);
    expect(mocks.isAdminUser).not.toHaveBeenCalled();
  });

  it("admits admins and forwards the remaining quota to the admin chat", async () => {
    mocks.resolveAiIdentity.mockResolvedValue({ uid: "admin-1" });
    mocks.rateLimited.mockReturnValue(false);
    mocks.isAdminUser.mockResolvedValue(true);
    mocks.getAiDailyCount.mockResolvedValue(4);
    mocks.handleAdminChatRequest.mockResolvedValue(Response.json({ content: "ok" }));

    const response = await worker.fetch(
      request({ messages: [{ role: "user", content: "hi" }], context: {} }, "firebase-token", "/admin-chat"),
      workerEnv,
    );

    expect(response.status).toBe(200);
    expect(mocks.isAdminUser).toHaveBeenCalledWith(workerEnv, "admin-1");
    expect(mocks.handleAdminChatRequest).toHaveBeenCalledWith(expect.any(Request), workerEnv, {
      remainingToday: 95,
      dailyLimit: 100,
    });
    expect(mocks.incrementAiDailyCount).toHaveBeenCalledTimes(1);
  });

  it("fails closed with a retryable 503 when the role check cannot run", async () => {
    mocks.resolveAiIdentity.mockResolvedValue({ uid: "admin-1" });
    mocks.rateLimited.mockReturnValue(false);
    mocks.isAdminUser.mockRejectedValue(new Error("Firestore unreachable"));

    const response = await worker.fetch(aiRequest("/briefing"), workerEnv);

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("ADMIN_CHECK_UNAVAILABLE");
    expect(mocks.getAiDailyCount).not.toHaveBeenCalled();
    expect(mocks.handleBriefingRequest).not.toHaveBeenCalled();
  });
});
