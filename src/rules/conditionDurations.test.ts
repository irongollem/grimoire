import { describe, expect, it } from "vitest";
import { conditionsAtTurnEdge, endSourcedConditions, holdsConcentration } from "@/rules/conditionDurations";
import type { AppliedCondition } from "@/types/condition.types";
import type { RunCombatant } from "@/types/encounter.types";

function who(id: string, conditions: AppliedCondition[] = []): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: "f",
    initiative: 10,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions,
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
  };
}

const conds = (r: { combatants: RunCombatant[] }, id: string) => r.combatants.find((c) => c.instance_id === id)!.conditions;

describe("conditionsAtTurnEdge: turn ends", () => {
  const startOfSelf: AppliedCondition = { name: "A", ends: { kind: "turn", at: "start", of: "self" } };
  const endOfSelf: AppliedCondition = { name: "B", ends: { kind: "turn", at: "end", of: "self" } };

  it("expires a start-of-turn condition when its anchor's turn starts", () => {
    const r = conditionsAtTurnEdge([who("x", [startOfSelf])], "start", "x");
    expect(conds(r, "x")).toEqual([]);
    expect(r.events).toEqual([{ type: "condition_ended", instanceId: "x", name: "A", reason: "expired" }]);
    expect(r.changed).toEqual(["x"]);
  });

  it("ignores another combatant's start edge", () => {
    const list = [who("x", [startOfSelf]), who("y")];
    expect(conditionsAtTurnEdge(list, "start", "y").combatants).toBe(list);
  });

  it("arms an end-of-turn condition at the anchor's start and expires it at that turn's end", () => {
    const armed = conditionsAtTurnEdge([who("x", [endOfSelf])], "start", "x");
    expect(conds(armed, "x")).toEqual([{ name: "B", ends: { kind: "turn", at: "end", of: "self", armed: true } }]);
    const gone = conditionsAtTurnEdge(armed.combatants, "end", "x");
    expect(conds(gone, "x")).toEqual([]);
    expect(gone.events[0]).toMatchObject({ type: "condition_ended", reason: "expired" });
  });

  it("a condition applied during the anchor's own turn survives that turn's end", () => {
    const list = [who("x", [endOfSelf])];
    const r = conditionsAtTurnEdge(list, "end", "x");
    expect(r.combatants).toBe(list);
    expect(r.events).toEqual([]);
  });

  it("of: source anchors on the source's turns, and on the bearer when the source is gone", () => {
    const marked: AppliedCondition = { name: "M", source: { id: "s" }, ends: { kind: "turn", at: "start", of: "source" } };
    const withSource = [who("s"), who("t", [marked])];
    expect(conds(conditionsAtTurnEdge(withSource, "start", "t"), "t")).toEqual([marked]);
    expect(conds(conditionsAtTurnEdge(withSource, "start", "s"), "t")).toEqual([]);
    const orphan = [who("t", [marked])];
    expect(conds(conditionsAtTurnEdge(orphan, "start", "t"), "t")).toEqual([]);
    const downed = [{ ...who("s"), hp: 0 }, who("t", [marked])];
    expect(conds(conditionsAtTurnEdge(downed, "start", "t"), "t")).toEqual([]);
  });
});

describe("conditionsAtTurnEdge: rounds", () => {
  const rounds = (remaining: number): AppliedCondition => ({ name: "R", source: { id: "s" }, ends: { kind: "rounds", remaining } });

  it("counts down on the source's start edges only", () => {
    const list = [who("s"), who("t", [rounds(2)])];
    expect(conditionsAtTurnEdge(list, "start", "t").combatants).toBe(list);
    expect(conditionsAtTurnEdge(list, "end", "s").combatants).toBe(list);
    const r = conditionsAtTurnEdge(list, "start", "s");
    expect(conds(r, "t")).toEqual([rounds(1)]);
  });

  it("ends at 0", () => {
    const r = conditionsAtTurnEdge([who("s"), who("t", [rounds(1)])], "start", "s");
    expect(conds(r, "t")).toEqual([]);
    expect(r.events).toEqual([{ type: "condition_ended", instanceId: "t", name: "R", reason: "expired" }]);
  });

  it("falls back to the bearer's turns without the source", () => {
    const r = conditionsAtTurnEdge([who("t", [rounds(2)])], "start", "t");
    expect(conds(r, "t")).toEqual([rounds(1)]);
  });

  it("falls back to the bearer's turns when the source is a downed monster, whose turns are skipped", () => {
    const r = conditionsAtTurnEdge([{ ...who("s"), hp: 0 }, who("t", [rounds(2)])], "start", "t");
    expect(conds(r, "t")).toEqual([rounds(1)]);
  });
});

