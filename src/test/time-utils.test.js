import { describe, it, expect } from "vitest";
import { toLocalDate, toJsDate } from "@/lib/time-utils";

describe("toLocalDate", () => {
  it("reads a YYYY-MM-DD string as LOCAL midnight (not UTC)", () => {
    const d = toLocalDate("2026-10-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9); // October
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it("passes Dates through and unwraps Firestore Timestamps", () => {
    const date = new Date("2026-05-05T12:00:00Z");
    expect(toLocalDate(date)).toBe(date);
    expect(toLocalDate({ toDate: () => date })).toBe(date);
  });

  it("returns null for missing input", () => {
    expect(toLocalDate(null)).toBeNull();
    expect(toLocalDate(undefined)).toBeNull();
  });

  it("rejects impossible calendar dates instead of normalizing them", () => {
    expect(toLocalDate("2026-02-30")).toBeNull();
    expect(toLocalDate("2026-13-01")).toBeNull();
    expect(toLocalDate("nonsense")).toBeNull();
  });
});

describe("toJsDate", () => {
  it("returns null instead of an Invalid Date", () => {
    expect(toJsDate("nonsense")).toBeNull();
    expect(toJsDate(null)).toBeNull();
  });
});
