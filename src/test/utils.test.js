import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const showBar = false;
    expect(cn("foo", showBar && "bar", "baz")).toBe("foo baz");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("p-2 p-4")).toBe("p-4");
  });

  it("handles undefined and null", () => {
    expect(cn("foo", undefined, null)).toBe("foo");
  });
});
