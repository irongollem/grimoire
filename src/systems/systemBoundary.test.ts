import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

/**
 * Game-system-neutral folders must not import game-system rules (epic #934).
 * Append a folder here as each system is split; `src/systems/<system>/` may
 * import the core, never the other way round.
 */
const NEUTRAL_FOLDERS = ["src/lib/dice"];

/** Imports a neutral folder may never contain. */
const FORBIDDEN = [/from\s+["']@\/systems\//, /from\s+["']@\/types\/damage\.types["']/, /import\s*\(\s*["']@\/systems\//];

const SRC_ROOT = join(import.meta.dirname, "..");
const REPO_ROOT = join(SRC_ROOT, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    const isSource = [".ts", ".vue"].includes(extname(e.name));
    return isSource && !e.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("neutral folders", () => {
  it.each(NEUTRAL_FOLDERS)(
    "%s imports no game-system module (a 5e rule leaking back into the neutral dice core)",
    (folder) => {
      const files = sourceFiles(join(REPO_ROOT, folder));
      expect(files.length).toBeGreaterThan(0);
      const offenders = files.filter((f) => {
        const text = readFileSync(f, "utf8");
        return FORBIDDEN.some((re) => re.test(text));
      });
      expect(offenders.map((f) => relative(REPO_ROOT, f))).toEqual([]);
    },
  );
});
