import { describe, it, expect } from "vitest";
import { getHomePathForRole, isStaffRole, getLogoHomePath } from "@/lib/routing";

describe("routing helpers", () => {
  describe("getHomePathForRole", () => {
    it("returns /fo for fo role", () => {
      expect(getHomePathForRole("fo")).toBe("/fo");
    });

    it("returns /admin for admin role", () => {
      expect(getHomePathForRole("admin")).toBe("/admin");
    });

    it("returns /my-bookings for guest role", () => {
      expect(getHomePathForRole("guest")).toBe("/my-bookings");
    });

    it("returns / for null/undefined role", () => {
      expect(getHomePathForRole(null)).toBe("/");
      expect(getHomePathForRole(undefined)).toBe("/");
    });
  });

  describe("isStaffRole", () => {
    it("returns true for fo", () => {
      expect(isStaffRole("fo")).toBe(true);
    });

    it("returns true for admin", () => {
      expect(isStaffRole("admin")).toBe(true);
    });

    it("returns false for guest", () => {
      expect(isStaffRole("guest")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isStaffRole(null)).toBe(false);
    });
  });

  describe("getLogoHomePath", () => {
    it("returns /fo for fo role", () => {
      expect(getLogoHomePath("fo")).toBe("/fo");
    });

    it("returns /admin for admin role", () => {
      expect(getLogoHomePath("admin")).toBe("/admin");
    });

    it("returns / for guest role", () => {
      expect(getLogoHomePath("guest")).toBe("/");
    });

    it("returns / for null role", () => {
      expect(getLogoHomePath(null)).toBe("/");
    });
  });
});
