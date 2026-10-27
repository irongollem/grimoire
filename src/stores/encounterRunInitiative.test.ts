import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("a second roll request while one is open does nothing, so a prompt is never asked twice", async () => {
    const store = useEncounterRunStore();
    let answer: (v: number | null) => void = () => {};
    const roller = vi.fn(() => new Promise<number | null>((resolve) => { answer = resolve; }));
    store.setInitiativeRoller(roller);
    store.combatants = [combatant("a"), combatant("b")];

    const first = store.rollInitiative("a");
    await store.rollInitiative("b");
    expect(await store.rollAllInitiatives()).toBe(false);
    expect(roller).toHaveBeenCalledTimes(1);
    answer(9);
    await first;
    expect(store.combatants.map((c) => c.initiative)).toEqual([9, null]);
  });

  it("a cancelled per-row roll keeps the value the row already had", async () => {
    const store = useEncounterRunStore();
    store.setInitiativeRoller(async () => null);
    store.combatants = [combatant("a", { initiative: 14 })];
    await store.rollInitiative("a");
    expect(store.combatants[0]!.initiative).toBe(14);
  });

  it("a per-row roll replaces an existing value, unlike rolling for everyone", async () => {
    const store = useEncounterRunStore();
    store.setInitiativeRoller(async () => 5);
    store.combatants = [combatant("a", { initiative: 14 })];
    await store.rollInitiative("a");
    expect(store.combatants[0]!.initiative).toBe(5);
  });

  it("starting combat that is already under way asks nobody to roll", async () => {
    const store = useEncounterRunStore();
    const roller = vi.fn(async () => 3);
    store.setInitiativeRoller(roller);
    store.combatants = [combatant("a", { initiative: 15 }), monster("late")];
    store.started = true;
    store.round = 2;
    await store.startCombat();
    expect(roller).not.toHaveBeenCalled();
  });

  it("ingested temp HP is taken as the sheet says it, and 0 clears it", () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("a")];
    store.ingestTempHp("a", 6);
    expect(store.combatants[0]!.temp_hp).toBe(6);
    store.ingestTempHp("a", 0);
    expect(store.combatants[0]!.temp_hp).toBeUndefined();
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

describe("runner turn reducer wiring", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("lists the conditions that ended on a turn change, and only those, each turn", () => {
    const store = useEncounterRunStore();
    // Prone from "a" for one round: it ends when "a"'s next turn begins.
    const prone = { name: "Prone", source: { id: "a" }, ends: { kind: "rounds" as const, remaining: 1 } };
    store.combatants = [monster("a", { initiative: 20 }), monster("b", { initiative: 5, conditions: [prone] })];
    store.started = true;
    store.round = 1;
    store.nextTurn(); // b's turn
    expect(store.lastConditionEvents).toEqual([]);
    store.nextTurn(); // round 2, a's turn: Prone lapses
    expect(store.lastConditionEvents.map((e) => [e.instanceId, e.name])).toEqual([["b", "Prone"]]);
    store.nextTurn(); // nothing ends: the old line is replaced, not kept
    expect(store.lastConditionEvents).toEqual([]);
  });

  it("nextTurn fires an auto event on the new turn and clears surprise at turn end", () => {
    const store = useEncounterRunStore();
    store.combatants = [monster("a", { initiative: 20, surprised: true }), monster("b", { initiative: 5 })];
    store.started = true;
    store.round = 1;
    store.events = [
      {
        id: "e1",
        name: "Round two",
        trigger: { type: "round_start", round: 2 },
        fire_once: true,
        actions: [{ type: "broadcast_message", message: "Round two!" }],
      } as unknown as (typeof store.events)[number],
    ];
    store.nextTurn();
    expect(store.combatants.find((c) => c.instance_id === "a")?.surprised).toBe(false);
    expect(store.activeIndex).toBe(1);
    store.nextTurn();
    expect(store.round).toBe(2);
    expect(store.eventsFired).toContain("e1");
  });
});
