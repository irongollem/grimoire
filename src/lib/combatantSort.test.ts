import { describe, it, expect } from "vitest";
import { sortCombatantsByInitiative, compareCombatantsByInitiative, initiativeModifier } from "./combatantSort";
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

describe("initiativeModifier", () => {
  it("falls back to dex_mod when initiative_bonus is absent (2014 monsters, NPCs, players)", () => {
    expect(initiativeModifier(c({ instance_id: "a", dex_mod: 3 }))).toBe(3);
  });

  it("falls back to dex_mod when initiative_bonus is explicitly null", () => {
    expect(initiativeModifier(c({ instance_id: "a", dex_mod: 2, initiative_bonus: null }))).toBe(2);
  });

  it("uses initiative_bonus outright when present, ignoring dex_mod", () => {
    expect(initiativeModifier(c({ instance_id: "a", dex_mod: 0, initiative_bonus: 14 }))).toBe(14);
  });

  it("uses initiative_bonus even when it is 0, distinct from a dex_mod fallback", () => {
    expect(initiativeModifier(c({ instance_id: "a", dex_mod: 5, initiative_bonus: 0 }))).toBe(0);
  });
});
