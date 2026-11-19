import { describe, expect, it } from "vitest";
import { checkBonus, type CheckBonusInput } from "./checkBonus";
import type { RollAsk } from "./soloTypes";
import type { AppliedCondition } from "@/types/condition.types";

const scores = { str: 10, dex: 14, con: 12, int: 10, wis: 16, cha: 8 };
const cond = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra }) as unknown as AppliedCondition;

function input(over: Partial<CheckBonusInput["member"]> = {}, rest: Partial<CheckBonusInput> = {}): CheckBonusInput {
  return {
    member: { ...scores, proficiency_bonus: 3, skill_proficiencies: {}, saving_throw_proficiencies: [], conditions: [], ...over },
    scores,
    jack: "none",
    ruleset: "2014",
    itemSaveBonus: 0,
    ...rest,
  };
}
const skill = (key: RollAsk["skill"], ability: RollAsk["ability"] = "wis"): RollAsk => ({ label: "x", kind: "check", ability, skill: key });
const save = (ability: RollAsk["ability"]): RollAsk => ({ label: "x", kind: "save", ability, skill: null });
const plain = (ability: RollAsk["ability"]): RollAsk => ({ label: "x", kind: "check", ability, skill: null });

describe("checkBonus", () => {
  // PHB 2014 "Proficiency Bonus" / "Expertise": proficiency adds the bonus once, expertise twice. WIS 16 is +3, PB +3.
  // Bug caught: expertise scored as plain proficiency, or an unproficient skill scored with proficiency.
  it("doubles proficiency for expertise, adds it once for proficient and not at all otherwise", () => {
    const at = (level: "none" | "proficient" | "expertise") => checkBonus(skill("perception"), input({ skill_proficiencies: { perception: level } })).bonus;
    expect(at("none")).toBe(3);
    expect(at("proficient")).toBe(6);
    expect(at("expertise")).toBe(9);
  });

  // PHB 2014 "Saving Throws": a proficient save adds the proficiency bonus. DEX 14 is +2.
  // Bug caught: every save getting proficiency, or none.
  it("adds proficiency to a proficient save and not to an unproficient one", () => {
    expect(checkBonus(save("dex"), input({ saving_throw_proficiencies: ["dex"] })).bonus).toBe(5);
    expect(checkBonus(save("dex"), input()).bonus).toBe(2);
    // DMG 2014 ch. 7 "Ring of Protection": +1 to saves while worn and attuned. Bug caught: the card showing a save
    // one short of what the server rolls for the same character.
    expect(checkBonus(save("dex"), input({}, { itemSaveBonus: 1 })).bonus).toBe(3);
    expect(checkBonus(skill("perception"), input({}, { itemSaveBonus: 1 })).bonus).toBe(checkBonus(skill("perception"), input()).bonus);
    expect(checkBonus(save("dex"), input({ saving_throw_proficiencies: ["wis"] })).bonus).toBe(2);
  });

  // PHB 2014 "Bard: Jack of All Trades": half proficiency, rounded down (1), on a check without proficiency.
  // Bug caught: Jack applied to a save, or to a skill the character is proficient in.
  it("gives Jack of All Trades a plain ability check and an unproficient skill, never a save or a proficient skill", () => {
    const jack = { jack: "any_check" } as const;
    expect(checkBonus(plain("dex"), input({}, jack)).bonus).toBe(3);
    expect(checkBonus(skill("perception"), input({}, jack)).bonus).toBe(4);
    expect(checkBonus(skill("perception"), input({ skill_proficiencies: { perception: "proficient" } }, jack)).bonus).toBe(6);
    expect(checkBonus(save("dex"), input({}, jack)).bonus).toBe(2);
  });

  // SRD 5.2 "Bard: Jack of All Trades": only a check that uses a skill proficiency you lack, so no plain ability check.
  it("leaves a plain ability check without Jack of All Trades under the 2024 wording", () => {
    expect(checkBonus(plain("dex"), input({}, { jack: "skill_check" })).bonus).toBe(2);
  });

  // PHB 2014 "Variant: Skills with Different Abilities": Strength (Intimidation) uses the Strength modifier.
  // Bug caught: the table's asked ability ignored, scoring Charisma (8, -1) instead of Strength (10, 0).
  it("uses the asked ability for a skill with another ability than its own", () => {
    expect(checkBonus(skill("intimidation", "str"), input({ skill_proficiencies: { intimidation: "proficient" } })).bonus).toBe(3);
  });

  // SRD 5.1 "Conditions" (Poisoned): disadvantage on ability checks. Restrained: disadvantage on DEX saves only.
  // Bug caught: a condition's disadvantage dropped, or applied to the wrong kind of roll.
  it("forces disadvantage from a condition on the right roll only", () => {
    expect(checkBonus(skill("perception"), input({ conditions: [cond("Poisoned")] })).forcedDisadvantage).toBe(true);
    expect(checkBonus(save("wis"), input({ conditions: [cond("Poisoned")] })).forcedDisadvantage).toBe(false);
    expect(checkBonus(save("dex"), input({ conditions: [cond("Restrained")] })).forcedDisadvantage).toBe(true);
    expect(checkBonus(save("wis"), input({ conditions: [cond("Restrained")] })).forcedDisadvantage).toBe(false);
    expect(checkBonus(plain("wis"), input()).forcedDisadvantage).toBe(false);
  });

  // SRD 5.2 "Exhaustion": every d20 Test is reduced by 2 x level. Level 2 is -4.
  // Bug caught: the 2024 penalty left off a skill, a plain check or a save, which the sheet applies to all three.
  it("subtracts 2024 exhaustion from a skill check, a plain check and a save", () => {
    const tired = { conditions: [cond("Exhaustion", { level: 2 })] };
    const table = input(tired, { ruleset: "2024" });
    expect(checkBonus(skill("perception"), table).bonus).toBe(3 - 4);
    expect(checkBonus(plain("wis"), table).bonus).toBe(3 - 4);
    expect(checkBonus(save("wis"), table).bonus).toBe(3 - 4);
  });

  // A Wild Shape form's STR, DEX and CON replace the character's own (PHB 2014 "Wild Shape").
  it("scores from the scores in effect, not the character's own", () => {
    expect(checkBonus(save("str"), input({}, { scores: { ...scores, str: 18 } })).bonus).toBe(4);
  });
});
