import { describe, it, expect } from "vitest";
import { isValidFoTransition, isValidHousekeepingTransition } from "@/lib/room-status-transitions";

describe("FO room status transitions", () => {
  it("allows Available -> Reserved", () => {
    expect(isValidFoTransition("Available", "Reserved")).toBe(true);
  });

  it("allows Reserved -> Occupied (check-in)", () => {
    expect(isValidFoTransition("Reserved", "Occupied")).toBe(true);
  });

  it("allows Occupied -> Dirty (check-out)", () => {
    expect(isValidFoTransition("Occupied", "Dirty / Needs Cleaning")).toBe(true);
  });

  it("allows Dirty -> Being Cleaned", () => {
    expect(isValidFoTransition("Dirty / Needs Cleaning", "Being Cleaned")).toBe(true);
  });

  it("does not allow Available -> Occupied (must go through Reserved)", () => {
    expect(isValidFoTransition("Available", "Occupied")).toBe(false);
  });

  it("does not allow Dirty -> Reserved (must go through Being Cleaned -> Pending Approval -> Available)", () => {
    expect(isValidFoTransition("Dirty / Needs Cleaning", "Reserved")).toBe(false);
  });
});

describe("Housekeeping transitions", () => {
  it("allows Dirty -> Being Cleaned", () => {
    expect(isValidHousekeepingTransition("Dirty / Needs Cleaning", "Being Cleaned")).toBe(true);
  });

  it("allows Being Cleaned -> Pending Approval", () => {
    expect(isValidHousekeepingTransition("Being Cleaned", "Pending Approval")).toBe(true);
  });

  it("allows Pending Approval -> Being Cleaned (reject)", () => {
    expect(isValidHousekeepingTransition("Pending Approval", "Being Cleaned")).toBe(true);
  });

  it("does not allow Dirty -> Pending Approval (must go through Being Cleaned)", () => {
    expect(isValidHousekeepingTransition("Dirty / Needs Cleaning", "Pending Approval")).toBe(false);
  });
});
