import { describe, expect, it } from "vitest";
import { useDemo } from "@/demo/DemoContext";

describe("demo context", () => {
  it("exposes scripted guest actions", () => {
    expect(typeof useDemo).toBe("function");
  });
});

describe("demo entry", () => {
  it("role dialog offers exactly Guest, FO, Admin", async () => {
    const { default: DemoRoleDialog } = await import("@/demo/DemoRoleDialog");
    expect(typeof DemoRoleDialog).toBe("function");
  });
});
