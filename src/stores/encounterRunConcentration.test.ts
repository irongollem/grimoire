import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { AppliedCondition } from "@/types/condition.types";
import type { RunCombatant } from "@/types/encounter.types";

const hold: AppliedCondition = { name: "Paralyzed", source: { id: "mage", spell: "Hold Person", concentration: true } };

function monster(id: string, conditions: AppliedCondition[] = []): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: "f",
    initiative: 10,
    hp: 20,
    max_hp: 20,
    ac: "12",
    conditions,
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
  };
}

describe("runner concentration checks (#1018)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  function setup() {
    const store = useEncounterRunStore();
    store.combatants = [monster("mage"), monster("g", [hold])];
    return store;
  }

  it("appends one check per damage instance on a holder", () => {
    const store = setup();
    store.adjustHp("mage", -4);
    store.adjustHp("mage", -6);
    expect(store.concentrationChecks).toHaveLength(2);
    expect(store.concentrationChecks.map((c) => c.damage)).toEqual([4, 6]);
    expect(new Set(store.concentrationChecks.map((c) => c.key)).size).toBe(2);
  });

  it("a kept check only clears itself", () => {
    const store = setup();
    store.adjustHp("mage", -4);
    store.resolveConcentrationCheck(store.concentrationChecks[0]!.key, true);
    expect(store.concentrationChecks).toEqual([]);
    expect(store.combatants[1]!.conditions).toEqual([hold]);
  });

  it("a lost check ends what the holder held", () => {
    const store = setup();
    store.adjustHp("mage", -4);
    store.resolveConcentrationCheck(store.concentrationChecks[0]!.key, false);
    expect(store.combatants[1]!.conditions).toEqual([]);
  });

  it("drops checks for a removed holder and on reset", () => {
    const store = setup();
    store.adjustHp("mage", -4);
    store.removeCombatant("mage");
    expect(store.concentrationChecks).toEqual([]);
    store.combatants = [monster("mage"), monster("g", [hold])];
    store.adjustHp("mage", -4);
    store.reset();
    expect(store.concentrationChecks).toEqual([]);
  });
});
