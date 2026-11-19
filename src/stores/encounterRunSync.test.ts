import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { ConfirmedFight, ObservedRow } from "@/lib/encounters/fightSync";
import type { AppliedCondition } from "@/types/condition.types";
import type { RunCombatant } from "@/types/encounter.types";

// The store sends its own batches; these tests drive the link by hand, so a send never gets an answer here.
const wire = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/encounters/fightWire", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/encounters/fightWire")>()),
  postFightBatch: wire.post,
}));

const hold: AppliedCondition = { name: "Paralyzed", source: { id: "mage", spell: "Hold Person", concentration: true } };

function creature(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: "f",
    initiative: 10,
    hp: 20,
    max_hp: 30,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...over,
  };
}

function confirmed(version: number, combatants: RunCombatant[], over: Partial<ConfirmedFight> = {}): ConfirmedFight {
  return { combatants, round: 1, activeIndex: 0, eventsFired: [], lairFiredRounds: [], version, ...over };
}

const meta = { encounterId: "enc-1", encounterName: "Ambush", factions: [], events: [], traps: [] };
const hpOf = (store: ReturnType<typeof useEncounterRunStore>, id: string) => store.combatants.find((c) => c.instance_id === id)?.hp;

describe("the store with a fight attached (#1201 stage 2c)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    wire.post.mockReset();
    wire.post.mockReturnValue(new Promise(() => {}));
  });
  afterEach(() => useEncounterRunStore().$dispose());

  function attached(...combatants: RunCombatant[]) {
    const store = useEncounterRunStore();
    store.startFight(meta, confirmed(5, combatants));
    return { store };
  }

  it("fails if a command is not shown before the server has answered, or is not handed to the sender for its own fight", async () => {
    const { store } = attached(creature("ogre"));
    store.adjustHp("ogre", -4);
    expect(hpOf(store, "ogre")).toBe(16);
    await Promise.resolve();
    expect(wire.post).toHaveBeenCalledWith("enc-1", expect.any(String), [expect.objectContaining({ type: "adjust_hp" })]);
    expect(store.nextBatch()?.commands).toEqual([{ type: "adjust_hp", instanceId: "ogre", delta: -4, critical: undefined }]);
  });

  it("fails if the same batch does not come back until it is answered (a re-send would carry a new id)", () => {
    const { store } = attached(creature("ogre"));
    store.adjustHp("ogre", -4);
    const first = store.nextBatch();
    store.adjustHp("ogre", -1);
    expect(store.nextBatch()?.id).toBe(first?.id);
    store.answered(first!.id, confirmed(6, [creature("ogre", { hp: 16 })]), []);
    // The reply took the first command; the second is still pending, laid over it.
    expect(hpOf(store, "ogre")).toBe(15);
    expect(store.nextBatch()?.commands).toHaveLength(1);
  });

  it("fails if two DMs dealing 4 and 3 to a creature at 20 do not both end on 13", () => {
    const { store } = attached(creature("ogre"));
    store.adjustHp("ogre", -4);
    const batch = store.nextBatch()!;
    // The other DM's 3 landed first: the row says 17 and does not hold my batch.
    const row: ObservedRow = { ...confirmed(6, [creature("ogre", { hp: 17 })]), appliedIds: [] };
    store.observed(row);
    expect(hpOf(store, "ogre")).toBe(13);
    store.answered(batch.id, confirmed(7, [creature("ogre", { hp: 13 })]), []);
    expect(hpOf(store, "ogre")).toBe(13);
  });

  it("fails if a read with an older or equal version changes what is shown", () => {
    const { store } = attached(creature("ogre"));
    store.observed({ ...confirmed(5, [creature("ogre", { hp: 1 })]), appliedIds: [] });
    store.observed({ ...confirmed(4, [creature("ogre", { hp: 1 })]), appliedIds: [] });
    expect(hpOf(store, "ogre")).toBe(20);
    store.observed({ ...confirmed(6, [creature("ogre", { hp: 2 })]), appliedIds: [] });
    expect(hpOf(store, "ogre")).toBe(2);
  });

  it("fails if a command that needs dice is shown with the browser's dice, or the fight is not busy until the server answers", () => {
    const dragon = creature("dragon", { initiative: 12, action_uses: { "Fire Breath": { used: 1, recharge: { min: 5, max: 6 } } } });
    const { store } = attached(dragon, creature("imp", { initiative: 3 }));
    store.started = true;
    store.round = 1;
    // Reshuffling asks for a d20 per creature.
    store.reshuffleInitiative();
    expect(store.busy).toBe(true);
    expect(store.combatants.map((c) => c.initiative)).toEqual([12, 3]);
    const batch = store.nextBatch()!;
    store.answered(batch.id, confirmed(6, [{ ...dragon, initiative: 18 }, creature("imp", { initiative: 7 })]), []);
    expect(store.busy).toBe(false);
    expect(store.combatants.map((c) => c.initiative)).toEqual([18, 7]);
  });

  it("fails if an optimistic concentration check is raised again by the reply to the same batch", () => {
    const { store } = attached(creature("mage"), creature("g", { conditions: [hold] }));
    store.adjustHp("mage", -4);
    expect(store.concentrationChecks).toHaveLength(1);
    const batch = store.nextBatch()!;
    store.answered(
      batch.id,
      confirmed(6, [creature("mage", { hp: 16 }), creature("g", { conditions: [hold] })]),
      [{ type: "concentration_check_due", instanceId: "mage", damage: 4 }],
    );
    expect(store.concentrationChecks).toHaveLength(1);
  });

  it("fails if the effects of a command that waited for the server are not shown from its reply", () => {
    const dragon = creature("dragon", { initiative: 12, action_uses: { "Fire Breath": { used: 1, recharge: { min: 5, max: 6 } } } });
    const { store } = attached(dragon, creature("imp", { initiative: 3 }));
    store.started = true;
    store.round = 1;
    store.reshuffleInitiative();
    const batch = store.nextBatch()!;
    store.answered(batch.id, confirmed(6, [dragon, creature("imp")]), [{ type: "action_recharged", instanceId: "dragon", action: "Fire Breath", roll: 6 }]);
    expect(store.lastRechargeEvents).toEqual([{ instanceId: "dragon", action: "Fire Breath", roll: 6, recharged: true }]);
  });

  it("fails if dropping the pending commands keeps what a fight that ended no longer holds", () => {
    const { store } = attached(creature("ogre"));
    store.adjustHp("ogre", -4);
    store.dropPendingCommands();
    expect(hpOf(store, "ogre")).toBe(20);
    expect(store.hasQueued()).toBe(false);
  });

  it("fails if the screen's own arrays are the ones the server confirmed (an edit through the screen would corrupt the confirmed fight)", () => {
    const { store } = attached(creature("ogre"));
    store.combatants[0]!.hp = 1; // a component mutating in place
    // An answer older than what is confirmed changes nothing but makes the store show the confirmed fight again.
    store.answered(null, confirmed(4, [creature("ogre", { hp: 99 })]), []);
    expect(hpOf(store, "ogre")).toBe(20);
  });

  it("fails if a store with no fight attached queues anything (a component test would grow a queue nobody sends)", () => {
    const store = useEncounterRunStore();
    store.combatants = [creature("ogre")];
    store.adjustHp("ogre", -4);
    expect(hpOf(store, "ogre")).toBe(16);
    expect(store.hasQueued()).toBe(false);
  });
});
