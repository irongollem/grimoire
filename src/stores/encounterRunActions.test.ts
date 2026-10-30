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

  it("keeps the recharge lines through commands that are not a turn change", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const store = useEncounterRunStore();
    store.combatants = [monster("a", 20), monster("b", 5)];
    store.started = true;
    store.round = 1;
    store.useAction("b", "Fire Breath", { recharge: { min: 5, max: 6 } });
    store.nextTurn();
    expect(store.lastRechargeEvents).toHaveLength(1);
    store.adjustHp("a", -2);
    expect(store.lastRechargeEvents).toHaveLength(1);
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

describe("stat blocks written mid-fight", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const sb = (hp: string, ac: number) => ({
    armor_class: ac, hit_points: hp, speed: "30 ft.", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    challenge_rating: "1", defenses: { resistances: [], immunities: [], vulnerabilities: [], condition_immunities: [] },
  });

  it("a stat-less NPC and a blank monster each take their own source's numbers", () => {
    const store = useEncounterRunStore();
    store.availableNpcs = [{ id: "n1", name: "Guard", stat_block: null }] as unknown as typeof store.availableNpcs;
    store.availableMonsters = [{ id: "m1", name: "Thing", size: "medium", stat_block: sb("", 10) }] as unknown as typeof store.availableMonsters;
    store.addNpc("n1", "enemy", 1);
    store.addMonster("m1", "enemy", 1);

    store.availableNpcs = [{ id: "n1", name: "Guard", stat_block: sb("2d8", 16) }] as unknown as typeof store.availableNpcs;
    store.availableMonsters = [{ id: "m1", name: "Thing", size: "medium", stat_block: sb("4d10", 13) }] as unknown as typeof store.availableMonsters;
    store.adoptStatBlocks();

    const guard = store.combatants.find((c) => c.npc_id === "n1");
    const thing = store.combatants.find((c) => c.monster_id === "m1");
    expect([guard?.max_hp, guard?.ac]).toEqual([9, "16"]); // 2d8 averages 9
    expect([thing?.max_hp, thing?.ac]).toEqual([22, "13"]); // 4d10 averages 22
  });
});
