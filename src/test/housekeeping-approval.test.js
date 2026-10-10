import { describe, expect, it } from "vitest";
import { checkApproveGate } from "@/lib/housekeeping-approval";

describe("housekeeping four-eyes approval gate", () => {
  it("allows a second person to approve with no photos", () => {
    expect(
      checkApproveGate({ starterUid: "fo-1", approverUid: "fo-2" }),
    ).toEqual({ ok: true });
  });

  it("allows an admin to self-approve without photos", () => {
    expect(
      checkApproveGate({
        starterUid: "admin-1",
        approverUid: "admin-1",
        isAdmin: true,
      }),
    ).toEqual({ ok: true });
  });

  it("allows rooms with no recorded starter (legacy)", () => {
    expect(
      checkApproveGate({ starterUid: null, approverUid: "fo-1" }),
    ).toEqual({ ok: true });
  });

  it("blocks self-approval while another FO is on duty", () => {
    const result = checkApproveGate({
      starterUid: "fo-1",
      approverUid: "fo-1",
      otherFoOnline: true,
      photoCount: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Another FO is on duty");
  });

  it("blocks solo self-approval with no inspection photo", () => {
    const result = checkApproveGate({
      starterUid: "fo-1",
      approverUid: "fo-1",
      otherFoOnline: false,
      photoCount: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("inspection photo");
  });

  it("allows solo self-approval with at least 1 inspection photo", () => {
    expect(
      checkApproveGate({
        starterUid: "fo-1",
        approverUid: "fo-1",
        otherFoOnline: false,
        photoCount: 1,
      }),
    ).toEqual({ ok: true, solo: true });
  });
});
