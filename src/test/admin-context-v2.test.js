import { describe, it, expect } from "vitest";
import {
  summarizeAccounts,
  summarizeAlerts,
  summarizeRefunds,
  summarizeErrorLogs,
  summarizeAuditActivity,
} from "@/services/insightsService";

const DAY = 24 * 60 * 60 * 1000;

describe("summarizeAccounts", () => {
  it("counts roles, registrations in window, and active users; skips the system doc", () => {
    const now = Date.now();
    const users = [
      { id: "u1", role: "guest", createdAt: new Date(now - 2 * DAY), isOnline: true, lastSeenAt: new Date(now - 1000) },
      { id: "u2", role: "guest", createdAt: new Date(now - 40 * DAY), isOnline: false },
      { id: "u3", role: "fo", createdAt: new Date(now - 10 * DAY), isOnline: true, lastSeenAt: new Date(now - 200_000) },
      { id: "u4", role: "admin", isOnline: false },
      { id: "system", role: "system" },
    ];
    const out = summarizeAccounts(users, now);
    expect(out.total).toBe(4);
    expect(out.byRole).toEqual({ guest: 2, fo: 1, admin: 1 });
    expect(out.newLast30d).toBe(2);
    expect(out.activeNow).toBe(1);
  });

  it("reports null registration trend when no user has a createdAt", () => {
    const now = Date.now();
    const out = summarizeAccounts([{ id: "u1", role: "guest" }], now);
    expect(out.newLast30d).toBeNull();
    expect(out.activeNow).toBe(0);
  });
});

describe("summarizeAlerts", () => {
  it("buckets unresolved by severity, ranks top 3, counts recently resolved", () => {
    const now = Date.now();
    const alerts = [
      { status: "unresolved", severity: "low", title: "Low one", createdAt: new Date(now - 1 * DAY) },
      { status: "unresolved", severity: "critical", title: "Critical one", createdAt: new Date(now - 3 * DAY) },
      { status: "unresolved", severity: "high", title: "High one", createdAt: new Date(now - 2 * DAY) },
      { status: "unresolved", severity: "medium", title: "Medium one", createdAt: new Date(now - 1 * DAY) },
      { status: "unresolved", severity: "high", title: "High old", createdAt: new Date(now - 9 * DAY) },
      { status: "resolved", severity: "medium", title: "Done", resolvedAt: new Date(now - 5 * DAY) },
      { status: "resolved", severity: "medium", title: "Old done", resolvedAt: new Date(now - 40 * DAY) },
    ];
    const out = summarizeAlerts(alerts, now);
    expect(out.unresolvedTotal).toBe(5);
    expect(out.unresolvedBySeverity).toEqual({ critical: 1, high: 2, medium: 1, low: 1 });
    expect(out.resolvedLast30d).toBe(1);
    expect(out.topUnresolved.map((a) => a.title)).toEqual(["Critical one", "High old", "High one"]);
    expect(out.topUnresolved[0].ageDays).toBe(3);
  });
});

describe("summarizeRefunds", () => {
  it("sums pending backlog, detects 7-day stuck, counts paid in window", () => {
    const now = Date.now();
    const refunds = [
      { status: "Pending", amount: 1500, createdAt: new Date(now - 9 * DAY) },
      { status: "Pending", amount: 500, createdAt: new Date(now - 1 * DAY) },
      { status: "Approved", amount: 800, createdAt: new Date(now - 2 * DAY) },
      { status: "Paid", amount: 300, processedAt: new Date(now - 3 * DAY) },
      { status: "Paid", amount: 700, processedAt: new Date(now - 45 * DAY) },
      { status: "Rejected", amount: 100, updatedAt: new Date(now - 4 * DAY) },
    ];
    const out = summarizeRefunds(refunds, now);
    expect(out.pendingCount).toBe(2);
    expect(out.pendingAmount).toBe(2000);
    expect(out.stuckPending7d).toBe(1);
    expect(out.approvedCount).toBe(1);
    expect(out.paidLast30d).toEqual({ count: 1, total: 300 });
    expect(out.rejectedLast30d).toBe(1);
  });
});

describe("summarizeErrorLogs", () => {
  it("counts by window, groups components, and tolerates ISO-string timestamps", () => {
    const now = Date.now();
    const iso = (msAgo) => new Date(now - msAgo).toISOString();
    const logs = [
      { component: "CheckoutPage", timestamp: iso(2 * DAY) },
      { component: "CheckoutPage", timestamp: iso(3 * DAY) },
      { component: "ChatbotWidget", timestamp: iso(5 * DAY) },
      { component: "CheckoutPage", timestamp: iso(10 * DAY) },
      { component: "LoginPage", timestamp: iso(40 * DAY) },
      { component: "", timestamp: null },
    ];
    const out = summarizeErrorLogs(logs, now);
    expect(out.errorsLast30d).toBe(4);
    expect(out.errorsLast7d).toBe(3);
    expect(out.errorsPrev7d).toBe(1);
    expect(out.topErrorComponents[0]).toEqual({ component: "CheckoutPage", count: 3 });
    expect(out.lastErrorAt).toBe(iso(2 * DAY));
  });
});

describe("summarizeAuditActivity", () => {
  it("counts action types in the window and staff actions in 7 days", () => {
    const now = Date.now();
    const iso = (msAgo) => new Date(now - msAgo).toISOString();
    const logs = [
      { actionType: "USER_ROLE_CHANGE", timestamp: iso(1 * DAY) },
      { actionType: "USER_ROLE_CHANGE", timestamp: iso(2 * DAY) },
      { actionType: "ROOM_UPDATE", timestamp: iso(20 * DAY) },
      { actionType: "USER_DELETE", timestamp: iso(35 * DAY) },
    ];
    const out = summarizeAuditActivity(logs, now);
    expect(out.last30d).toEqual({ USER_ROLE_CHANGE: 2, ROOM_UPDATE: 1 });
    expect(out.staffActions7d).toBe(2);
  });
});
