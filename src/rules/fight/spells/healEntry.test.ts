import { describe, expect, it } from "vitest";
import { castSlotOf, healEntryFor, healExcludedKinds, isHealingSpell } from "./healEntry";
import { cureWounds, fireball, healingWord, massHealingWord } from "./spellTestKit";

const WIS_PLUS_3 = { modifier: 3 };

describe("healEntryFor", () => {
  // PHB 2014 "Cure Wounds": 1d8 + spellcasting modifier; "At Higher Levels": +1d8 per slot level above 1st. Cast with a 3rd-level slot: 3d8.
  // Bug caught: the dice not growing with the slot, or growing from the wrong base (the level 1 spell is cast at 3: two levels above).
  it("fails if 2014 Cure Wounds cast at 3rd level does not heal 3d8 plus the modifier", () => {
    expect(healEntryFor(cureWounds(), 1, WIS_PLUS_3)).toMatchObject({ healable: true, dice: "1d8", modifier: 3 });
    expect(healEntryFor(cureWounds(), 3, WIS_PLUS_3)).toMatchObject({ healable: true, dice: "3d8", modifier: 3 });
  });

  // PHB 2024 "Cure Wounds": 2d8 + modifier, +2d8 per slot level above 1st. Bug caught: a 2024 caster healing by the 2014 dice.
  it("fails if 2024 Cure Wounds is not 2d8, or its upcast is not +2d8 a level", () => {
    expect(healEntryFor(cureWounds({ ruleset: "2024" }), 1, WIS_PLUS_3)).toMatchObject({ dice: "2d8" });
    expect(healEntryFor(cureWounds({ ruleset: "2024" }), 2, WIS_PLUS_3)).toMatchObject({ dice: "4d8" });
  });

  // PHB 2014 "Healing Word": 1d4 + modifier; PHB 2024: 2d4 + modifier. A Bonus Action in both.
  it("fails if Healing Word is not 1d4 in 2014 and 2d4 in 2024, or is not a Bonus Action", () => {
    expect(healEntryFor(healingWord(), 1, WIS_PLUS_3)).toMatchObject({ dice: "1d4", slot: "bonus_action" });
    expect(healEntryFor(healingWord({ ruleset: "2024" }), 1, WIS_PLUS_3)).toMatchObject({ dice: "2d4", slot: "bonus_action" });
  });

  // The mean of 1d8 is 4.5, plus a modifier of 3. Bug caught: the average leaving the modifier out, which would weigh every heal too low.
  it("fails if the average leaves the spellcasting modifier out", () => {
    expect(healEntryFor(cureWounds(), 1, WIS_PLUS_3)).toMatchObject({ average: 7.5 });
  });

  // Bug caught: a spell that adds "your spellcasting ability modifier" cast by a caster whose block names no ability, healing with none added.
  it("fails if a spell that adds the casting modifier is rolled when the caster names no ability", () => {
    const entry = healEntryFor(cureWounds(), 1, { modifier: null });
    expect(entry).toMatchObject({ healable: false, why: expect.stringMatching(/names no spellcasting ability/) });
  });

  it("fails if a spell that adds no modifier is refused for want of one", () => {
    const flat = cureWounds({ effects: [{ ...cureWounds().effects![0], modifier: null }] });
    expect(healEntryFor(flat, 1, { modifier: null })).toMatchObject({ healable: true, modifier: 0 });
  });

  // PHB "Casting a Spell": a slot of the spell's level or higher. Bug caught: a level 3 spell cast with a 2nd-level slot.
  it("fails if a spell is cast with a slot below its level", () => {
    expect(healEntryFor(massHealingWord(), 2, WIS_PLUS_3)).toMatchObject({ healable: false });
  });

  // "Mass Healing Word": up to six creatures. Bug caught: a mass spell offered at one creature.
  it("fails if Mass Healing Word does not reach up to six creatures", () => {
    expect(healEntryFor(massHealingWord(), 3, WIS_PLUS_3)).toMatchObject({ healable: true, targetCount: 6, dice: "1d4" });
  });

  // Prayer of Healing takes 10 minutes: a fight does not cast it. Bug caught: a ten-minute spell offered as a turn.
  it("fails if a spell cast in minutes is offered", () => {
    const prayer = cureWounds({ casting_time: "Special", casting_time_custom: "10minutes" });
    expect(healEntryFor(prayer, 1, WIS_PLUS_3)).toMatchObject({ healable: false, why: expect.stringMatching(/Action or a Bonus Action/) });
  });

  // Heal (a 6th-level spell) stores no healing in its effects; a campaign's own spell has none either. Nothing is read from the text.
  it("fails if a spell with no structured healing is guessed at", () => {
    const heal = cureWounds({ name: "Heal", level: 6, healing_dice: null, effects: [] });
    expect(healEntryFor(heal, 6, WIS_PLUS_3)).toMatchObject({ healable: false, why: expect.stringMatching(/no healing in its data/) });
  });

  // 2014 "Mass Cure Wounds" is stored as a point (an area): the rules do not aim an area heal yet. Bug caught: it rolled at "one creature".
  it("fails if a spell stored as an area is rolled as a chosen creature", () => {
    const mass = cureWounds({ level: 5, effects: [{ ...cureWounds().effects![0], target: { type: "point", count: 1 } }] });
    expect(healEntryFor(mass, 5, WIS_PLUS_3)).toMatchObject({ healable: false });
  });

  // Two healing effects (a heal that also heals again later, or a spell with a second dice pool) are not one roll: the rules do not guess which counts.
  it("fails if a record with two healing effects is rolled as one", () => {
    const [base] = cureWounds().effects!;
    expect(healEntryFor(cureWounds({ effects: [base, { ...base, id: "second" }] }), 1, WIS_PLUS_3)).toMatchObject({ healable: false, why: expect.stringMatching(/several healing effects/) });
  });

  it("fails if a heal that comes later in its duration is rolled at the cast", () => {
    const later = cureWounds({ effects: [{ ...cureWounds().effects![0], phase: "turn_start" }] });
    expect(healEntryFor(later, 1, WIS_PLUS_3)).toMatchObject({ healable: false });
  });
});

