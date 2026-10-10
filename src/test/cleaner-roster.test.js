import { describe, expect, it } from "vitest";
import { CLEANER_ROSTER, cleanerSuggestions } from "@/lib/cleaner-roster";

describe("cleaner roster", () => {
  it("is an array (seed crew names here)", () => {
    expect(Array.isArray(CLEANER_ROSTER)).toBe(true);
  });

  it("returns roster matches for a query, everything for blank", () => {
    expect(cleanerSuggestions("")).toEqual(CLEANER_ROSTER);
    expect(cleanerSuggestions("zzz-no-match")).toEqual([]);
  });
});
