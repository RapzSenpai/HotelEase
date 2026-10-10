import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// demo-isolation.test.js and the eslint rule ban *direct* imports in src/demo/**.
// Reusing production components (sidebar chrome, tables, lists) is fine only if
// nothing they reach imports services or firebase — so walk the real graph.
const SRC = resolve("src");
const ROOTS = [
  "src/demo",
  "src/components/layout/DemoPreviewStrip.jsx",
  "src/lib/housekeeping-requests.js",
  "src/lib/nav-links.js",
];
// ponytail: exact edges, never whole files. Both exporters keep a service import
// for their prod-only branch — the demo passes `bookings` to the tape and
// `disableUploads` to the list, so neither branch runs (no listener, no upload).
// Drop each entry once that branch moves behind a prod-side container.
const KNOWN_EDGES = [
  [
    "src/components/dashboard/RoomScheduleTape.jsx",
    "src/services/bookingsService.js",
  ],
  [
    "src/components/housekeeping/HousekeepingPhotoUpload.jsx",
    "src/services/cloudinaryService.js",
  ],
];
const rel = (f) => relative(process.cwd(), f).split("\\").join("/");
const SPECIFIER = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;

function walkFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walkFiles(p) : [p];
  });
}

function resolveSpecifier(fromFile, specifier) {
  const target = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (!target) return null; // bare package import — not part of our source graph
  for (const candidate of [
    target,
    `${target}.js`,
    `${target}.jsx`,
    join(target, "index.js"),
    join(target, "index.jsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function dependencies(file) {
  const code = readFileSync(file, "utf8");
  return [...code.matchAll(SPECIFIER)]
    .map((m) => resolveSpecifier(file, m[1]))
    .filter(Boolean);
}

/** @returns {{ reachable: Set<string>, chain: Map<string, string|null>, hitEdges: Set<string> }} */
function reachableFiles() {
  const roots = ROOTS.flatMap((r) =>
    statSync(r).isDirectory() ? walkFiles(r) : [r],
  ).filter((f) => /\.(js|jsx)$/.test(f));
  const known = new Set(KNOWN_EDGES.map((e) => e.join(" -> ")));
  const seen = new Set();
  const chain = new Map();
  const hitEdges = new Set();
  const stack = roots.map((f) => [f, null]);
  while (stack.length) {
    const [file, parent] = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    chain.set(file, parent);
    for (const dep of dependencies(file)) {
      const edge = `${rel(file)} -> ${rel(dep)}`;
      if (known.has(edge)) {
        hitEdges.add(edge);
        continue;
      }
      stack.push([dep, file]);
    }
  }
  return { reachable: seen, chain, hitEdges };
}

/** "src/demo/guest/DemoGuestPage.jsx -> src/components/x.jsx -> src/services/y.js" */
function chainText(file, chain) {
  const parts = [];
  for (let cur = file; cur; cur = chain.get(cur)) {
    parts.unshift(relative(process.cwd(), cur));
  }
  return parts.join(" -> ");
}

describe("demo import graph", () => {
  it("reaches no service or firebase module", () => {
    const { reachable, chain, hitEdges } = reachableFiles();
    // Guard against the scan silently matching nothing.
    expect(reachable.size).toBeGreaterThan(20);
    const violations = [...reachable]
      .filter((f) => /src[\\/](services|firebase)[\\/]/.test(f))
      .map((f) => chainText(f, chain));
    expect(violations).toEqual([]);
    // A stale exception must fail too, or the allowlist can quietly grow teeth.
    expect([...hitEdges].sort()).toEqual(
      KNOWN_EDGES.map((e) => e.join(" -> ")).sort(),
    );
  });
});
