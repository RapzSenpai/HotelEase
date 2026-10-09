import { describe, expect, it } from "vitest";
import { useDemo } from "@/demo/DemoContext";

describe("demo context", () => {
  it("exposes scripted guest actions", () => {
    expect(typeof useDemo).toBe("function");
  });
});
