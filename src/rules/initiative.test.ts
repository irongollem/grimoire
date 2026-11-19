import { describe, it, expect } from "vitest";
import { characterInitiativeSource, initiativeModifier, initiativeRoll, cannotReactWhileSurprised, losesFirstTurnToSurprise, ownInitiativeModifier } from "@/rules/initiative";

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

describe("surprise (SRD 5.2 \"Surprise\"; PHB 2014 ch. 9 \"Surprise\")", () => {
  // Bug: the surprised flag was shown and cleared but never changed a roll or a turn.
  it("rolls initiative with disadvantage under 2024 when surprised, and not otherwise", () => {
    expect(initiativeRoll({ dex_mod: 2, conditions: [], surprised: true }, "2024").disadvantage).toBe(true);
    expect(initiativeRoll({ dex_mod: 2, conditions: [], surprised: false }, "2024").disadvantage).toBe(false);
    expect(initiativeRoll({ dex_mod: 2, conditions: [] }, "2024").disadvantage).toBe(false);
  });
  it("does not touch the 2014 initiative roll: there surprise costs the first turn instead", () => {
    expect(initiativeRoll({ dex_mod: 2, conditions: [], surprised: true }, "2014").disadvantage).toBe(false);
  });
  it("a surprised 2024 creature that is also Poisoned has one disadvantage, not two", () => {
    expect(initiativeRoll({ dex_mod: 2, conditions: [{ name: "Poisoned" }], surprised: true }, "2024")).toEqual({ modifier: 2, disadvantage: true });
  });

  it("loses the first turn under 2014 only: round 1, flagged", () => {
    // PHB 2014: cannot move or take an action on its first turn. Round 1 is the combat's first turn for everyone.
    expect(losesFirstTurnToSurprise({ surprised: true }, "2014", 1)).toBe(true);
    expect(losesFirstTurnToSurprise({ surprised: true }, "2014", 2)).toBe(false);
    expect(losesFirstTurnToSurprise({ surprised: false }, "2014", 1)).toBe(false);
    expect(losesFirstTurnToSurprise({}, "2014", 1)).toBe(false);
  });
  // PHB 2014 ch. 9 "Surprise": no reaction until the first turn ends; the flag is cleared at that moment, so set means withheld.
  it("fails if a surprised 2014 creature may react, or a 2024 one may not", () => {
    expect(cannotReactWhileSurprised({ surprised: true }, "2014")).toBe(true);
    expect(cannotReactWhileSurprised({ surprised: false }, "2014")).toBe(false);
    expect(cannotReactWhileSurprised({}, "2014")).toBe(false);
    expect(cannotReactWhileSurprised({ surprised: true }, "2024")).toBe(false);
  });
  it("loses no turn under 2024, which only costs the Initiative roll", () => {
    expect(losesFirstTurnToSurprise({ surprised: true }, "2024", 1)).toBe(false);
  });
});
