import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";

function combatant(id: string, initiative: number): RunCombatant {
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
    position: { x: 1, y: 1 },
  };
}

function fight() {
  const store = useEncounterRunStore();
  store.combatants = [combatant("a", 20), combatant("b", 5)];
  store.started = true;
  store.round = 1;
  return store;
}
const used = (store: ReturnType<typeof fight>, id: string) => store.combatants.find((c) => c.instance_id === id)?.movement_used;

// #1125 decision 11: Back to start and Ctrl Z take back this turn's moves, position and feet.
describe("taking back a move", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("Ctrl Z returns the square the last move left and gives its feet back", () => {
    const store = fight();
    store.recordMove("a", { x: 1, y: 1 }, 15);
    store.recordMove("a", { x: 4, y: 1 }, 10);
    expect(used(store, "a")).toBe(25);
    expect(store.undoMove("a", "last")).toEqual({ from: { x: 4, y: 1 }, feet: 10 });
    expect(used(store, "a")).toBe(15);
  });

  it("Back to start returns the square the turn began on and every foot of it", () => {
    const store = fight();
    store.recordMove("a", { x: 1, y: 1 }, 15);
    store.recordMove("a", { x: 4, y: 1 }, 10);
    expect(store.undoMove("a", "all")).toEqual({ from: { x: 1, y: 1 }, feet: 25 });
    expect(used(store, "a")).toBe(0);
    expect(store.undoMove("a", "last")).toBeNull();
  });

  it("a token that has not moved has nothing to take back", () => {
    expect(fight().undoMove("a", "all")).toBeNull();
  });

  it("each token has its own history", () => {
    const store = fight();
    store.recordMove("a", { x: 1, y: 1 }, 5);
    expect(store.undoMove("b", "last")).toBeNull();
  });

  it("the next turn begins with nothing moved and nothing to undo", () => {
    const store = fight();
    store.recordMove("a", { x: 1, y: 1 }, 30);
    store.nextTurn();
    expect(used(store, "a")).toBe(30);
    expect(store.undoMove("a", "all")).toBeNull();
    store.nextTurn();
    expect(used(store, "a")).toBe(0);
  });

  it("the turn's action and bonus action are marked and reset when the turn comes round again", () => {
    const store = fight();
    store.setActionUsed("a", true);
    store.setBonusUsed("a", true);
    expect(store.combatants.find((c) => c.instance_id === "a")).toMatchObject({ action_used: true, bonus_used: true });
    store.nextTurn();
    store.nextTurn();
    expect(store.combatants.find((c) => c.instance_id === "a")).toMatchObject({ action_used: false, bonus_used: false });
  });
});
