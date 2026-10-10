import { describe, expect, it } from "vitest";
import {
  actionAvailability,
  actionUseKey,
  actionLimit,
  reduceEncounterTurn,
  type EncounterTurnCommand,
  type EncounterTurnEvent,
  type EncounterTurnState,
} from "@/rules/encounterTurn";
import type { AppliedCondition } from "@/types/condition.types";
import type { RunCombatant, WildshapeState } from "@/types/encounter.types";
import type { StatBlockEntry } from "@/types/statBlock.types";

function combatant(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: "f",
    initiative: 10,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...over,
  };
}

function pc(id = "p-1", over: Partial<RunCombatant> = {}): RunCombatant {
  return combatant(id, { type: "player", party_member_id: `pm-${id}`, ...over });
}

function stateOf(combatants: RunCombatant[], over: Partial<EncounterTurnState> = {}): EncounterTurnState {
  return {
    combatants,
    round: 1,
    activeIndex: 0,
    started: true,
    randomizeInitiativeEachRound: false,
    lairEnabled: false,
    lairOwnerInstanceId: null,
    lairFiredRounds: [],
    ...over,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function run(state: EncounterTurnState, command: EncounterTurnCommand, deps?: { rollD20?: () => number; rollD6?: () => number }) {
  return reduceEncounterTurn(deepFreeze(structuredClone(state)), command, deps);
}

const types = (events: EncounterTurnEvent[]) => events.map((e) => e.type);
const find = (s: EncounterTurnState, id: string) => {
  const c = s.combatants.find((x) => x.instance_id === id);
  if (!c) throw new Error(`no ${id}`);
  return c;
};

describe("turn order", () => {
  const trio = () => [combatant("a", { initiative: 20 }), combatant("b", { initiative: 15 }), combatant("c", { initiative: 5 })];

  it("steps forward and emits turn_ended, turn_started, check_events", () => {
    const { state, events } = run(stateOf(trio()), { type: "next_turn" });
    expect(state.activeIndex).toBe(1);
    expect(state.round).toBe(1);
    expect(events).toEqual([
      { type: "turn_ended", instanceId: "a" },
      { type: "turn_started", instanceId: "b" },
      { type: "check_events", reason: "turn" },
    ]);
  });

  it("wraps into a new round: turn_ended, round_started, turn_started", () => {
    const { state, events } = run(stateOf(trio(), { activeIndex: 2 }), { type: "next_turn" });
    expect(state).toMatchObject({ activeIndex: 0, round: 2 });
    expect(events).toEqual([
      { type: "turn_ended", instanceId: "c" },
      { type: "round_started", round: 2 },
      { type: "turn_started", instanceId: "a" },
      { type: "check_events", reason: "turn" },
    ]);
  });

  it("skips dead monsters but not downed players", () => {
    const list = [combatant("a", { initiative: 20 }), combatant("dead", { initiative: 15, hp: 0 }), pc("p", { initiative: 10, hp: 0 })];
    expect(run(stateOf(list), { type: "next_turn" }).state.activeIndex).toBe(2);
    expect(run(stateOf(list, { activeIndex: 2 }), { type: "next_turn" }).state).toMatchObject({ activeIndex: 0, round: 2 });
  });

  it("does nothing when nobody is alive", () => {
    const list = [combatant("a", { hp: 0 })];
    const { state, events } = run(stateOf(list), { type: "next_turn" });
    expect(state.activeIndex).toBe(0);
    expect(events).toEqual([]);
  });

  it("prev_turn steps back, wraps and only lowers the round above 1", () => {
    expect(run(stateOf(trio(), { activeIndex: 1 }), { type: "prev_turn" }).state.activeIndex).toBe(0);
    expect(run(stateOf(trio(), { round: 3 }), { type: "prev_turn" }).state).toMatchObject({ activeIndex: 2, round: 2 });
    expect(run(stateOf(trio(), { round: 1 }), { type: "prev_turn" }).state).toMatchObject({ activeIndex: 2, round: 1 });
  });

  it("clears surprise at the END of the surprised combatant's turn", () => {
    const list = [combatant("a", { initiative: 20, surprised: true }), combatant("b", { initiative: 5 })];
    const { state, events } = run(stateOf(list), { type: "next_turn" });
    expect(find(state, "a").surprised).toBe(false);
    expect(types(events)).toEqual(["turn_ended", "surprise_cleared", "turn_started", "check_events"]);
  });

  it("refreshes reaction and legendary pool at the START of the next combatant's turn", () => {
    const list = [
      combatant("a", { initiative: 20, reactionUsed: true }),
      combatant("b", { initiative: 5, reactionUsed: true, legendary_action_cap: 3, legendary_actions_remaining: 0 }),
    ];
    const { state } = run(stateOf(list), { type: "next_turn" });
    expect(find(state, "a").reactionUsed).toBe(true);
    expect(find(state, "b")).toMatchObject({ reactionUsed: false, legendary_actions_remaining: 3 });
  });

  it("reshuffles initiative on a new round with the injected roller", () => {
    const list = [combatant("a", { initiative: 20 }), combatant("b", { initiative: 5, dex_mod: 2, reactionUsed: true })];
    const rolls = [3, 18];
    const { state, events } = run(
      stateOf(list, { activeIndex: 1, randomizeInitiativeEachRound: true }),
      { type: "next_turn" },
      { rollD20: () => rolls.shift() ?? 1 },
    );
    expect(find(state, "a").initiative).toBe(3);
    expect(find(state, "b").initiative).toBe(20);
    expect(state).toMatchObject({ round: 2, activeIndex: 0 });
    expect(find(state, "b").reactionUsed).toBe(false);
    expect(events).toEqual([
      { type: "turn_ended", instanceId: "b" },
      { type: "round_started", round: 2 },
      { type: "turn_started", instanceId: "b" },
      { type: "check_events", reason: "turn" },
    ]);
  });

  it("does not reshuffle mid-round", () => {
    const { state } = run(stateOf(trio(), { randomizeInitiativeEachRound: true }), { type: "next_turn" }, { rollD20: () => 1 });
    expect(find(state, "a").initiative).toBe(20);
  });

  it("start_combat begins round 1 at the top", () => {
    const { state, events } = run(stateOf(trio(), { started: false, round: 0, activeIndex: 2 }), { type: "start_combat" });
    expect(state).toMatchObject({ started: true, round: 1, activeIndex: 0 });
    expect(events).toEqual([
      { type: "round_started", round: 1 },
      { type: "turn_started", instanceId: "a" },
    ]);
  });
});

describe("hit points and dying", () => {
  it("instant death writes three failures", () => {
    const { state, events } = run(stateOf([pc("p-1", { hp: 10 })]), { type: "adjust_hp", instanceId: "p-1", delta: -25 });
    expect(find(state, "p-1").death_saves.failures).toBe(3);
    expect(events).toContainEqual({ type: "dying_outcome", instanceId: "p-1", outcome: "died" });
    expect(events.at(-1)).toEqual({ type: "check_events", reason: "hp" });
    const persisted = events.find((e) => e.type === "player_persist");
    expect(persisted).toMatchObject({ partyMemberId: "pm-p-1", patch: { current_hp: 0, death_save_failures: 3 } });
  });

  it("an ordinary hit on a conscious PC does not touch saves or conditions", () => {
    const { events } = run(stateOf([pc("p-1", { hp: 10 })]), { type: "adjust_hp", instanceId: "p-1", delta: -3 });
    const patch = events.flatMap((e) => (e.type === "player_persist" ? [e.patch] : []))[0];
    expect(patch).toEqual({ current_hp: 7, temp_hp: 0, wildshape_state: null });
    expect(types(events)).not.toContain("dying_outcome");
  });

  it("a critical hit on a downed PC is two failures", () => {
    const { state } = run(stateOf([pc("p-1", { hp: 0 })]), { type: "adjust_hp", instanceId: "p-1", delta: -1, critical: true });
    expect(find(state, "p-1").death_saves.failures).toBe(2);
  });

  it("healing a dead PC is refused and reports it", () => {
    const dead = pc("p-1", { hp: 0, death_saves: { successes: 0, failures: 3 } });
    const { state, events } = run(stateOf([dead]), { type: "adjust_hp", instanceId: "p-1", delta: 5 });
    expect(find(state, "p-1").hp).toBe(0);
    expect(events).toContainEqual({ type: "dying_outcome", instanceId: "p-1", outcome: "healing-refused-dead" });
  });

  it("monsters lose HP, absorb into temp HP first, and never persist", () => {
    const { state, events } = run(stateOf([combatant("m", { hp: 10, temp_hp: 4 })]), { type: "adjust_hp", instanceId: "m", delta: -6 });
    expect(find(state, "m")).toMatchObject({ hp: 8 });
    expect(find(state, "m").temp_hp).toBeUndefined();
    expect(events).toEqual([{ type: "check_events", reason: "hp" }]);
  });

  it("unknown ids change nothing and raise nothing", () => {
    const start = stateOf([combatant("m")]);
    const { state, events } = run(start, { type: "adjust_hp", instanceId: "nope", delta: -1 });
    expect(state).toEqual(start);
    expect(events).toEqual([]);
  });

  it("set_hp clamps, puts a PC down at 0 and stands them up above 0", () => {
    const down = run(stateOf([pc("p-1", { hp: 5 })]), { type: "set_hp", instanceId: "p-1", value: -3 });
    expect(find(down.state, "p-1")).toMatchObject({ hp: 0, conditions: [{ name: "Unconscious" }] });
    const up = run(down.state, { type: "set_hp", instanceId: "p-1", value: 4 });
    expect(find(up.state, "p-1")).toMatchObject({ hp: 4, conditions: [] });
    expect(up.events.at(-1)).toEqual({ type: "check_events", reason: "hp" });
  });

  it("set_max_hp keeps a full combatant full, and clamps otherwise", () => {
    expect(find(run(stateOf([combatant("m", { hp: 2, max_hp: 2 })]), { type: "set_max_hp", instanceId: "m", value: 11 }).state, "m")).toMatchObject({ hp: 11, max_hp: 11 });
    expect(find(run(stateOf([combatant("m", { hp: 8, max_hp: 10 })]), { type: "set_max_hp", instanceId: "m", value: 5 }).state, "m")).toMatchObject({ hp: 5, max_hp: 5 });
  });

  it("temp HP never stacks", () => {
    const { state, events } = run(stateOf([pc("p-1", { temp_hp: 8 })]), { type: "set_temp_hp", instanceId: "p-1", value: 5 });
    expect(find(state, "p-1").temp_hp).toBe(8);
    expect(events[0]).toMatchObject({ type: "player_persist", patch: { temp_hp: 8 } });
  });
});

describe("wild shape", () => {
  const form: WildshapeState = { monster_id: "bear", beast_name: "Bear", beast_image_url: null, beast_hp: 20, beast_max_hp: 20, beast_ac: "11" };

  it("enters with temp HP and persists, then reverts", () => {
    const entered = run(stateOf([pc("p-1")]), { type: "enter_wildshape", instanceId: "p-1", form, wildshapesUsed: 1, tempHp: 6 });
    expect(find(entered.state, "p-1")).toMatchObject({ wildshape: form, temp_hp: 6, hp: 10 });
    expect(entered.events[0]).toMatchObject({ patch: { wildshapes_used: 1, temp_hp: 6, wildshape_state: form } });
    const reverted = run(entered.state, { type: "revert_wildshape", instanceId: "p-1" });
    expect(find(reverted.state, "p-1").wildshape).toBeUndefined();
    expect(reverted.events).toEqual([{ type: "player_persist", partyMemberId: "pm-p-1", patch: { wildshape_state: null } }]);
  });

  it("reverting with no form is a no-op", () => {
    const { events } = run(stateOf([pc("p-1")]), { type: "revert_wildshape", instanceId: "p-1" });
    expect(events).toEqual([]);
  });

  it("dropping the beast to 0 ends the form before the final persist", () => {
    const start = stateOf([pc("p-1", { wildshape: form })]);
    const { state, events } = run(start, { type: "adjust_hp", instanceId: "p-1", delta: -25 });
    expect(find(state, "p-1").wildshape).toBeUndefined();
    const persists = events.filter((e) => e.type === "player_persist");
    expect(persists[0]).toMatchObject({ patch: { wildshape_state: null } });
    expect(persists).toHaveLength(2);
  });
});

describe("conditions, flags and pools", () => {
  it("applies, removes and replaces conditions, persisting players", () => {
    const on = run(stateOf([pc("p-1")]), { type: "apply_condition", instanceId: "p-1", condition: { name: "Prone" } });
    expect(find(on.state, "p-1").conditions).toEqual([{ name: "Prone" }]);
    expect(on.events[0]).toMatchObject({ type: "player_persist", patch: { conditions: [{ name: "Prone" }] } });
    const off = run(on.state, { type: "remove_condition", instanceId: "p-1", name: "Prone" });
    expect(find(off.state, "p-1").conditions).toEqual([]);
    const set = run(off.state, {
      type: "set_conditions",
      instanceId: "p-1",
      conditions: [{ name: "Exhaustion", level: 2 }],
    });
    expect(set.events[0]).toMatchObject({ patch: { conditions: [{ name: "Exhaustion", level: 2 }] } });
  });

  it("a freshly applied condition owes nothing and is not armed", () => {
    const { state } = run(stateOf([combatant("m")]), {
      type: "apply_condition",
      instanceId: "m",
      condition: { name: "Dazed", ends: { kind: "turn", at: "end", of: "self", armed: true }, due: { save: true } },
    });
    expect(find(state, "m").conditions).toEqual([{ name: "Dazed", ends: { kind: "turn", at: "end", of: "self", armed: false } }]);
  });

  it("toggles surprise and reaction", () => {
    const s = stateOf([combatant("m")]);
    expect(find(run(s, { type: "toggle_surprised", instanceId: "m" }).state, "m").surprised).toBe(true);
    expect(find(run(s, { type: "toggle_reaction", instanceId: "m" }).state, "m").reactionUsed).toBe(true);
  });

  it("primes pools only for listed ids and clamps spending at zero", () => {
    const primed = run(stateOf([combatant("a"), combatant("b")]), { type: "prime_legendary_actions", caps: { a: 3, b: 0 } }).state;
    expect(find(primed, "a")).toMatchObject({ legendary_action_cap: 3, legendary_actions_remaining: 3 });
    expect(find(primed, "b").legendary_action_cap).toBeUndefined();
    const first = run(primed, { type: "spend_legendary_actions", instanceId: "a", cost: 2 });
    expect(first.events).toEqual([{ type: "legendary_spent", instanceId: "a", spent: 2 }]);
    const second = run(first.state, { type: "spend_legendary_actions", instanceId: "a", cost: 2 });
    expect(second.events).toEqual([{ type: "legendary_spent", instanceId: "a", spent: 1 }]);
    expect(find(second.state, "a").legendary_actions_remaining).toBe(0);
    expect(run(primed, { type: "spend_legendary_actions", instanceId: "b", cost: 1 }).events).toEqual([]);
  });

  it("records a lair action once per round", () => {
    const a = run(stateOf([combatant("m")], { round: 2 }), { type: "mark_lair_fired" }).state;
    const b = run({ ...a, round: 3 }, { type: "mark_lair_fired" }).state;
    expect(b.lairFiredRounds).toEqual([2, 3]);
    expect(run(b, { type: "mark_lair_fired" }).state.lairFiredRounds).toEqual([2, 3]);
  });

  it("sets boss mechanics", () => {
    const { state } = run(stateOf([]), { type: "set_boss_mechanics", lairEnabled: true, lairOwnerInstanceId: "m" });
    expect(state).toMatchObject({ lairEnabled: true, lairOwnerInstanceId: "m" });
  });
});

describe("remove_combatant", () => {
  const list = () => [combatant("a", { initiative: 20 }), combatant("b", { initiative: 10 }), combatant("c", { initiative: 5 })];

  it("shifts the cursor when someone before it leaves", () => {
    const { state } = run(stateOf(list(), { activeIndex: 2 }), { type: "remove_combatant", instanceId: "a" });
    expect(state.activeIndex).toBe(1);
    expect(state.combatants.map((c) => c.instance_id)).toEqual(["b", "c"]);
  });

  it("clamps when the last entry leaves", () => {
    expect(run(stateOf(list(), { activeIndex: 2 }), { type: "remove_combatant", instanceId: "c" }).state.activeIndex).toBe(1);
  });

  it("ignores unknown ids", () => {
    const start = stateOf(list());
    expect(run(start, { type: "remove_combatant", instanceId: "zz" }).state).toEqual(start);
  });
});

describe("purity", () => {
  it("never mutates the input (deep-frozen) for any HP, turn or condition command", () => {
    const start = deepFreeze(
      stateOf([
        pc("p-1", { initiative: 20, surprised: true, hp: 6 }),
        combatant("m", { initiative: 5, legendary_action_cap: 3, legendary_actions_remaining: 1, wildshape: undefined }),
      ]),
    );
    const commands: EncounterTurnCommand[] = [
      { type: "next_turn" },
      { type: "prev_turn" },
      { type: "adjust_hp", instanceId: "p-1", delta: -9 },
      { type: "set_hp", instanceId: "p-1", value: 0 },
      { type: "set_max_hp", instanceId: "m", value: 3 },
      { type: "apply_condition", instanceId: "p-1", condition: { name: "Prone" } },
      { type: "spend_legendary_actions", instanceId: "m", cost: 1 },
      { type: "mark_lair_fired" },
      { type: "reshuffle_initiative" },
    ];
    for (const command of commands) expect(() => reduceEncounterTurn(start, command)).not.toThrow();
  });

  it("returns the same state object when nothing happens", () => {
    const start = stateOf([combatant("m")]);
    expect(reduceEncounterTurn(start, { type: "set_hp", instanceId: "zz", value: 1 }).state).toBe(start);
  });

  it("produces JSON-serialisable state", () => {
    const { state } = run(stateOf([pc("p-1")]), { type: "mark_lair_fired" });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("limited abilities", () => {
  const breath = { recharge: { min: 5, max: 6 } };
  const entry = (name: string, structured: Record<string, unknown>): StatBlockEntry => ({
    name,
    description: "",
    structured: { kind: "other", source: "manual", ...structured },
  });

  it("use_action counts uses and keeps the limit on the combatant", () => {
    const s = stateOf([combatant("a")]);
    const first = run(s, { type: "use_action", instanceId: "a", action: "Fire Breath", limit: breath });
    expect(find(first.state, "a").action_uses).toEqual({ "Fire Breath": { used: 1, recharge: { min: 5, max: 6 } } });
    const second = run(first.state, { type: "use_action", instanceId: "a", action: "Fire Breath", limit: breath });
    expect(find(second.state, "a").action_uses?.["Fire Breath"].used).toBe(2);
  });

  it("restore_action clears the count and ignores unknown abilities", () => {
    const used = run(stateOf([combatant("a")]), { type: "use_action", instanceId: "a", action: "Bolt", limit: { per_day: 3 } });
    const restored = run(used.state, { type: "restore_action", instanceId: "a", action: "Bolt" });
    expect(find(restored.state, "a").action_uses?.Bolt).toEqual({ used: 0, per_day: 3 });
    const nothing = run(used.state, { type: "restore_action", instanceId: "a", action: "Nope" });
    expect(nothing.events).toEqual([]);
  });

  it("rolls a d6 for a spent recharge at the start of its owner's turn, after turn_started", () => {
    const spent = combatant("b", { initiative: 5, action_uses: { "Fire Breath": { used: 1, ...breath } } });
    const s = stateOf([combatant("a", { initiative: 20 }), spent], { activeIndex: 0 });
    const hit = run(s, { type: "next_turn" }, { rollD6: () => 5 });
    expect(hit.events).toEqual([
      { type: "turn_ended", instanceId: "a" },
      { type: "turn_started", instanceId: "b" },
      { type: "action_recharged", instanceId: "b", action: "Fire Breath", roll: 5 },
      { type: "check_events", reason: "turn" },
    ]);
    expect(find(hit.state, "b").action_uses?.["Fire Breath"].used).toBe(0);

    const miss = run(s, { type: "next_turn" }, { rollD6: () => 4 });
    expect(types(miss.events)).toContain("recharge_failed");
    expect(find(miss.state, "b").action_uses?.["Fire Breath"].used).toBe(1);
  });

  it("does not roll for abilities that are not spent, per-day abilities, or on start_combat", () => {
    const rolls: number[] = [];
    const rollD6 = () => (rolls.push(1), 1);
    const ready = combatant("b", { initiative: 5, action_uses: { "Fire Breath": { used: 0, ...breath }, Bolt: { used: 3, per_day: 3 } } });
    const s = stateOf([combatant("a", { initiative: 20 }), ready]);
    run(s, { type: "next_turn" }, { rollD6 });
    const top = combatant("c", { initiative: 30, action_uses: { X: { used: 1, ...breath } } });
    run(stateOf([top], { started: false }), { type: "start_combat" }, { rollD6 });
    expect(rolls).toEqual([]);
  });

  it("recharges on the reshuffle branch too", () => {
    const spent = combatant("a", { initiative: 20, action_uses: { X: { used: 1, ...breath } } });
    const { events } = run(
      stateOf([spent], { randomizeInitiativeEachRound: true }),
      { type: "next_turn" },
      { rollD20: () => 10, rollD6: () => 6 },
    );
    expect(types(events)).toEqual(["turn_ended", "round_started", "turn_started", "action_recharged", "check_events"]);
  });

  it("actionAvailability reads recharge and per-day state", () => {
    const fire = entry("Fire Breath", breath.recharge ? { recharge: breath.recharge } : {});
    const bolt = entry("Bolt", { uses: { count: 3, per: "day" } });
    const plain = entry("Bite", {});
    const c = combatant("a", {
      action_uses: { "actions/Fire Breath": { used: 1, ...breath }, "actions/Bolt": { used: 2, per_day: 3 } },
    });
    expect(actionAvailability(c, fire, "actions")).toEqual({ available: false, label: "Recharge 5–6 · spent" });
    expect(actionAvailability(combatant("z"), fire, "actions")).toEqual({ available: true, label: "Recharge 5–6" });
    expect(actionAvailability(c, bolt, "actions")).toEqual({ available: true, label: "1/3 left" });
    expect(
      actionAvailability(combatant("z", { action_uses: { "actions/Bolt": { used: 3, per_day: 3 } } }), bolt, "actions"),
    ).toEqual({ available: false, label: "0/3 left" });
    expect(actionAvailability(c, plain, "actions")).toEqual({ available: true, label: null });
    expect(actionLimit(bolt)).toEqual({ per_day: 3 });
    expect(actionLimit(fire)).toEqual({ recharge: { min: 5, max: 6 } });
  });

  it("keeps one tally per list, so a Tail Attack in Actions and in Legendary Actions do not collide", () => {
    const tail = entry("Tail Attack", { recharge: breath.recharge });
    expect(actionUseKey("actions", tail)).toBe("actions/Tail Attack");
    expect(actionUseKey("legendary_actions", tail)).toBe("legendary_actions/Tail Attack");
    const c = combatant("a", { action_uses: { [actionUseKey("actions", tail)]: { used: 1, ...breath } } });
    expect(actionAvailability(c, tail, "actions").available).toBe(false);
    expect(actionAvailability(c, tail, "legendary_actions").available).toBe(true);
  });
});

describe("condition durations in the turn flow", () => {
  const holdPerson: AppliedCondition = {
    name: "Paralyzed",
    source: { id: "caster", spell: "Hold Person", concentration: true },
    ends: { kind: "save", ability: "wis", dc: 15, at: "end" },
  };
  const ended = (events: EncounterTurnEvent[]) => events.filter((e) => e.type === "condition_ended");

  it("a save-ends condition falls due at the end of its bearer's turn and a successful save removes it", () => {
    const start = stateOf([combatant("m", { initiative: 20, conditions: [holdPerson] }), combatant("o", { initiative: 5 })]);
    const turn = run(start, { type: "next_turn" });
    expect(turn.events).toContainEqual({ type: "condition_save_due", instanceId: "m", name: "Paralyzed", ability: "wis", dc: 15 });
    expect(find(turn.state, "m").conditions[0]).toMatchObject({ due: { save: true } });
    const failed = run(turn.state, { type: "resolve_condition_save", instanceId: "m", name: "Paralyzed", success: false });
    expect(find(failed.state, "m").conditions).toEqual([holdPerson]);
    const saved = run(turn.state, { type: "resolve_condition_save", instanceId: "m", name: "Paralyzed", success: true });
    expect(find(saved.state, "m").conditions).toEqual([]);
    expect(saved.events).toContainEqual({ type: "condition_ended", instanceId: "m", name: "Paralyzed", reason: "saved" });
  });

  it("until the end of the source's next turn: survives the turn it was applied in, expires at the end of the next", () => {
    const start = stateOf([combatant("s", { initiative: 20 }), combatant("t", { initiative: 10 })]);
    const applied = run(start, {
      type: "apply_condition",
      instanceId: "t",
      condition: { name: "Marked", source: { id: "s" }, ends: { kind: "turn", at: "end", of: "source" } },
    });
    const first = run(applied.state, { type: "next_turn" }); // s's turn ends
    expect(find(first.state, "t").conditions).toHaveLength(1);
    const second = run(first.state, { type: "next_turn" }); // t's turn ends, round 2: s's turn starts and arms it
    expect(find(second.state, "t").conditions[0]).toMatchObject({ ends: { armed: true } });
    const third = run(second.state, { type: "next_turn" }); // s's turn ends
    expect(find(third.state, "t").conditions).toEqual([]);
    expect(ended(third.events)).toEqual([{ type: "condition_ended", instanceId: "t", name: "Marked", reason: "expired" }]);
  });

  it("rounds count down on the source's turns", () => {
    const start = stateOf([
      combatant("s", { initiative: 20 }),
      combatant("t", { initiative: 10, conditions: [{ name: "Blessed", source: { id: "s" }, ends: { kind: "rounds", remaining: 2 } }] }),
    ]);
    const r2 = run(run(run(start, { type: "next_turn" }).state, { type: "next_turn" }).state, { type: "next_turn" });
    expect(find(r2.state, "t").conditions[0]).toMatchObject({ ends: { remaining: 1 } });
    const r3a = run(r2.state, { type: "next_turn" });
    const r3 = run(r3a.state, { type: "next_turn" });
    expect(find(r3.state, "t").conditions).toEqual([]);
    expect(ended([...r3a.events, ...r3.events])).toHaveLength(1);
  });

  it("ongoing damage falls due at the start of the bearer's turn", () => {
    const burning: AppliedCondition = { name: "Burning", ongoing: { dice: "1d6", type: "fire", at: "start" } };
    const start = stateOf([combatant("a", { initiative: 20 }), combatant("b", { initiative: 10, conditions: [burning] })]);
    const { state, events } = run(start, { type: "next_turn" });
    expect(events).toContainEqual({ type: "ongoing_damage_due", instanceId: "b", name: "Burning", dice: "1d6", damageType: "fire" });
    expect(find(state, "b").conditions[0]).toMatchObject({ due: { damage: true } });
    const settled = run(state, { type: "settle_ongoing_damage", instanceId: "b", name: "Burning" });
    expect(find(settled.state, "b").conditions).toEqual([burning]);
  });

  it("start_combat runs the first combatant's start hooks", () => {
    const burning: AppliedCondition = { name: "Burning", ongoing: { dice: "1d6", type: "fire", at: "start" } };
    const { events } = run(stateOf([combatant("a", { conditions: [burning] })], { started: false }), { type: "start_combat" });
    expect(types(events)).toContain("ongoing_damage_due");
  });

  it("a PC's condition change from a turn edge is persisted as records", () => {
    const stun: AppliedCondition = { name: "Stunned", ends: { kind: "turn", at: "start", of: "self" } };
    const start = stateOf([combatant("m", { initiative: 20 }), pc("p-1", { initiative: 10, conditions: [stun] })]);
    const { events } = run(start, { type: "next_turn" });
    expect(events).toContainEqual({ type: "player_persist", partyMemberId: "pm-p-1", patch: { conditions: [] } });
  });

  it("a concentrating source dropping to 0 HP ends the conditions it holds on others", () => {
    const start = stateOf([
      combatant("caster", { hp: 5, concentration: null }),
      combatant("t", { conditions: [holdPerson, { name: "Poisoned" }] }),
    ]);
    const { state, events } = run(start, { type: "adjust_hp", instanceId: "caster", delta: -9 });
    expect(find(state, "t").conditions).toEqual([{ name: "Poisoned" }]);
    expect(ended(events)).toEqual([{ type: "condition_ended", instanceId: "t", name: "Paralyzed", reason: "source_down" }]);
    const still = run(start, { type: "adjust_hp", instanceId: "caster", delta: -2 });
    expect(find(still.state, "t").conditions).toHaveLength(2);
  });

  it("end_concentration with a spell ends only that spell's conditions", () => {
    const other: AppliedCondition = { name: "Slowed", source: { id: "caster", spell: "Slow", concentration: true } };
    const start = stateOf([
      combatant("caster", { concentration: { spellId: null, spellName: "Hold Person", castAtLevel: 2, startedRound: 1, appliedEffectIds: [] } }),
      combatant("t", { conditions: [holdPerson, other] }),
    ]);
    const one = run(start, { type: "end_concentration", instanceId: "caster", spell: "Hold Person" });
    expect(find(one.state, "t").conditions).toEqual([other]);
    expect(find(one.state, "caster").concentration).toBeNull();
    const all = run(start, { type: "end_concentration", instanceId: "caster" });
    expect(find(all.state, "t").conditions).toEqual([]);
    expect(ended(all.events)).toHaveLength(2);
  });

  it("removing a source ends what rode on it, and persists players", () => {
    const anchored: AppliedCondition = { name: "Marked", source: { id: "caster" }, ends: { kind: "turn", at: "end", of: "source" } };
    const plain: AppliedCondition = { name: "Cursed", source: { id: "caster" } };
    const start = stateOf([combatant("caster", { initiative: 20 }), pc("p-1", { initiative: 5, conditions: [holdPerson, anchored, plain] })]);
    const { state, events } = run(start, { type: "remove_combatant", instanceId: "caster" });
    expect(find(state, "p-1").conditions).toEqual([plain]);
    expect(ended(events).map((e) => e.reason)).toEqual(["source_removed", "source_removed"]);
    expect(events).toContainEqual({ type: "player_persist", partyMemberId: "pm-p-1", patch: { conditions: [plain] } });
  });

  it("stepping back runs no hooks", () => {
    const stun: AppliedCondition = { name: "Stunned", ends: { kind: "turn", at: "start", of: "self" } };
    const start = stateOf([combatant("a", { initiative: 20 }), combatant("b", { initiative: 10, conditions: [stun] })], { activeIndex: 1 });
    const { state, events } = run(start, { type: "prev_turn" });
    expect(events).toEqual([]);
    expect(find(state, "b").conditions).toEqual([stun]);
  });
});

describe("concentration_check_due", () => {
  const held: AppliedCondition = { name: "Paralyzed", source: { id: "mage", spell: "Hold Person", concentration: true } };
  const due = (events: EncounterTurnEvent[]) => events.filter((e) => e.type === "concentration_check_due");
  const roster = (mage: Partial<RunCombatant> = {}) => [combatant("mage", mage), combatant("t", { conditions: [held] })];

  it("is raised for a holder that takes damage and stays up", () => {
    const { events } = reduceEncounterTurn(stateOf(roster()), { type: "adjust_hp", instanceId: "mage", delta: -4 });
    expect(due(events)).toEqual([{ type: "concentration_check_due", instanceId: "mage", damage: 4 }]);
  });

  it("is not raised for healing, a non-holder, or a party member", () => {
    expect(due(reduceEncounterTurn(stateOf(roster({ hp: 5 })), { type: "adjust_hp", instanceId: "mage", delta: 3 }).events)).toEqual([]);
    expect(due(reduceEncounterTurn(stateOf(roster()), { type: "adjust_hp", instanceId: "t", delta: -3 }).events)).toEqual([]);
    const heroRoster = [pc("mage"), combatant("t", { conditions: [held] })];
    expect(due(reduceEncounterTurn(stateOf(heroRoster), { type: "adjust_hp", instanceId: "mage", delta: -3 }).events)).toEqual([]);
  });

  it("is not raised when the hit drops the holder to 0, which ends what it holds instead", () => {
    const { events } = reduceEncounterTurn(stateOf(roster()), { type: "adjust_hp", instanceId: "mage", delta: -10 });
    expect(due(events)).toEqual([]);
    expect(events).toContainEqual({ type: "condition_ended", instanceId: "t", name: "Paralyzed", reason: "source_down" });
  });
});
