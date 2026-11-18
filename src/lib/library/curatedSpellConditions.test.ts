import { describe, expect, it } from "vitest";
import { agree, findingsFor, type CuratedSpellCondition } from "./curatedSpellConditions";

// SRD 5.1 "Hold Person", shortened to the sentences the entry rests on.
const HOLD_PERSON = {
  concentration: true,
  higher_levels: "When you cast this spell using a spell slot of 3rd level or higher, you can target one additional humanoid for each slot level above 2nd.",
  description:
    "Choose a humanoid that you can see within range. The target must succeed on a Wisdom saving throw or be paralyzed for the duration. " +
    "At the end of each of its turns, the target can make another Wisdom saving throw. On a success, the spell ends on the target.",
};

const holdPerson = (over: Partial<CuratedSpellCondition> = {}): CuratedSpellCondition => ({
  verdict: "condition",
  conditions: ["Paralyzed"], stops_casting: null, speed_zero: false,
  applies: "failed_save",
  save_ability: "WIS",
  targets: { kind: "one", count: 1, more_per_slot_above: 1 },
  only_kinds: ["humanoid"],
  duration: { unit: "minute", amount: 1, concentration: true },
  repeat_save: { when: "end_of_its_turn", ability: "WIS" },
  evidence: "The target must succeed on a Wisdom saving throw or be paralyzed for the duration.",
  ...over,
});

describe("findingsFor", () => {
  it("finds nothing wrong with a faithful reading", () => {
    expect(findingsFor(holdPerson(), HOLD_PERSON)).toEqual([]);
  });

  // Bug caught: a reading with a sentence the spell never says, accepted because nobody compared it to the text.
  it("refuses evidence that is not in the spell's own text", () => {
    expect(findingsFor(holdPerson({ evidence: "The target is paralyzed for one minute, no save." }), HOLD_PERSON).join(" ")).toContain("word for word");
  });

  // Bug caught: a condition the description never names (Stunned for a spell that paralyses), applied in a fight.
  it("refuses a condition the description never names, and one that is not of the rules", () => {
    expect(findingsFor(holdPerson({ conditions: ["Stunned"] }), HOLD_PERSON).join(" ")).toContain("never says Stunned");
    expect(findingsFor(holdPerson({ conditions: ["Frozen" as never] }), HOLD_PERSON).join(" ")).toContain("not a condition of the rules");
  });

  // Bug caught: a save with no ability, which a fight would have to guess; concentration that contradicts the record.
  it("refuses a failed save with no ability, and a concentration that contradicts the spell's record", () => {
    expect(findingsFor(holdPerson({ save_ability: null }), HOLD_PERSON).join(" ")).toContain("names the save's ability");
    expect(findingsFor(holdPerson({ duration: { unit: "minute", amount: 1, concentration: false } }), HOLD_PERSON).join(" ")).toContain("spell's own record says true");
  });

  it("refuses a count that does not fit the kind of target, and a counted duration with no amount", () => {
    expect(findingsFor(holdPerson({ targets: { kind: "several", count: 1, more_per_slot_above: 0 } }), HOLD_PERSON).join(" ")).toContain("2 or more");
    expect(findingsFor(holdPerson({ duration: { unit: "round", amount: null, concentration: true } }), HOLD_PERSON).join(" ")).toContain("amount above zero");
  });

  // Bug caught: "no condition" used to skip a spell, with conditions still listed and read by the fight.
  it("lets a spell with no condition through with only its evidence checked", () => {
    const none: CuratedSpellCondition = { verdict: "no_condition", conditions: [], stops_casting: null, speed_zero: false, applies: null, save_ability: null, targets: null, only_kinds: [], duration: null, repeat_save: null, evidence: "Choose a humanoid that you can see within range." };
    expect(findingsFor(none, HOLD_PERSON)).toEqual([]);
    expect(findingsFor({ ...none, conditions: ["Prone"] }, HOLD_PERSON).join(" ")).toContain("names no conditions");
  });
});

describe("what a higher slot adds", () => {
  // Bug caught: a reader's memory of a spell ("one more target per slot") written down for a record whose own text gives no such thing.
  it("is refused when the record's text says nothing of a higher slot, and allowed when its higher-levels text does", () => {
    expect(findingsFor(holdPerson(), { ...HOLD_PERSON, higher_levels: null }).join(" ")).toContain("says nothing of a higher slot");
    expect(findingsFor(holdPerson(), HOLD_PERSON)).toEqual([]);
  });

  // Bug caught: the evidence refused because it was copied from the higher-levels text, which is as much the spell's own.
  it("takes evidence from the higher-levels text too", () => {
    expect(findingsFor(holdPerson({ evidence: "When you cast this spell using a spell slot of 3rd level or higher, you can target one additional humanoid for each slot level above 2nd." }), HOLD_PERSON)).toEqual([]);
  });
});

