import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("demo isolation", () => {
  it("no demo file imports firebase or app services", () => {
    const bad = files("src/demo")
      .filter((f) => /\.(js|jsx)$/.test(f))
      .filter((f) =>
        /(from\s+["'](firebase|@\/firebase|@\/services)|require\(["'](firebase|@\/services))/.test(
          readFileSync(f, "utf8"),
        ),
      );
    expect(bad).toEqual([]);
  });
});
