import { describe, it, expect } from "vitest";
import { characterInitiativeSource, initiativeModifier, initiativeRoll, ownInitiativeModifier } from "@/rules/initiative";

const form = (beast_dex: number) => ({ beast_dex });

describe("initiativeModifier", () => {
  // PHB 2014 / SRD 5.2 "Initiative": a Dexterity check.
  it("is the DEX modifier alone for a creature that adds nothing", () => {
    expect(initiativeModifier({ dex_mod: 3 })).toBe(3);
  });
  it("uses a 2024 stat block's printed initiative outright, ignoring DEX", () => {
    expect(initiativeModifier({ dex_mod: 0, initiative_bonus: 14 })).toBe(14);
  });
  it("uses a printed initiative of 0, rather than falling back to DEX", () => {
    expect(initiativeModifier({ dex_mod: 5, initiative_bonus: 0 })).toBe(0);
  });
  it("adds what a character adds to DEX (Alert's +5)", () => {
    // #1149: the DM runner rolled a character's plain DEX modifier, so Alert was lost.
    expect(initiativeModifier({ dex_mod: 2, initiative_extra: 5 })).toBe(7);
  });
  it("reads a Wild Shape form's DEX in place of the character's, keeping their extras", () => {
    // PHB 2014 / SRD 5.2 Wild Shape: the beast's DEX replaces yours; class features and feats stay.
    expect(initiativeModifier({ dex_mod: -1, initiative_extra: 5, wildshape: form(14) })).toBe(7);
  });
});

describe("initiativeRoll", () => {
  it("takes the 2024 Exhaustion penalty, initiative being a d20 test", () => {
    // SRD 5.2 Exhaustion: d20 tests drop by 2 times the level.
    const roll = initiativeRoll({ dex_mod: 3, conditions: [{ name: "Exhaustion", level: 2 }] }, "2024");
    expect(roll).toEqual({ modifier: -1, disadvantage: false });
  });
  it("rolls at disadvantage under 2014 Exhaustion, with no penalty", () => {
    // PHB 2014 Exhaustion level 1: disadvantage on ability checks.
    const roll = initiativeRoll({ dex_mod: 3, conditions: [{ name: "Exhaustion", level: 1 }] }, "2014");
    expect(roll).toEqual({ modifier: 3, disadvantage: true });
  });
  it("rolls at disadvantage while Poisoned, in either edition", () => {
    expect(initiativeRoll({ dex_mod: 3, conditions: [{ name: "Poisoned" }] }, "2024").disadvantage).toBe(true);
  });
});

describe("characterInitiativeSource", () => {
  const bard = { dex: 16, initiative_bonus: 0, proficiency_bonus: 3, wildshape_state: null, conditions: [] };
  it("adds a 2014 Bard's Jack of All Trades, initiative being a Dexterity check", () => {
    // PHB 2014 Jack of All Trades reaches any ability check: +3 DEX, half of PB 3 rounded down is 1.
    expect(initiativeModifier(characterInitiativeSource(bard, "any_check"))).toBe(4);
  });
  it("leaves a 2024 Bard's initiative alone, since it uses no skill", () => {
    // SRD 5.2 Bard: only a check that uses a skill proficiency the character lacks.
    expect(initiativeModifier(characterInitiativeSource(bard, "skill_check"))).toBe(3);
  });
  it("adds the character's initiative_bonus with Jack of All Trades", () => {
    expect(initiativeModifier(characterInitiativeSource({ ...bard, initiative_bonus: 5 }, "any_check"))).toBe(9);
  });
  it("carries the character's Wild Shape form and conditions", () => {
    const shaped = { ...bard, wildshape_state: { monster_id: "wolf", beast_name: "Wolf", beast_image_url: null, beast_hp: 11, beast_max_hp: 11, beast_ac: "13", beast_dex: 10 } };
    expect(initiativeModifier(characterInitiativeSource(shaped, "none"))).toBe(0);
    const poisoned = { ...bard, conditions: [{ name: "Poisoned" }] };
    expect(initiativeRoll(characterInitiativeSource(poisoned, "none"), "2014").disadvantage).toBe(true);
  });
});

describe("ownInitiativeModifier", () => {
  it("prints the character's own DEX and extras, ignoring a Wild Shape form they happen to wear", () => {
    // A printed sheet is the character, not the beast: DEX 16 (+3), Alert +5, a 2014 Bard 2 at PB 2 adds 1.
    expect(ownInitiativeModifier({ dex: 16, initiative_bonus: 5, proficiency_bonus: 2 }, "any_check")).toBe(9);
  });
});
