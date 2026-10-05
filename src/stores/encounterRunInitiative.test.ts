import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";

function combatant(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "player",
    name: id,
    faction_id: "f",
    initiative: null,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    party_member_id: `pm-${id}`,
    dex_mod: 0,
    ...over,
  };
}

const monster = (id: string, over: Partial<RunCombatant> = {}) =>
  combatant(id, { type: "monster", party_member_id: undefined, ...over });

describe("runner initiative", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("rolling for everyone fills the blanks, never overwrites, and does not start combat", async () => {
    const store = useEncounterRunStore();
    store.setInitiativeRoller(async () => 7);
    store.combatants = [combatant("a", { initiative: 18 }), combatant("b"), monster("m")];
    store.round = 0;

    expect(await store.rollAllInitiatives()).toBe(true);

    expect(store.combatants.map((c) => c.initiative)).toEqual([18, 7, 7]);
    expect(store.started).toBe(false);
    expect(store.round).toBe(0);
  });

  it("cancelling a prompt leaves the rest blank and reports it", async () => {
    const store = useEncounterRunStore();
    let calls = 0;
    store.setInitiativeRoller(async () => (++calls === 1 ? 12 : null));
    store.combatants = [combatant("a"), combatant("b"), combatant("c")];

    expect(await store.rollAllInitiatives()).toBe(false);
    expect(store.combatants.map((c) => c.initiative)).toEqual([12, null, null]);
  });

  it("starting combat rolls only the missing and moves to round 1", async () => {
    const store = useEncounterRunStore();
    store.setInitiativeRoller(async () => 3);
    store.combatants = [combatant("a", { initiative: 15 }), combatant("b")];
    store.round = 0;

    await store.startCombat();

    expect(store.combatants.map((c) => c.initiative)).toEqual([15, 3]);
    expect(store.started).toBe(true);
    expect(store.round).toBe(1);
  });

  it("names the party members who have not rolled, not monsters or companions", () => {
    const store = useEncounterRunStore();
    store.combatants = [
      combatant("a", { initiative: 4 }),
      combatant("b"),
      monster("m"),
      combatant("c", { party_member_id: undefined, companion_id: "comp-1" }),
    ];
    expect(store.unrolledPlayers.map((c) => c.instance_id)).toEqual(["b"]);
  });

  it("marks equal totals as tied and leaves blanks out", () => {
    const store = useEncounterRunStore();
    store.combatants = [
      combatant("a", { initiative: 13 }),
      monster("m", { initiative: 13 }),
      combatant("b", { initiative: 9 }),
      combatant("c"),
      monster("n"),
    ];
    expect([...store.tiedInstanceIds].sort()).toEqual(["a", "m"]);
  });

  it("clearing blanks party members only", () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a", { initiative: 13 }), monster("m", { initiative: 13 })];
    store.clearPlayerInitiatives();
    expect(store.combatants.map((c) => c.initiative)).toEqual([null, 13]);
  });
});
