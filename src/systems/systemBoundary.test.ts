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
  "src/lib/currency",
  "src/composables/dice",
  "src/directives",
  "src/components/common/dice",
  "src/components/chat",
  "src/lib/dashboard/quickDice.ts",
  "src/components/dashboard/widgets/QuickDiceWidget.vue",
  // The surfaces that filter through the registry (#934): they name a feature, never a system.
  "src/lib/nav.ts",
  "src/lib/playerNav.ts",
  "src/lib/dashboard/widgetCatalog.ts",
  "src/lib/dashboard/arrangeOps.ts",
  "src/router/systemFeatures.ts",
];

/** The core never picks a system: it takes rules as a parameter. */
const CORE = "src/lib/dice";

/**
 * Any import of a game-system module (static or dynamic) except the registry, through the `@/` alias or by a
 * relative path. Relative paths with a `.ts` extension are how code shared with the edge functions imports
 * (`src/rules/edgeImportable.test.ts`), so the alias alone no longer covers every way in. Nothing listed in NEUTRAL
 * lives under `src/systems/`, so a relative path with a `systems/` segment can only point into it.
 */
const INTO_SYSTEMS = String.raw`["'](?:@\/|\.{1,2}\/(?:[^"']*\/)?)systems\/`;
const SYSTEM_IMPORT = new RegExp(String.raw`(?:from\s+|import\s*\(\s*|import\s+)` + INTO_SYSTEMS + String.raw`(?!registry(?:\.ts)?["'])`);
const REGISTRY_IMPORT = new RegExp(String.raw`(?:from\s+|import\s*\(\s*)` + INTO_SYSTEMS + String.raw`registry(?:\.ts)?["']`);
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

describe("what counts as importing a game system", () => {
  it("catches a relative import into src/systems, not only the alias (a 5e rule reaching the dice core by ../../)", () => {
    expect(SYSTEM_IMPORT.test('import { rules } from "@/systems/dnd5e/dice/rules";')).toBe(true);
    expect(SYSTEM_IMPORT.test('import { rules } from "../../systems/dnd5e/dice/rules.ts";')).toBe(true);
    expect(SYSTEM_IMPORT.test('const m = await import("../systems/dnd5e/currency/index.ts");')).toBe(true);
  });

  it("lets the registry through by either spelling, and leaves a sibling file alone", () => {
    expect(SYSTEM_IMPORT.test('import { offers } from "@/systems/registry";')).toBe(false);
    expect(SYSTEM_IMPORT.test('import { offers } from "../systems/registry.ts";')).toBe(false);
    expect(SYSTEM_IMPORT.test('import { rollDie } from "./dice.ts";')).toBe(false);
    expect(REGISTRY_IMPORT.test('import { offers } from "../../systems/registry.ts";')).toBe(true);
  });
});

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
