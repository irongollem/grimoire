import { describe, it, expect } from "vitest";
import { sortCombatantsByInitiative, compareCombatantsByInitiative } from "./combatantSort";
import type { RunCombatant } from "@/types/encounter.types";

function c(partial: Partial<RunCombatant> & Pick<RunCombatant, "instance_id">): RunCombatant {
  return {
    type: "monster",
    name: "x",
    faction_id: "f",
    initiative: null,
    hp: 1,
    max_hp: 1,
    ac: "10",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...partial,
  } as RunCombatant;
}

describe("sortCombatantsByInitiative", () => {
  it("orders by initiative descending", () => {
    const out = sortCombatantsByInitiative([
      c({ instance_id: "a", initiative: 10 }),
      c({ instance_id: "b", initiative: 20 }),
      c({ instance_id: "c", initiative: 15 }),
    ]);
    expect(out.map((x) => x.instance_id)).toEqual(["b", "c", "a"]);
  });

  it("sorts unrolled (null) initiative last", () => {
    const out = sortCombatantsByInitiative([
      c({ instance_id: "a", initiative: null }),
      c({ instance_id: "b", initiative: 1 }),
    ]);
    expect(out.map((x) => x.instance_id)).toEqual(["b", "a"]);
  });

  it("breaks a tie with players before monsters", () => {
    const out = sortCombatantsByInitiative([
      c({ instance_id: "mon", type: "monster", initiative: 12 }),
      c({ instance_id: "pc", type: "player", initiative: 12 }),
    ]);
    expect(out.map((x) => x.instance_id)).toEqual(["pc", "mon"]);
  });

  it("breaks a same-type tie with higher dex_mod first", () => {
    const out = sortCombatantsByInitiative([
      c({ instance_id: "low", initiative: 12, dex_mod: 1 }),
      c({ instance_id: "high", initiative: 12, dex_mod: 3 }),
    ]);
    expect(out.map((x) => x.instance_id)).toEqual(["high", "low"]);
  });

  it("does not mutate the input array", () => {
    const input = [c({ instance_id: "a", initiative: 1 }), c({ instance_id: "b", initiative: 2 })];
    const before = input.map((x) => x.instance_id);
    sortCombatantsByInitiative(input);
    expect(input.map((x) => x.instance_id)).toEqual(before);
  });

  it("compare is symmetric in sign for a clear ordering", () => {
    const a = c({ instance_id: "a", initiative: 20 });
    const b = c({ instance_id: "b", initiative: 5 });
    expect(compareCombatantsByInitiative(a, b)).toBeLessThan(0);
    expect(compareCombatantsByInitiative(b, a)).toBeGreaterThan(0);
  });
});
