import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Holds every source file to `safeLocalStorage.ts` (#1043). Reading
 * `localStorage` or `sessionStorage` directly throws in a browser that blocks
 * site data, `typeof localStorage` included, and VueUse's `useLocalStorage` /
 * `useSessionStorage` read the property outside their own try/catch. One such
 * read at module scope is enough to stop the app starting, so none are allowed:
 * go through `safeLocalStorage()` / `safeSessionStorage()`, and for a reactive
 * value `useStorage(key, default, safeLocalStorage(), ...)`.
 *
 * The patterns match code, not prose: a comment that says "kept in
 * localStorage" passes, one that quotes `localStorage.getItem(` does not, and
 * should be reworded rather than allow-listed.
 */

const SRC = join(__dirname, "..");
const ALLOWED = new Set(["lib/safeLocalStorage.ts"]);

const FORBIDDEN: RegExp[] = [
  /(?<![\w$])(?:window\.|globalThis\.)?(?:local|session)Storage\s*(?:\?\.|\.(?=[A-Za-z_$])|\[)/,
  /typeof\s+(?:window\.|globalThis\.)?(?:local|session)Storage\b/,
  /\buse(?:Local|Session)Storage\s*[<(]/,
  /[=(,:]\s*(?:window\.|globalThis\.)?(?:local|session)Storage\s*[,);]/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|vue)$/.test(name) || name.endsWith(".test.ts") || name.endsWith(".d.ts")) return [];
    return [path];
  });
}

describe("storage access", () => {
  it("goes through safeLocalStorage everywhere", () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const rel = relative(SRC, path);
      if (ALLOWED.has(rel)) continue;
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (FORBIDDEN.some((pattern) => pattern.test(line))) offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