describe("a spell that stops casting", () => {
  // SRD 5.1 "Silence", the sentence the entry rests on.
  const SILENCE = { concentration: true, description: "For the duration, no sound can be created within or pass through a 20-foot-radius sphere centered on a point you choose within range. Casting a spell that includes a verbal component is impossible there." };
  const silence = (over: Partial<CuratedSpellCondition> = {}): CuratedSpellCondition => ({
    verdict: "condition", conditions: [], stops_casting: "verbal", speed_zero: false, applies: "automatic", save_ability: null,
    targets: { kind: "area", count: null, more_per_slot_above: 0 }, only_kinds: [],
    duration: { unit: "minute", amount: 10, concentration: true }, repeat_save: null,
    evidence: "Casting a spell that includes a verbal component is impossible there.", ...over,
  });

  // Bug caught: Silence refused as "names no condition", so nothing ever tells a caster it is the spell to aim at a wizard.
  it("is a condition entry with no named condition", () => {
    expect(findingsFor(silence(), SILENCE)).toEqual([]);
  });

  // Bug caught: two readers who disagree on whether a spell stops casting, both taken as agreeing.
  it("is a fact two readings must agree on, and is not left on a spell said to impose nothing", () => {
    expect(agree(silence(), silence({ stops_casting: null }))).toBe(false);
    expect(findingsFor(silence({ verdict: "no_condition" }), SILENCE).join(" ")).toContain("does not stop casting");
  });
});

describe("agree", () => {
  it("holds two readings equal when the facts match, whichever sentence each quoted", () => {
    expect(agree(holdPerson(), holdPerson({ evidence: "Choose a humanoid that you can see within range.", only_kinds: ["Humanoid"] }))).toBe(true);
  });

  // Bug caught: two readers who disagree on how the condition ends, and one of them written to the library anyway.
  it("does not when any fact differs", () => {
    expect(agree(holdPerson(), holdPerson({ repeat_save: null }))).toBe(false);
    expect(agree(holdPerson(), holdPerson({ save_ability: "CON" }))).toBe(false);
    expect(agree(holdPerson(), holdPerson({ verdict: "not_simple" }))).toBe(false);
  });
});

// SRD 5.2.1 "Charm Monster": "On a failed save, the target has the Charmed condition until the spell ends or until you or
// your allies damage it."
const CHARM = {
  concentration: false,
  higher_levels: "",
  description: "One creature you can see within range must succeed on a Wisdom saving throw or have the Charmed condition for 1 hour, until you or your allies damage it, or until you cast this spell again.",
};
const charm = (over: Partial<CuratedSpellCondition> = {}): CuratedSpellCondition =>
  holdPerson({
    conditions: ["Charmed"], only_kinds: [], targets: { kind: "one", count: 1, more_per_slot_above: 0 }, repeat_save: null, duration: { unit: "hour", amount: 1, concentration: false },
    evidence: "One creature you can see within range must succeed on a Wisdom saving throw or have the Charmed condition for 1 hour, until you or your allies damage it, or until you cast this spell again.",
    ends_when_harmed: "by_casters_side", ...over,
  });

describe("ends_when_harmed", () => {
  // Bug caught: a reading that leaves the field out is called different from one that says null, so 886 old entries never agree again.
  it("treats absent and null as the same, and a set value as a disagreement", () => {
    expect(agree(holdPerson(), holdPerson({ ends_when_harmed: null }))).toBe(true);
    expect(agree(charm(), charm({ evidence: "x" }))).toBe(true);
    expect(agree(charm(), charm({ ends_when_harmed: null }))).toBe(false);
    expect(agree(charm(), charm({ ends_when_harmed: "by_anyone" }))).toBe(false);
  });

  it("accepts a charm whose text says damage", () => {
    expect(findingsFor(charm(), CHARM)).toEqual([]);
  });

  // Bug caught: a spell with no condition claims an ending for it.
  it("is a finding on an entry with no condition to end", () => {
    const none = { verdict: "no_condition", conditions: [], stops_casting: null, speed_zero: false, applies: null, save_ability: null, targets: null, only_kinds: [], duration: null, repeat_save: null, ends_when_harmed: "by_anyone", evidence: CHARM.description } satisfies CuratedSpellCondition;
    expect(findingsFor(none, CHARM).join(" ")).toContain("no condition to end when harmed");
  });

  // Bug caught: an ending read off a spell whose text never speaks of damage or harm (Hold Person), which would free the target by an invented rule.
  it("is a finding when the text never says damage or harm", () => {
    expect(findingsFor(holdPerson({ ends_when_harmed: "by_anyone" }), HOLD_PERSON).join(" ")).toContain("never says damage or harm");
  });
});

