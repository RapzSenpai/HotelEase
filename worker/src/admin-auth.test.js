import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoogleAccessToken: vi.fn(),
  getFirestoreUserRole: vi.fn(),
}));

vi.mock("./google-auth.js", () => ({ getGoogleAccessToken: mocks.getGoogleAccessToken }));
vi.mock("./firestore.js", () => ({ getFirestoreUserRole: mocks.getFirestoreUserRole }));

const { isAdminUser, resetAdminRoleCache } = await import("./admin-auth.js");

const workerEnv = {
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "hotel-project" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  resetAdminRoleCache();
  mocks.getGoogleAccessToken.mockResolvedValue("service-token");
  mocks.getFirestoreUserRole.mockResolvedValue("admin");
});

describe("isAdminUser", () => {
  it("grants admins and denies every other role", async () => {
    await expect(isAdminUser(workerEnv, "admin-1")).resolves.toBe(true);

    mocks.getFirestoreUserRole.mockResolvedValue("fo");
    await expect(isAdminUser(workerEnv, "fo-1")).resolves.toBe(false);

    mocks.getFirestoreUserRole.mockResolvedValue("guest");
    await expect(isAdminUser(workerEnv, "guest-1")).resolves.toBe(false);
    expect(mocks.getFirestoreUserRole).toHaveBeenLastCalledWith(
      "service-token",
      "hotel-project",
      "guest-1",
    );
  });

  it("treats a missing user doc (null role) as not admin", async () => {
    mocks.getFirestoreUserRole.mockResolvedValue(null);
    await expect(isAdminUser(workerEnv, "ghost-1")).resolves.toBe(false);
  });

  it("caches the verdict per uid", async () => {
    await isAdminUser(workerEnv, "admin-1");
    await isAdminUser(workerEnv, "admin-1");
    expect(mocks.getFirestoreUserRole).toHaveBeenCalledTimes(1);

    await isAdminUser(workerEnv, "admin-2");
    expect(mocks.getFirestoreUserRole).toHaveBeenCalledTimes(2);
  });

  it("throws when the check cannot run so callers can fail closed", async () => {
    mocks.getGoogleAccessToken.mockRejectedValue(new Error("token exchange failed"));
    await expect(isAdminUser(workerEnv, "admin-1")).rejects.toThrow("token exchange failed");
  });

  it("throws when the service account is missing a project id", async () => {
    await expect(isAdminUser({ FIREBASE_SERVICE_ACCOUNT: "{}" }, "admin-1")).rejects.toThrow(
      "project_id",
    );
  });
});
