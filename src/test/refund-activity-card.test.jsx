import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: RefundActivityCard } = await import("@/components/admin/RefundActivityCard");

let root = null;
let container = null;

function renderCard(props) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(RefundActivityCard, props));
  });
  return container;
}

function cleanup() {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

afterEach(cleanup);

const backlog = {
  pendingCount: 3,
  pendingAmount: 4500,
  stuckPending7d: 2,
  approvedCount: 1,
  approvedAmount: 1500,
  paidLast30d: { count: 4, total: 12000 },
  rejectedLast30d: 0,
};

describe("RefundActivityCard", () => {
  it("renders refund counts and amounts", () => {
    const el = renderCard({ stats: backlog, totalCount: 5 });
    const text = el.textContent;
    expect(text).toContain("Pending Requests");
    expect(text).toContain("PHP 4,500 requested");
    expect(text).toContain("Approved, Awaiting Payout");
    expect(text).toContain("PHP 1,500 ready to send");
    expect(text).toContain("Pending 7+ Days");
    expect(text).toContain("Paid (30 Days)");
    expect(text).toContain("PHP 12,000 sent out");
  });

  it("flags stuck refunds only when some exist", () => {
    const flagged = renderCard({ stats: backlog, totalCount: 5 });
    expect(flagged.querySelectorAll(".text-warning").length).toBeGreaterThan(0);

    cleanup();
    const calm = renderCard({ stats: { ...backlog, stuckPending7d: 0 }, totalCount: 5 });
    expect(calm.querySelectorAll(".text-warning").length).toBe(0);
    expect(calm.textContent).toContain("None overdue");
  });

  it("shows empty state when there are no refunds", () => {
    const el = renderCard({
      stats: { ...backlog, pendingCount: 0, pendingAmount: 0, stuckPending7d: 0, approvedCount: 0, approvedAmount: 0, paidLast30d: { count: 0, total: 0 } },
      totalCount: 0,
    });
    expect(el.textContent).toContain("No refunds recorded yet.");
  });

  it("shows unavailable state when the refunds fetch failed", () => {
    const el = renderCard({ stats: null, totalCount: 0 });
    expect(el.textContent).toContain("Refund data unavailable");
  });
});
