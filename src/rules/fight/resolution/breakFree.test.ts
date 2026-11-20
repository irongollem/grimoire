/**
 * Breaking free of a condition with an ability check. Every expected number is worked out in the comment above it from
 * the rule it comes from, never read off a run.
 */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { type StatBlockEntry } from "@/types/statBlock.types";
import type { MonsterStatBlock } from "@/types/monster.types";
import { mageBlock } from "../spells/spellTestKit";
import { breakFreeModifier, strongestBreakFreeAbility, resolveBreakFreeOn } from "./breakFree";
import { ActionRefused } from "./context";
import { resolveSaveOn } from "./saves";
import { scripted, table, victim, wolf } from "./resolutionTestKit";

// SRD 5.1 Black Tentacles: "A creature restrained by the tentacles can use its action to make a Strength or Dexterity
// check (its choice) against your spell save DC. On a success, it frees itself."
describe("a condition the bearer can break free of with a check", () => {
  const tentacled = (): StatBlockEntry => ({
    name: "Black Tentacles", description: "",
    structured: { kind: "save", source: "manual", save: { ability: "dex", dc: 14, fail: [], success: "none", conditions: [{ name: "Restrained", breakFree: { abilities: ["str", "dex"] } }] } },
  });
  const held = (over: Partial<RunCombatant> = {}) =>
    victim({ conditions: [{ name: "Restrained", source: { id: "wolf", spell: "Black Tentacles" }, breakFree: { abilities: ["str", "dex"], dc: 14 } }], ...over });

  // The way out is checked "against your spell save DC", so the applied condition has to carry that DC. Bug caught: the condition
  // carries the way out but not the DC (or the target's own), and the check is compared with nothing.
  it("is written on the applied condition with the save's own DC", async () => {
    const s = scripted([[2]]);
    const t = table([wolf(), victim()], { dice: s.dice, bonus: { victim: 0 } });
    await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: tentacled(), targets: [t.get("victim")] });
    expect(t.get("victim").conditions).toEqual([{ name: "Restrained", source: { id: "wolf", spell: "Black Tentacles" }, breakFree: { abilities: ["str", "dex"], dc: 14 } }]);
  });

  // DC 14: d20 12 + 2 = 14 meets it and frees the creature; d20 11 + 2 = 13 does not and the condition stays. Bug caught: a
  // success that leaves it held, or a total one short that frees it.
  it("frees the creature when the total meets the DC, and not one short", async () => {
    const ok = scripted([[12]]);
    const t = table([victim({ ...held() })], { dice: ok.dice });
    const done = await resolveBreakFreeOn(t.ctx, { target: t.get("victim"), condition: t.get("victim").conditions[0], ability: "str", bonus: 2 });
    expect(done.summary).toEqual({ kind: "break_free", instanceId: "victim", name: "Restrained", ability: "str", natural: 12, total: 14, dc: 14, success: true });
    expect(t.get("victim").conditions).toEqual([]);

    const no = scripted([[11]]);
    const t2 = table([held()], { dice: no.dice });
    const failed = await resolveBreakFreeOn(t2.ctx, { target: t2.get("victim"), condition: t2.get("victim").conditions[0], ability: "str", bonus: 2 });
    expect(failed.summary).toMatchObject({ natural: 11, total: 13, success: false });
    expect(t2.get("victim").conditions.map((c) => c.name)).toEqual(["Restrained"]);
  });

  // PHB 2014 "Restrained": disadvantage on Dexterity saves and attack rolls, and on no ability check. Poisoned: "disadvantage on
  // attack rolls and ability checks". Bug caught: Restrained itself puts disadvantage on the Strength check, or Poisoned does not.
  it("rolls plainly while only Restrained, and with disadvantage while also Poisoned", async () => {
    const plain = scripted([[10]]);
    const t = table([held()], { dice: plain.dice });
    await resolveBreakFreeOn(t.ctx, { target: t.get("victim"), condition: t.get("victim").conditions[0], ability: "str", bonus: 0 });
    expect(plain.asks[0]).toMatchObject({ mode: "normal", modifier: 0 });

    const dis = scripted([[10, 3]]);
    const poisoned = held({ conditions: [{ name: "Poisoned" }, ...held().conditions] });
    const t2 = table([poisoned], { dice: dis.dice });
    const done = await resolveBreakFreeOn(t2.ctx, { target: t2.get("victim"), condition: t2.get("victim").conditions[1], ability: "str", bonus: 0 });
    expect(dis.asks[0].mode).toBe("disadvantage");
    expect(done.summary).toMatchObject({ natural: 3 });
  });

  // SRD 5.2.1 "Exhaustion": a d20 test is reduced by 2 times the level. Level 2: -4, so d20 14 + 2 - 4 = 12 fails DC 14.
  // Bug caught: the Exhaustion penalty is left off an ability check.
  it("takes the 2024 Exhaustion penalty off the total", async () => {
    const s = scripted([[14]]);
    const t = table([held({ conditions: [{ name: "Exhaustion", level: 2 }, ...held().conditions] })], { dice: s.dice, ruleset: "2024" });
    const done = await resolveBreakFreeOn(t.ctx, { target: t.get("victim"), condition: t.get("victim").conditions[1], ability: "str", bonus: 2 });
    expect(done.summary).toMatchObject({ total: 12, success: false });
  });

  // Bug caught: a condition with no way out is rolled for anyway, and frees its bearer.
  it("is refused for a condition that carries no way out", async () => {
    const t = table([victim({ conditions: [{ name: "Restrained" }] })], { dice: scripted([]).dice });
    await expect(resolveBreakFreeOn(t.ctx, { target: t.get("victim"), condition: t.get("victim").conditions[0], ability: "str", bonus: 0 })).rejects.toBeInstanceOf(ActionRefused);
  });

  // "its choice": the creature uses the one it is better at. Strength 16 (+3) against Dexterity 10 (+0) is Strength; a tie keeps the first listed.
  // 2024: a listed Athletics +7 replaces modifier plus proficiency, and applies to Strength only. Bug caught: the lower
  // ability is chosen, a tie flips, or a listed skill bonus is added on top of the modifier (+10) or used for Dexterity.
  it("uses the better ability, and a listed skill bonus instead of the modifier on its own ability only", () => {
    const strong = mageBlock({ str: 16, dex: 10 }) as MonsterStatBlock;
    const way = { abilities: ["str", "dex"] as ("str" | "dex")[], dc: 14 };
    expect(strongestBreakFreeAbility(strong, way)).toBe("str");
    expect(strongestBreakFreeAbility(mageBlock({ str: 10, dex: 16 }), way)).toBe("dex");
    expect(strongestBreakFreeAbility(mageBlock({ str: 12, dex: 12 }), way)).toBe("str");
    expect(strongestBreakFreeAbility(null, way)).toBe("str");
    const trained = mageBlock({ str: 16, dex: 10, skills: { athletics: "+7" } });
    expect(breakFreeModifier(trained, "str", "athletics")).toBe(7);
    expect(breakFreeModifier(trained, "str")).toBe(3);
    expect(breakFreeModifier(trained, "dex", "athletics")).toBe(0);
  });
});
