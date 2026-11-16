import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every module an Edge Function reaches must resolve under Deno, which knows the
 * import map in supabase/functions/deno.json and nothing of Vite's `@/` or
 * `@edge-shared/` aliases. Edge functions import shared logic from `src/`, so a
 * `src/` file that switches one value import to an alias breaks the deploy of
 * every function that reaches it, and nothing before the release notices: vue-tsc,
 * vitest and the Vite build all resolve the alias happily. That happened on
 * 16 Nov 2026 (src/cartographer/authoringPlan.ts imported "@edge-shared/...",
 * tile-pack-generator stopped bundling, and production's schema ran ahead of its
 * functions until it was fixed).
 *
 * The walk mirrors the deploy bundler, which builds a code-only graph: type-only
 * imports (`import type`, `export type`) are erased and never resolved, so an
 * alias there is harmless and is skipped here too.
 */
const FUNCTIONS = resolve(process.cwd(), "supabase/functions");
const IMPORT_MAP = Object.keys(
  (JSON.parse(readFileSync(join(FUNCTIONS, "deno.json"), "utf8")) as { imports: Record<string, string> }).imports,
);

// `import x from "y"`, `export { x } from "y"`, `import "y"`, `import("y")`, but not `import type` / `export type`.
const VALUE_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?!type\s)(?:[^"'`;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function resolvesInImportMap(specifier: string): boolean {
  return IMPORT_MAP.some((key) => (key.endsWith("/") ? specifier.startsWith(key) : specifier === key));
}

function isRemote(specifier: string): boolean {
  return /^(?:npm|jsr|node|https?):/.test(specifier);
}

/** The value imports Deno could not resolve, as "importer: specifier", across everything `entry` reaches. */
function unresolvableImports(entry: string): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of withoutComments(readFileSync(file, "utf8")).matchAll(VALUE_IMPORT)) {
      const specifier = match[1] ?? match[2];
      if (isRemote(specifier) || resolvesInImportMap(specifier)) continue;
      if (!specifier.startsWith(".")) {
        problems.push(`${relative(process.cwd(), file)}: ${specifier}`);
        continue;
      }
      const target = resolve(dirname(file), specifier);
      if (existsSync(target)) queue.push(target);
      else problems.push(`${relative(process.cwd(), file)}: ${specifier} (no such file; Deno needs the extension)`);
    }
  }
  return problems;
}

function edgeFunctionEntries(): string[] {
  return readdirSync(FUNCTIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => join(FUNCTIONS, entry.name, "index.ts"))
    .filter((path) => existsSync(path));
}

describe("edge function import graph", () => {
  it("reaches only modules Deno can resolve", () => {
    const entries = edgeFunctionEntries();
    expect(entries.length).toBeGreaterThan(50);
    expect(entries.flatMap(unresolvableImports)).toEqual([]);
  });

  it("flags an alias value import and skips a type-only one", () => {
    // Guards the scan itself: a pattern that matched nothing would pass the test above for any code.
    const sample = [
      'import type { A } from "@/types/a";',
      'import { B } from "@edge-shared/b.ts";',
      'export { C } from "@/lib/c";',
      'const d = await import("@/lib/d");',
    ].join("\n");
    const found = [...withoutComments(sample).matchAll(VALUE_IMPORT)].map((m) => m[1] ?? m[2]);
    expect(found).toEqual(["@edge-shared/b.ts", "@/lib/c", "@/lib/d"]);
  });
});