describe("conditionsAtTurnEdge: saves and ongoing damage", () => {
  const save: AppliedCondition = { name: "Held", ends: { kind: "save", ability: "wis", dc: 14, at: "end" } };
  const burn: AppliedCondition = { name: "Burning", ongoing: { dice: "1d6", type: "fire", at: "start" } };

  it("save due only at the bearer's own matching edge", () => {
    const list = [who("x", [save]), who("y")];
    expect(conditionsAtTurnEdge(list, "end", "y").combatants).toBe(list);
    expect(conditionsAtTurnEdge(list, "start", "x").combatants).toBe(list);
    const r = conditionsAtTurnEdge(list, "end", "x");
    expect(conds(r, "x")).toEqual([{ ...save, due: { save: true } }]);
    expect(r.events).toEqual([{ type: "condition_save_due", instanceId: "x", name: "Held", ability: "wis", dc: 14 }]);
  });

  it("ongoing damage due only at the bearer's own matching edge", () => {
    const list = [who("x", [burn]), who("y")];
    expect(conditionsAtTurnEdge(list, "start", "y").combatants).toBe(list);
    const r = conditionsAtTurnEdge(list, "start", "x");
    expect(conds(r, "x")).toEqual([{ ...burn, due: { damage: true } }]);
    expect(r.events).toEqual([{ type: "ongoing_damage_due", instanceId: "x", name: "Burning", dice: "1d6", damageType: "fire" }]);
  });

  it("a condition that just expired owes nothing, and an existing debt keeps identity", () => {
    const both: AppliedCondition = { name: "Z", ends: { kind: "turn", at: "start", of: "self" }, ongoing: { dice: "1d4", type: null, at: "start" } };
    expect(conditionsAtTurnEdge([who("x", [both])], "start", "x").events.map((e) => e.type)).toEqual(["condition_ended"]);
    const owing = { ...burn, due: { damage: true } };
    const list = [who("x", [owing])];
    expect(conditionsAtTurnEdge(list, "start", "x").combatants).toBe(list);
  });

  it("keeps identity of untouched combatants and orders events by combatant then condition", () => {
    const a = who("a", [{ name: "S1", ends: { kind: "save", ability: "con", dc: 10, at: "start" } }]);
    const b = who("b", [{ name: "Gone", source: { id: "a" }, ends: { kind: "rounds", remaining: 1 } }]);
    const c = who("c");
    const r = conditionsAtTurnEdge([a, b, c], "start", "a");
    expect(r.combatants[2]).toBe(c);
    expect(r.events.map((e) => e.type)).toEqual(["condition_save_due", "condition_ended"]);
    expect(r.changed).toEqual(["a", "b"]);
  });

  it("never mutates its input", () => {
    const input = [who("x", [{ name: "Held", ends: { kind: "save", ability: "wis", dc: 14, at: "start" } }])];
    const snapshot = structuredClone(input);
    conditionsAtTurnEdge(input, "start", "x");
    expect(input).toEqual(snapshot);
  });
});

