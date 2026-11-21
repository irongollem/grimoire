import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Credits are held, released and charged only through `withCreditHold` / `settleHandedOff` (#1234).
 *
 * The 20 Nov 2026 audit found ~30 edge functions wiring `reserveCredits` -> model -> `releaseCredits` ->
 * `recordGeneration` by hand, and the copies had drifted into holds that leaked until the two-hour sweep, a second
 * release after a paid result, and spend that never reached the ledger. A fix in one copy never reached the others,
 * so the rule is structural: no file outside the credit modules may call these. (`recordFreeGeneration` is allowed: a
 * free platform call outside any hold, such as an embedding or a judgement, has nothing to hold.)
 */
const FUNCTIONS = resolve(process.cwd(), "supabase/functions");
const ALLOWED = new Set(["_shared/credits.ts", "_shared/pipeline/creditHold.ts"]);
const DIRECT_CALL = /\b(reserveCredits|releaseCredits|recordGeneration|recordSpend|spendCredits)\s*\(/g;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts") ? [path] : [];
  });
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
}

describe("credit calls", () => {
  it("#1234 go through the credit hold and nowhere else", () => {
    const offenders = sources(FUNCTIONS).flatMap((file) => {
      const rel = relative(FUNCTIONS, file);
      if (ALLOWED.has(rel)) return [];
      return [...withoutComments(readFileSync(file, "utf8")).matchAll(DIRECT_CALL)].map((m) => `${rel}: ${m[1]}`);
    });
    expect(offenders).toEqual([]);
  });
});
