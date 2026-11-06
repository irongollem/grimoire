import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_SYSTEM_KEYS, editionGameSystem, gameSystemEdition, gameSystemsCompatible } from "@/systems/registry";

/**
 * The database holds the game systems as a check constraint and a few helper
 * functions (`campaigns_game_system_known`, `private.game_system_is_5e`,
 * `private.game_system_edition`); the client holds them in `registry.ts`. This
 * holds the two equal, so a system added to one side alone fails here instead of
 * as a constraint violation on someone's campaign insert. Same arrangement as
 * `calendarShapeMirror.test.ts`.
 */
const MIGRATION = resolve(process.cwd(), "supabase/migrations/20261106093841_campaigns_have_a_game_system.sql");
const sql = readFileSync(MIGRATION, "utf8");

/** The quoted keys inside the first parenthesised list after `anchor`. */
function quotedList(anchor: RegExp): string[] {
  const match = anchor.exec(sql);
  if (!match) throw new Error(`could not find ${anchor} in the game system migration`);
  return [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
}

describe("game systems: database and registry", () => {
  // Fails if a system is added to GAME_SYSTEM_KEYS without the check, or the other way round.
  it("the campaigns check constraint lists exactly the registry's systems", () => {
    const checked = quotedList(/campaigns_game_system_known\s+check \(game_system in \(([^)]*)\)\)/);
    expect([...checked].sort()).toEqual([...GAME_SYSTEM_KEYS].sort());
  });

  // Fails if the database treats a system as 5e that the registry gives no edition (or the reverse).
  it("the database's 5e systems are exactly the registry's systems with an edition", () => {
    const fiveE = quotedList(/select coalesce\(p_system in \(([^)]*)\), false\)/);
    const withEdition = GAME_SYSTEM_KEYS.filter((key) => gameSystemEdition(key) !== undefined);
    expect([...fiveE].sort()).toEqual([...withEdition].sort());
  });

  // Fails if an edition maps to a different system in the two places.
  it("each edition maps to the same system in both", () => {
    for (const edition of ["2014", "2024"] as const) {
      const system = editionGameSystem(edition);
      expect(sql).toContain(`when '${edition}' then return '${system}'`);
      expect(sql).toContain(`when '${system}' then return '${edition}'`);
    }
  });

  // Fails if the registry declares a compatibility the database's
  // `private.game_systems_compatible` (the same system, or both 5e) does not
  // share: the Rules tab would offer a switch the trigger then refuses.
  it("compatibility is the same in both, pair by pair", () => {
    const body = /function private\.game_systems_compatible[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? "";
    expect(body.replace(/\s+/g, " ")).toContain(
      "p_a = p_b or (private.game_system_is_5e(p_a) and private.game_system_is_5e(p_b))",
    );
    const fiveE = new Set(quotedList(/select coalesce\(p_system in \(([^)]*)\), false\)/));
    for (const a of GAME_SYSTEM_KEYS) {
      for (const b of GAME_SYSTEM_KEYS) {
        expect(gameSystemsCompatible(a, b), `${a} / ${b}`).toBe(a === b || (fiveE.has(a) && fiveE.has(b)));
      }
    }
  });
});
