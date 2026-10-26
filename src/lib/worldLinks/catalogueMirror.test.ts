import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogueRows, WORLD_LINK_PAIRS } from "@edge-shared/worldLinkCatalogue.ts";

const MIGRATIONS = join(import.meta.dirname, "../../../supabase/migrations");

/**
 * The database refuses a link whose type is not in `private.world_link_types`; the
 * client offers only what the catalogue module lists. This holds the two equal:
 * the newest migration that seeds the catalogue (between its `catalogue:start` and
 * `catalogue:end` markers) must hold exactly the module's rows.
 */
function seededRows(): string[] {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const seeding = files.filter((f) => readFileSync(join(MIGRATIONS, f), "utf8").includes("-- catalogue:start"));
  const newest = seeding.at(-1);
  if (!newest) throw new Error("no migration seeds private.world_link_types");
  const sql = readFileSync(join(MIGRATIONS, newest), "utf8");
  const block = sql.slice(sql.indexOf("-- catalogue:start"), sql.indexOf("-- catalogue:end"));
  return [...block.matchAll(/\('(\w+)', '(\w+)', '(\w+)', (true|false)\)/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}|${m[4]}`);
}

describe("world link catalogue", () => {
  it("is seeded into the database exactly as the module lists it", () => {
    const fromModule = catalogueRows().map((r) => `${r.from_kind}|${r.to_kind}|${r.type}|${r.symmetric}`);
    expect(seededRows().sort()).toEqual(fromModule.sort());
  });

  it("names every type once per pair, with a word each way", () => {
    for (const pair of WORLD_LINK_PAIRS) {
      const keys = [...pair.types.map((t) => t.key), ...(pair.records ?? []).map((r) => r.key)];
      expect(new Set(keys).size, pair.pair).toBe(keys.length);
      for (const t of pair.types) {
        expect(t.forward.length, `${pair.pair}.${t.key}`).toBeGreaterThan(0);
        expect(t.reverse.length, `${pair.pair}.${t.key}`).toBeGreaterThan(0);
        if (t.symmetric) expect(t.reverse, `${pair.pair}.${t.key}`).toBe(t.forward);
      }
    }
  });

  it("never lets two pairs claim the same two kinds", () => {
    const seen = new Set<string>();
    for (const pair of WORLD_LINK_PAIRS) {
      for (const from of pair.from) {
        for (const to of pair.to) {
          const key = `${from}>${to}`;
          expect(seen.has(key), key).toBe(false);
          seen.add(key);
        }
      }
    }
  });
});
