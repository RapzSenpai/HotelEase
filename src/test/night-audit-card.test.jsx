import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  loadNightAuditData: vi.fn(),
  markNoShow: vi.fn(),
  runNightAudit: vi.fn(),
  getLatestAudit: vi.fn()}));

vi.mock("@/services/nightAuditService", () => ({
  loadNightAuditData: mocks.loadNightAuditData,
  markNoShow: mocks.markNoShow,
  runNightAudit: mocks.runNightAudit,
  getLatestAudit: mocks.getLatestAudit}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uid: "fo-1", email: "ana@hotel.test" },
    profile: { fullName: "Ana Cruz" }})}));

const { default: NightAuditCard } = await import("@/components/dashboard/NightAuditCard");

const DATA = {
  dueToday: [{ id: "bk-today", checkInDate: "2026-10-21", roomName: "Deluxe 103" }],
  eligible: [
    { id: "bk-late", checkInDate: "2026-10-19", roomName: "Deluxe 101" },
    { id: "bk-late2", checkInDate: "2026-10-20", roomName: "Suite 201" }],
  figures: {
    checkInsToday: 3,
    checkOutsDue: 4,
    overdueCheckOuts: 1,
    arrivalsTodayNotCheckedIn: 1,
    noShowEligible: 2,
    noShowsMarkedToday: 0,
    occupiedRooms: 5,
    totalRooms: 10}};

let root = null;
let container = null;

// The card computes "N days past arrival" against the real clock and the
// fixtures are built around 2026-10-21 — freeze Date so the expected numbers
// ("2d behind", "1d behind") don't drift with the calendar.
const FREEZE_NOW = new Date(2026, 9, 21, 20, 30, 0);

async function renderCard() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(NightAuditCard));
  });
}

function buttonByText(label) {
  return [...container.querySelectorAll("button")]
    .find((b) => b.textContent?.trim() === label);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("NightAuditCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FREEZE_NOW, toFake: ["Date"] });
    mocks.loadNightAuditData.mockResolvedValue(DATA);
    mocks.getLatestAudit.mockResolvedValue(
      { auditDate: "2026-10-21", runCount: 1, runByName: "Ana Cruz", occupancyRate: 50 });
  });

  it("separates today's arrivals from no-show eligible late arrivals", async () => {
    await renderCard();
    expect(container.textContent).toContain("Deluxe 101");
    expect(container.textContent).toContain("Deluxe 103");
    // Lateness shown next to each eligible arrival.
    expect(container.textContent).toMatch(/2[dD]\s*(behind|late|past)/);
    expect(container.textContent).toMatch(/1[dD]\s*(behind|late|past)/);
    // Eligible list has action buttons; today's list explains the cut-off.
    expect(buttonByText("Mark No-Show")).toBeTruthy();
    expect(container.textContent).toMatch(/may still arrive|not yet/i);
  });

  it("requires a confirm click before marking a no-show", async () => {
    mocks.markNoShow.mockResolvedValue(
      { ok: true, changed: true, refundRequested: 2000 });
    await renderCard();

    const first = buttonByText("Mark No-Show");
    await act(async () => first.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // First click: armed only — nothing processed yet.
    expect(mocks.markNoShow).not.toHaveBeenCalled();
    const confirm = buttonByText("Confirm No-Show");
    expect(confirm).toBeTruthy();

    await act(async () => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(mocks.markNoShow).toHaveBeenCalledWith("bk-late", expect.objectContaining({
      markedBy: "Ana Cruz",
      markedByUserId: "fo-1"}));
    // List refreshed after the action.
    expect(mocks.loadNightAuditData.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("writes the end-of-day snapshot via the run button", async () => {
    mocks.runNightAudit.mockResolvedValue(
      { ok: true, runCount: 2, auditDate: "2026-10-21" });
    await renderCard();

    const run = buttonByText("Run Night Audit");
    await act(async () => run.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(mocks.runNightAudit).toHaveBeenCalledWith({
      runByName: "Ana Cruz",
      runByUserId: "fo-1"});
  });
});
