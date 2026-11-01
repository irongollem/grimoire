import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

/**
 * Game-system-neutral surfaces must not import game-system rules (epic #934).
 * Append a folder or file here as each system is split; `src/systems/<system>/`
 * may import the core, never the other way round. A neutral surface learns
 * which system applies only through `@/systems/registry`.
 */
const NEUTRAL = [
  "src/lib/dice",
  "src/composables/dice",
  "src/directives",
  "src/components/common/dice",
  "src/components/chat",
  "src/lib/dashboard/quickDice.ts",
  "src/components/dashboard/widgets/QuickDiceWidget.vue",
];

/** The core never picks a system: it takes rules as a parameter. */
const CORE = "src/lib/dice";

/** Any `@/systems/` import (static or dynamic) except the registry. */
const SYSTEM_IMPORT = /(?:from\s+|import\s*\(\s*)["']@\/systems\/(?!registry["'])/;
const REGISTRY_IMPORT = /(?:from\s+|import\s*\(\s*)["']@\/systems\/registry["']/;
const DAMAGE_TYPES_IMPORT = /(?:from\s+|import\s*\(\s*)["']@\/types\/damage\.types["']/;

const SRC_ROOT = join(import.meta.dirname, "..");
const REPO_ROOT = join(SRC_ROOT, "..");

function sourceFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => {
    const full = join(path, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    const isSource = [".ts", ".vue"].includes(extname(e.name));
    return isSource && !e.name.endsWith(".test.ts") ? [full] : [];
  });
}

function offenders(entry: string, re: RegExp): string[] {
  return sourceFiles(join(REPO_ROOT, entry))
    .filter((f) => re.test(readFileSync(f, "utf8")))
    .map((f) => relative(REPO_ROOT, f));
}

describe("neutral surfaces", () => {
  it.each(NEUTRAL)(
    "%s imports no game-system module but the registry (a 5e rule leaking back into a neutral surface)",
    (entry) => {
      expect(sourceFiles(join(REPO_ROOT, entry)).length).toBeGreaterThan(0);
      expect(offenders(entry, SYSTEM_IMPORT)).toEqual([]);
    },
  );

  it("the dice core never imports the registry (the core picking a system instead of taking rules)", () => {
    expect(offenders(CORE, REGISTRY_IMPORT)).toEqual([]);
  });

  it("the dice core imports no damage-type table (5e damage types leaking into the core)", () => {
    expect(offenders(CORE, DAMAGE_TYPES_IMPORT)).toEqual([]);
  });
});
