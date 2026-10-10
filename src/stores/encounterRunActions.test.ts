import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";

function monster(id: string, initiative: number): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: "f",
    initiative,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
  };
}

describe("runner limited abilities", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.restoreAllMocks());

  it("useAction marks a spend and restoreAction clears it", () => {
    const store = useEncounterRunStore();
    store.combatants = [monster("a", 10)];
    store.useAction("a", "Fire Breath", { recharge: { min: 5, max: 6 } });
    expect(store.combatants[0].action_uses?.["Fire Breath"].used).toBe(1);
    store.restoreAction("a", "Fire Breath");
    expect(store.combatants[0].action_uses?.["Fire Breath"].used).toBe(0);
  });

  it("surfaces the recharge roll of the combatant whose turn begins", () => {
    // Math.random 0.99 -> d6 of 6, inside Recharge 5-6.
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const store = useEncounterRunStore();
    store.combatants = [monster("a", 20), monster("b", 5)];
    store.started = true;
    store.round = 1;
    store.useAction("b", "Fire Breath", { recharge: { min: 5, max: 6 } });
    store.nextTurn();
    expect(store.lastRechargeEvents).toEqual([{ instanceId: "b", action: "Fire Breath", roll: 6, recharged: true }]);
    expect(store.combatants.find((c) => c.instance_id === "b")?.action_uses?.["Fire Breath"].used).toBe(0);
  });

  it("clears the recharge lines on a turn that rolls none", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const store = useEncounterRunStore();
    store.combatants = [monster("a", 20), monster("b", 5)];
    store.started = true;
    store.round = 1;
    store.useAction("b", "Fire Breath", { recharge: { min: 5, max: 6 } });
    store.nextTurn();
    expect(store.lastRechargeEvents).toEqual([{ instanceId: "b", action: "Fire Breath", roll: 1, recharged: false }]);
    store.nextTurn();
    expect(store.lastRechargeEvents).toEqual([]);
  });

  it("restoreAction drops that instance's recharge line for the action", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const store = useEncounterRunStore();
    store.combatants = [monster("a", 20), monster("b", 5)];
    store.started = true;
    store.round = 1;
    store.useAction("b", "Fire Breath", { recharge: { min: 5, max: 6 } });
    store.nextTurn();
    expect(store.lastRechargeEvents).toHaveLength(1);
    store.restoreAction("b", "Fire Breath");
    expect(store.lastRechargeEvents).toEqual([]);
  });
});
