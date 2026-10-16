import { describe, it, expect } from "vitest";
import {
  getHomePathForRole,
  isStaffRole,
  getLogoHomePath,
  resolveLoginRedirect,
} from "@/lib/routing";

describe("routing helpers", () => {
  describe("resolveLoginRedirect", () => {
    it("honors an internal path from state, query string included", () => {
      expect(
        resolveLoginRedirect("/booking/r1?checkIn=2026-12-20&checkOut=2026-12-22&pax=4", "guest"),
      ).toBe("/booking/r1?checkIn=2026-12-20&checkOut=2026-12-22&pax=4");
    });

    it("rejects protocol-relative, backslash and absolute URLs", () => {
      expect(resolveLoginRedirect("//evil.com", "guest")).toBe("/my-bookings");
      expect(resolveLoginRedirect("/\\evil.com", "guest")).toBe("/my-bookings");
      expect(resolveLoginRedirect("https://evil.com", "guest")).toBe("/my-bookings");
      expect(resolveLoginRedirect("booking/r1", "guest")).toBe("/my-bookings");
    });

    it("falls back to the existing per-role default (guests land on my-bookings)", () => {
      expect(resolveLoginRedirect(undefined, "fo")).toBe("/fo");
      expect(resolveLoginRedirect(undefined, "admin")).toBe("/admin");
      // role state can lag right after login; LoginPage historically sends
      // everyone else to /my-bookings, so the helper must too.
      expect(resolveLoginRedirect(undefined, null)).toBe("/my-bookings");
      expect(resolveLoginRedirect(undefined, "guest")).toBe("/my-bookings");
    });
  });
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
