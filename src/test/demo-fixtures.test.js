import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/demo/fixtures";

describe("demo fixtures", () => {
  it("keeps every booking inside a live window around today", () => {
    const data = buildDemoData(new Date());
    for (const b of data.bookings) {
      expect(Math.abs(b.checkInDate.toDate().getTime() - Date.now())).toBeLessThan(45 * 86400000);
    }
  });

  it("covers every status the journeys need", () => {
    const statuses = new Set(buildDemoData(new Date()).bookings.map((b) => b.status));
    for (const s of ["Pending", "Approved", "Checked In", "Checked Out", "Cancelled"]) {
      expect(statuses.has(s)).toBe(true);
    }
  });

  it("ships the view-only section fixtures", () => {
    const data = buildDemoData(new Date());
    for (const key of ["announcements", "messages", "testimonials", "refunds"]) {
      expect(data[key].length).toBeGreaterThan(0);
    }
    const refund = data.refunds[0];
    expect(data.bookings.some((b) => b.id === refund.bookingId)).toBe(true);
    for (const row of data.announcements) expect(row.createdAt.toMillis()).toBeGreaterThan(0);
    for (const row of data.testimonials) expect(row.rating).toBeGreaterThan(0);
  });

  // The admin sections render these fields directly, so a missing one shows up
  // as a blank column rather than an error.
  it("ships the admin-section fixtures with their display fields", () => {
    const data = buildDemoData(new Date());
    expect(data.alerts.some((a) => a.status !== "resolved")).toBe(true);
    expect(data.alerts.every((a) => a.title && a.severity && a.createdAt.toDate())).toBe(true);
    expect(data.auditLogs.every((l) => l.actorName && l.action && l.targetLabel)).toBe(true);
    expect(data.healthChecks.every((h) => h.name && h.status && Number.isFinite(h.latencyMs))).toBe(true);
    expect(data.performanceMetrics.every((m) => m.value && m.budget && m.status)).toBe(true);
    expect(data.settings.every((s) => s.label && s.value && s.scope)).toBe(true);
  });
});
