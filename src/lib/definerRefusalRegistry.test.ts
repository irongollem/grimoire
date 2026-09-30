import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The other half of supabase/tests/definer_refusal_registry.test.sql (#936).
 *
 * That file holds the list of client-callable SECURITY DEFINER functions equal
 * to the replayed schema and classifies each. For every one it marks `refuses`,
 * this file requires the proof: somewhere in supabase/tests/ a `throws_ok` or
 * an `is_empty` must call it, which is a test running it as someone who must
 * not be allowed and asserting it raises or answers nothing. pgTAP cannot read
 * its own directory, so the cross-check lives here, the same arrangement as
 * campaignSyncTables.test.ts and live_sync_registry.test.sql.
 */
const TESTS_DIR = resolve(process.cwd(), "supabase/tests");
const REGISTRY = "definer_refusal_registry.test.sql";

function registryBlock(): string {
  const sql = readFileSync(resolve(TESTS_DIR, REGISTRY), "utf8");
  const block = /insert into definer_registry \(name, kind, reason\) values([\s\S]*?);\n/.exec(sql);
  if (!block) throw new Error(`could not find the registry in ${REGISTRY}`);
  return block[1];
}

function registry(): { name: string; kind: string }[] {
  return [...registryBlock().matchAll(/\('([a-z0-9_]+)', '(refuses|self|public)'/g)].map((m) => ({
    name: m[1],
    kind: m[2],
  }));
}

/** Every refusal-shaped assertion in the suite, as the text between its
 *  opening parenthesis and the end of its statement. */
function refusalAssertions(): string[] {
  const out: string[] = [];
  for (const file of readdirSync(TESTS_DIR)) {
    if (!file.endsWith(".sql") || file === REGISTRY) continue;
    const sql = readFileSync(resolve(TESTS_DIR, file), "utf8");
    for (const m of sql.matchAll(/\b(?:throws_ok|is_empty)\s*\(([\s\S]*?)\);/g)) out.push(m[1]);
  }
  return out;
}

describe("SECURITY DEFINER refusal registry", () => {
  const entries = registry();

  it("reads the whole registry", () => {
    // The SQL side holds this list equal to pg_proc; a parse that silently
    // dropped rows would let an unproven function through here. So every row
    // of the values list must parse. Counted against the rows themselves rather
    // than a fixed floor, because the registry is meant to shrink: #936 turned
    // 23 definers into invokers, and a floor of 90 read that as a parse failure.
    const rows = [...registryBlock().matchAll(/^\s*\('/gm)];
    expect(rows.length).toBeGreaterThan(0);
    expect(entries.length).toBe(rows.length);
    expect(new Set(entries.map((e) => e.name)).size).toBe(entries.length);
  });

  it("has a refusal test for every function that must refuse the wrong caller", () => {
    const assertions = refusalAssertions();
    const unproven = entries
      .filter((e) => e.kind === "refuses")
      .map((e) => e.name)
      .filter((name) => !assertions.some((a) => new RegExp(`\\b${name}\\s*\\(`).test(a)));
    expect(unproven).toEqual([]);
  });
});
