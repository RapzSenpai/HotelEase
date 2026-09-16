import { describe, it, expect } from "vitest";
import { diffAvailability } from "@/services/availabilityReconciliation";

const booking = (over = {}) => ({
  id: "b1",
  roomId: "r1",
  status: "Approved",
  checkInDate: "2026-10-01",
  checkOutDate: "2026-10-03",
  ...over,
});
const marker = (date, over = {}) => ({
  id: `r1_${date}`,
  roomId: "r1",
  date,
  bookingId: "b1",
  status: "Approved",
  ...over,
});

describe("diffAvailability", () => {
  it("reports no drift when markers match an active booking", () => {
    const { orphanMarkers, missingMarkers } = diffAvailability(
      [booking()],
      [marker("2026-10-01"), marker("2026-10-02")],
    );
    expect(orphanMarkers).toHaveLength(0);
    expect(missingMarkers).toHaveLength(0);
  });

  it("flags markers left behind by a cancelled booking as orphans", () => {
    const { orphanMarkers } = diffAvailability(
      [booking({ status: "Cancelled" })],
      [marker("2026-10-01"), marker("2026-10-02")],
    );
    expect(orphanMarkers).toHaveLength(2);
  });

  it("flags markers whose booking no longer exists", () => {
    const { orphanMarkers } = diffAvailability([], [marker("2026-10-01")]);
    expect(orphanMarkers).toHaveLength(1);
  });

  it("flags nights an active hold is missing", () => {
    const { missingMarkers } = diffAvailability(
      [booking()],
      [marker("2026-10-01")], // second night is missing
    );
    expect(missingMarkers).toHaveLength(1);
    expect(missingMarkers[0]).toMatchObject({ roomId: "r1", date: "2026-10-02", bookingId: "b1" });
  });

  it("treats Cancellation Requested as still holding the room", () => {
    const { orphanMarkers, missingMarkers } = diffAvailability(
      [booking({ status: "Cancellation Requested" })],
      [marker("2026-10-01"), marker("2026-10-02")],
    );
    expect(orphanMarkers).toHaveLength(0);
    expect(missingMarkers).toHaveLength(0);
  });

  it("reports an orphan-blocked night as both orphan and missing", () => {
    const { orphanMarkers, missingMarkers } = diffAvailability(
      [booking()],
      [marker("2026-10-01", { id: "stale", bookingId: "gone" })],
    );
    expect(orphanMarkers).toHaveLength(1);
    expect(missingMarkers).toHaveLength(2);
    expect(missingMarkers.map((m) => m.date).sort()).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("does not expect markers for a Checked Out booking", () => {
    const { orphanMarkers, missingMarkers } = diffAvailability(
      [booking({ status: "Checked Out" })],
      [],
    );
    expect(orphanMarkers).toHaveLength(0);
    expect(missingMarkers).toHaveLength(0);
  });
});
