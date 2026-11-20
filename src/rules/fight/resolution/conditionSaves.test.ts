/**
 * The Constitution save that keeps a spell going and the repeat save of a "save ends" condition. Every expected number
 * is worked out in the comment above it from the rule it comes from, never read off a run.
 */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { combatant } from "../fightTestKit";
import { resolveConcentrationOn, resolveConditionSaveOn } from "./conditionSaves";
import { scripted, table } from "./resolutionTestKit";

describe("concentration and repeat saves", () => {
  // PHB 2014 "Concentration": the Constitution save DC is 10 or half the damage, whichever is higher. 30 damage is DC 15.
  // d20 11 + 3 = 14 loses; 12 + 3 = 15 keeps. A lost save ends what the creature held.
  it("a Constitution save at max(10, half the damage) ends the concentration when it falls short, by one", async () => {
    const held = combatant("mage", {
      hp: 20, max_hp: 20,
      concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] },
    });
    const lost = table([held], { dice: scripted([[11]]).dice, bonus: { mage: 3 } });
    const out = await resolveConcentrationOn(lost.ctx, { target: lost.get("mage"), damage: 30 });
    expect(out.summary).toMatchObject({ dc: 15, total: 14, maintained: false });
    expect(lost.get("mage").concentration).toBeNull();

    const kept = table([held], { dice: scripted([[12]]).dice, bonus: { mage: 3 } });
    const ok = await resolveConcentrationOn(kept.ctx, { target: kept.get("mage"), damage: 30 });
    expect(ok.summary).toMatchObject({ total: 15, maintained: true });
    expect(kept.get("mage").concentration).not.toBeNull();
  });

  // A repeat save against the condition's own DC: d20 12 + 1 = 13 meets DC 13, so the condition ends; 11 + 1 = 12 keeps it.
  it("a repeat save at the condition's DC ends it on a success and leaves it on a failure", async () => {
    const stunned = (): RunCombatant =>
      combatant("g", { conditions: [{ name: "Frightened", ends: { kind: "save", ability: "wis", dc: 13, at: "end" }, due: { save: true } }] });
    const pass = table([stunned()], { dice: scripted([[12]]).dice, bonus: { g: 1 } });
    const passed = await resolveConditionSaveOn(pass.ctx, { target: pass.get("g"), condition: pass.get("g").conditions[0] });
    expect(passed.summary).toMatchObject({ total: 13, success: true });
    expect(pass.get("g").conditions).toEqual([]);

    const fail = table([stunned()], { dice: scripted([[11]]).dice, bonus: { g: 1 } });
    const failed = await resolveConditionSaveOn(fail.ctx, { target: fail.get("g"), condition: fail.get("g").conditions[0] });
    expect(failed.summary).toMatchObject({ total: 12, success: false });
    expect(fail.get("g").conditions.map((c) => c.name)).toEqual(["Frightened"]);
    // The debt is cleared, so it is not owed again until the next turn edge.
    expect(fail.get("g").conditions[0].due?.save).toBeFalsy();
  });
});