// SRD 5.1 "Black Tentacles": "A creature restrained by the tentacles can use its action to make a Strength or Dexterity
// check (its choice) against your spell save DC. On a success, it frees itself."
const TENTACLES = {
  concentration: true,
  higher_levels: "",
  description:
    "Squirming, ebony tentacles fill a 20-foot square on ground that you can see within range. When a creature enters the affected area for the first time on a turn or starts its turn there, " +
    "the creature must succeed on a Dexterity saving throw or take 3d6 bludgeoning damage and be restrained by the tentacles until the spell ends. " +
    "A creature restrained by the tentacles can use its action to make a Strength or Dexterity check (its choice) against your spell save DC. On a success, it frees itself.",
};
const tentacles = (over: Partial<CuratedSpellCondition> = {}): CuratedSpellCondition =>
  holdPerson({
    conditions: ["Restrained"], save_ability: "DEX", only_kinds: [], targets: { kind: "area", count: null, more_per_slot_above: 0 }, repeat_save: null,
    evidence: "the creature must succeed on a Dexterity saving throw or take 3d6 bludgeoning damage and be restrained by the tentacles until the spell ends.",
    break_free: { abilities: ["STR", "DEX"], skill: null }, ...over,
  });

describe("break_free", () => {
  // Bug caught: a reading that leaves the field out is called different from one that says null, so every entry written before it stops agreeing.
  it("treats absent and null as the same, and a set value as a disagreement", () => {
    expect(agree(holdPerson(), holdPerson({ break_free: null }))).toBe(true);
    expect(agree(tentacles(), tentacles({ break_free: null }))).toBe(false);
    expect(agree(tentacles(), tentacles({ break_free: { abilities: ["STR", "DEX"], skill: "athletics" } }))).toBe(false);
    expect(agree(tentacles(), tentacles({ break_free: { abilities: ["STR"], skill: null } }))).toBe(false);
  });

  // "a Strength or Dexterity check (its choice)": the order a reader lists the two in is not a fact of the spell.
  // Bug caught: two readers who list the same choices in another order are told they disagree and the spell stays the table's.
  it("ignores the order of the abilities", () => {
    expect(agree(tentacles(), tentacles({ break_free: { abilities: ["DEX", "STR"], skill: null } }))).toBe(true);
  });

  it("accepts a faithful reading of the text", () => {
    expect(findingsFor(tentacles(), TENTACLES)).toEqual([]);
  });

  // Bug caught: a spell that imposes nothing claims a way out of it.
  it("is a finding on an entry with no condition", () => {
    const none = { verdict: "no_condition", conditions: [], stops_casting: null, speed_zero: false, applies: null, save_ability: null, targets: null, only_kinds: [], duration: null, repeat_save: null, break_free: { abilities: ["STR"], skill: null }, evidence: TENTACLES.description } satisfies CuratedSpellCondition;
    expect(findingsFor(none, TENTACLES).join(" ")).toContain("no condition to break free of");
    expect(findingsFor({ ...none, verdict: "not_simple" }, TENTACLES).join(" ")).toContain("no condition to break free of");
  });

  // Bug caught: a way out invented for a spell whose text never speaks of a check (Hold Person), which would free a paralysed creature by an invented rule.
  it("is a finding when the text never says check", () => {
    expect(findingsFor(holdPerson({ break_free: { abilities: ["STR"], skill: null } }), HOLD_PERSON).join(" ")).toContain("never says check");
  });

  // Bug caught: a way out that names no ability to check with, which the fight would have to guess.
  it("is a finding when no ability is named", () => {
    expect(findingsFor(tentacles({ break_free: { abilities: [], skill: null } }), TENTACLES).join(" ")).toContain("names no ability");
  });
});
