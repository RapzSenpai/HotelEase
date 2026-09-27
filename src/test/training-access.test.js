import { describe, it, expect } from "vitest";
import { isHiddenInTraining } from "@/lib/trainingAccess";

describe("isHiddenInTraining", () => {
  it("hides user management in training", () => {
    expect(isHiddenInTraining("/admin/users", true)).toBe(true);
    expect(isHiddenInTraining("/admin/users", false)).toBe(false);
  });

  it("hides training controls in training", () => {
    expect(isHiddenInTraining("/admin/training", true)).toBe(true);
    expect(isHiddenInTraining("/admin/training", false)).toBe(false);
  });

  it("hides system settings in training", () => {
    expect(isHiddenInTraining("/admin/settings", true)).toBe(true);
    expect(isHiddenInTraining("/admin/settings", false)).toBe(false);
  });

  it("keeps everything else visible", () => {
    expect(isHiddenInTraining("/admin", true)).toBe(false);
    expect(isHiddenInTraining("/admin/rooms", true)).toBe(false);
    expect(isHiddenInTraining("/fo", true)).toBe(false);
    expect(isHiddenInTraining("/my-bookings", true)).toBe(false);
    expect(isHiddenInTraining("/admin/users", null)).toBe(false);
  });
});
