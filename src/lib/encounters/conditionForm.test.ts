import { describe, it, expect } from "vitest";
import { buildCondition, conditionToForm } from "./conditionForm";
import type { AppliedCondition } from "@/types/condition.types";

describe("conditionForm", () => {
  it("builds a bare record for an empty form with a name", () => {
    expect(buildCondition({ ...conditionToForm(null), name: " Cursed " })).toEqual({ name: "Cursed" });
  });

  it("spells a typed game condition the canonical way, and gives a typed Exhaustion a level", () => {
    expect(buildCondition({ ...conditionToForm(null), name: "prone" })).toEqual({ name: "Prone" });
    expect(buildCondition({ ...conditionToForm(null), name: "exhaustion" })).toEqual({ name: "Exhaustion", level: 1 });
  });

  it("round-trips a full record", () => {
    const full: AppliedCondition = {
      name: "Paralyzed",
      source: { id: "mage", spell: "Hold Person", concentration: true },
      ends: { kind: "save", ability: "wis", dc: 14, at: "end" },
      ongoing: { dice: "2d6", type: "fire", at: "start" },
    };
    expect(buildCondition(conditionToForm(full))).toEqual(full);
  });

  it("round-trips a save end's round cap, and omits it when the form has none (#1055)", () => {
    const capped: AppliedCondition = { name: "Restrained", ends: { kind: "save", ability: "str", dc: 12, at: "end", remaining: 10 } };
    const form = conditionToForm(capped);
    expect(form.saveCap).toBe(10);
    expect(buildCondition(form)).toEqual(capped);
    expect(buildCondition({ ...form, saveCap: null }).ends).toEqual({ kind: "save", ability: "str", dc: 12, at: "end" });
    expect(buildCondition({ ...form, saveCap: 2.7 }).ends).toMatchObject({ remaining: 2 });
    expect(buildCondition({ ...form, saveCap: 0 }).ends).toMatchObject({ remaining: 1 });
    expect(conditionToForm(null).saveCap).toBeNull();
  });

  it("keeps an exhaustion level and drops a source-turn end when the source is cleared", () => {
    const c: AppliedCondition = { name: "Exhaustion", level: 3, source: { id: "x" }, ends: { kind: "turn", at: "end", of: "source" } };
    const form = { ...conditionToForm(c), sourceId: "" };
    expect(buildCondition(form)).toEqual({ name: "Exhaustion", level: 3, ends: { kind: "turn", at: "end", of: "self" } });
  });

  it("leaves out an untyped ongoing type as null and blank dice as no ongoing damage", () => {
    const form = { ...conditionToForm(null), name: "Burning", ongoingDice: "1d4", ongoingType: "" };
    expect(buildCondition(form).ongoing).toEqual({ dice: "1d4", type: null, at: "start" });
    expect(buildCondition({ ...form, ongoingDice: "  " }).ongoing).toBeUndefined();
  });
});
