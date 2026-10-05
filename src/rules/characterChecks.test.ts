import { describe, expect, it } from "vitest";
import { effectiveAbilityScores, savingThrowEntries } from "./characterChecks";

const member = { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10, proficiency_bonus: 3, saving_throw_proficiencies: ["int", "wis"] as const };

describe("effectiveAbilityScores", () => {
  it("is a flat ten of each with no member", () => {
    expect(effectiveAbilityScores(null, { active: false, statBlock: null })).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  });
  it("keeps the character's own scores out of a form", () => {
    expect(effectiveAbilityScores(member, { active: false, statBlock: { str: 20, dex: 20, con: 20 } }).str).toBe(8);
  });
  it("keeps them while the form's stat block is unknown", () => {
    expect(effectiveAbilityScores(member, { active: true, statBlock: null }).str).toBe(8);
  });
  it("takes the beast's physical scores and keeps the mental ones", () => {
    expect(effectiveAbilityScores(member, { active: true, statBlock: { str: 18, dex: 12, con: 16 } })).toEqual({
      str: 18, dex: 12, con: 16, int: 16, wis: 10, cha: 10,
    });
  });
});

describe("savingThrowEntries", () => {
  it("is undefined with no member", () => {
    expect(savingThrowEntries(null, { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })).toBeUndefined();
  });
  it("adds proficiency only to proficient saves", () => {
    const saves = savingThrowEntries({ ...member, saving_throw_proficiencies: ["int", "wis"] }, effectiveAbilityScores(member, { active: false, statBlock: null }));
    expect(saves?.int).toEqual({ bonus: 6, proficient: true });
    expect(saves?.str).toEqual({ bonus: -1, proficient: false });
    expect(saves?.wis).toEqual({ bonus: 3, proficient: true });
  });
  it("reads the scores in effect, so a beast's Strength moves the Strength save", () => {
    const scores = effectiveAbilityScores(member, { active: true, statBlock: { str: 18, dex: 12, con: 16 } });
    expect(savingThrowEntries({ ...member, saving_throw_proficiencies: [] }, scores)?.str.bonus).toBe(4);
  });
});