describe("conditionsAtTurnEdge: a save end with a round cap (#1055)", () => {
  const capped = (remaining: number, at: "start" | "end" = "end"): AppliedCondition => ({
    name: "Restrained",
    source: { id: "s" },
    ends: { kind: "save", ability: "str", dc: 12, at, remaining },
  });

  it("counts down on the source's turn, not the bearer's", () => {
    const list = [who("s"), who("t", [capped(3)])];
    expect(conds(conditionsAtTurnEdge(list, "start", "s"), "t")).toEqual([capped(2)]);
    expect(conditionsAtTurnEdge(list, "start", "t").combatants).toBe(list);
  });

  it("falls back to the bearer's turns once the source takes none", () => {
    const r = conditionsAtTurnEdge([{ ...who("s"), hp: 0 }, who("t", [capped(3)])], "start", "t");
    expect(conds(r, "t")).toEqual([capped(2)]);
  });

  it("lapses as expired at 0, without also raising a save", () => {
    const r = conditionsAtTurnEdge([who("s"), who("t", [capped(1, "start")])], "start", "s");
    expect(conds(r, "t")).toEqual([]);
    expect(r.events).toEqual([{ type: "condition_ended", instanceId: "t", name: "Restrained", reason: "expired" }]);
    const bearer = conditionsAtTurnEdge([{ ...who("s"), hp: 0 }, who("t", [capped(1, "start")])], "start", "t");
    expect(bearer.events.map((e) => e.type)).toEqual(["condition_ended"]);
  });

  it("still falls due for its repeat save at its edge, with the remaining rounds kept", () => {
    const r = conditionsAtTurnEdge([who("s"), who("t", [capped(3)])], "end", "t");
    expect(conds(r, "t")).toEqual([{ ...capped(3), due: { save: true } }]);
    expect(r.events).toEqual([{ type: "condition_save_due", instanceId: "t", name: "Restrained", ability: "str", dc: 12 }]);
  });

  it("falls due after ticking when the bearer is its own anchor", () => {
    const r = conditionsAtTurnEdge([who("t", [{ ...capped(3, "start"), source: undefined }])], "start", "t");
    expect(r.events.map((e) => e.type)).toEqual(["condition_save_due"]);
    expect(conds(r, "t")[0].ends).toMatchObject({ remaining: 2 });
  });
});

describe("endSourcedConditions", () => {
  const conc: AppliedCondition = { name: "Held", source: { id: "c", spell: "Hold Person", concentration: true } };
  const otherSpell: AppliedCondition = { name: "Slowed", source: { id: "c", spell: "Slow", concentration: true } };
  const noSpell: AppliedCondition = { name: "Blessed", source: { id: "c", concentration: true } };
  const anchored: AppliedCondition = { name: "Marked", source: { id: "c" }, ends: { kind: "turn", at: "end", of: "source" } };
  const foreign: AppliedCondition = { name: "Held", source: { id: "z", concentration: true } };

  it("ends every concentration-linked condition from the source", () => {
    const list = [who("t", [conc, otherSpell, anchored, foreign])];
    const r = endSourcedConditions(list, "c", "concentration", { concentrationOnly: true });
    expect(conds(r, "t")).toEqual([anchored, foreign]);
    expect(r.events.map((e) => (e.type === "condition_ended" ? e.reason : e.type))).toEqual(["concentration", "concentration"]);
    expect(r.changed).toEqual(["t"]);
  });

  it("with a spell, ends that spell's and the unset ones", () => {
    const r = endSourcedConditions([who("t", [conc, otherSpell, noSpell])], "c", "concentration", { spell: "Hold Person", concentrationOnly: true });
    expect(conds(r, "t")).toEqual([otherSpell]);
  });

  it("without concentrationOnly it also ends source-anchored turn ends", () => {
    const r = endSourcedConditions([who("t", [conc, anchored])], "c", "source_removed");
    expect(conds(r, "t")).toEqual([]);
  });

  it("returns the same array when nothing matches", () => {
    const list = [who("t", [foreign])];
    expect(endSourcedConditions(list, "c", "source_down", { concentrationOnly: true }).combatants).toBe(list);
  });
});

describe("holdsConcentration", () => {
  const held: AppliedCondition = { name: "Held", source: { id: "c", spell: "Hold Person", concentration: true } };
  const plain: AppliedCondition = { name: "Held", source: { id: "c" } };

  it("is true when another combatant carries a concentration condition from the source", () => {
    expect(holdsConcentration([who("c"), who("t", [held])], "c")).toBe(true);
  });

  it("is false for a non-concentration source, a different source, or no conditions", () => {
    expect(holdsConcentration([who("c"), who("t", [plain])], "c")).toBe(false);
    expect(holdsConcentration([who("c"), who("t", [held])], "z")).toBe(false);
    expect(holdsConcentration([who("c")], "c")).toBe(false);
  });
});