describe("what a spell does nothing for", () => {
  // PHB 2014 "Cure Wounds": "This spell has no effect on undead or constructs." The 2024 text has no such sentence.
  it("fails if a shared 2014 heal does not exclude undead and constructs, or a 2024 one does", () => {
    expect(healExcludedKinds(cureWounds())).toEqual(["undead", "construct"]);
    expect(healExcludedKinds(cureWounds({ ruleset: "2024" }))).toEqual([]);
  });

  // A campaign's own spell is the DM's word: the record cannot say its text had the sentence.
  it("fails if a campaign's own 2014 heal excludes undead on the strength of its edition", () => {
    expect(healExcludedKinds(cureWounds({ own: true }))).toEqual([]);
  });
});

describe("castSlotOf and isHealingSpell", () => {
  it("reads the library's two spellings of a Bonus Action, and an Action", () => {
    expect(castSlotOf(healingWord())).toBe("bonus_action");
    expect(castSlotOf(healingWord({ casting_time: "Bonus Action", casting_time_custom: null }))).toBe("bonus_action");
    expect(castSlotOf(cureWounds())).toBe("action");
  });

  // Bug caught: a Reaction spell, or a record with no casting time stored, cast as an Action.
  it("fails if a Reaction or a record with no casting time is taken for an Action", () => {
    expect(castSlotOf(cureWounds({ casting_time: "Reaction", casting_time_custom: "when you are hit" }))).toBeNull();
    expect(castSlotOf(cureWounds({ casting_time: undefined, casting_time_custom: undefined }))).toBeNull();
  });

  it("tells a healing record from a damage one", () => {
    expect(isHealingSpell(cureWounds())).toBe(true);
    expect(isHealingSpell(fireball())).toBe(false);
  });
});
