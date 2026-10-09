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
    for (const s of ["Pending", "Approved", "Checked In", "Checked Out"]) expect(statuses.has(s)).toBe(true);
  });
});
