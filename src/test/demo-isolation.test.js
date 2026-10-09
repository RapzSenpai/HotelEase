import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

// Everything the demo touches outside src/demo/** must stay service-free too.
const SCANNED = [
  ...files("src/demo").filter((f) => /\.(js|jsx)$/.test(f)),
  "src/components/layout/DemoPreviewStrip.jsx",
  "src/lib/housekeeping-requests.js",
];

describe("demo isolation", () => {
  it("scan covers the demo tree plus demo-adjacent files", () => {
    expect(SCANNED).toContain("src/components/layout/DemoPreviewStrip.jsx");
    expect(SCANNED).toContain("src/lib/housekeeping-requests.js");
  });

  it("no demo file imports firebase or app services", () => {
    const bad = SCANNED.filter((f) =>
      /(from\s+["'](firebase|@\/firebase|@\/services)|require\(["'](firebase|@\/services))/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(bad).toEqual([]);
  });
});
