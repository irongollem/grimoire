import { describe, expect, it } from "vitest";
import type { CuratedSpellCondition } from "../../src/lib/library/curatedSpellConditions.ts";
import { checkReadings, worklistOf, type SpellText } from "./spell-conditions.ts";

const spell = (id: string, name: string, description: string): SpellText => ({ id, name, ruleset: "2014", level: 2, concentration: true, duration: "Concentration, up to 1 minute", description, higher_levels: "When you cast this spell using a spell slot of 3rd level or higher, you can target one additional humanoid for each slot level above 2nd." });
const HOLD = "The target must succeed on a Wisdom saving throw or be paralyzed for the duration.";
const reading = (over: Partial<CuratedSpellCondition> = {}): CuratedSpellCondition => ({
  verdict: "condition", conditions: ["Paralyzed"], stops_casting: null, speed_zero: false, applies: "failed_save", save_ability: "WIS",
  targets: { kind: "one", count: 1, more_per_slot_above: 1 }, only_kinds: ["humanoid"],
  duration: { unit: "minute", amount: 1, concentration: true }, repeat_save: { when: "end_of_its_turn", ability: "WIS" }, evidence: HOLD, ...over,
});
const spells = new Map([["hold", spell("hold", "Hold Person", HOLD)]]);

describe("checkReadings", () => {
  it("calls an entry usable only when both readings pass and agree", () => {
    expect(checkReadings({ hold: reading() }, { hold: reading() }, spells).usable).toEqual(["hold"]);
  });

  // Bug caught: one reader's entry written to the library with nobody having read the spell a second time.
  it("does not call usable what only one reading holds, what the two disagree on, or what fails its own text", () => {
    expect(checkReadings({ hold: reading() }, {}, spells)).toMatchObject({ usable: [], onlyInOne: ["hold"] });
    expect(checkReadings({ hold: reading() }, { hold: reading({ repeat_save: null }) }, spells)).toMatchObject({ usable: [], disagree: ["hold"] });
    const bad = checkReadings({ hold: reading() }, { hold: reading({ evidence: "It is paralyzed." }) }, spells);
    expect(bad.usable).toEqual([]);
    expect(bad.findings.hold.b.join(" ")).toContain("word for word");
    expect(checkReadings({ gone: reading() }, { gone: reading() }, spells)).toMatchObject({ usable: [], unknownSpell: ["gone"] });
  });
});

describe("worklistOf", () => {
  const mage = { special_abilities: [{ name: "Spellcasting", description: "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks).\n\n2nd level (3 slots): hold person, misty step" }] };

  // Bug caught: a spell that lives in two books offered once, so the other book's record is never read.
  it("lists every record of a spell a monster names, most used first, and nothing no monster casts", () => {
    const list = worklistOf([mage, mage], [spell("a", "Hold Person", HOLD), spell("b", "Hold Person", HOLD), spell("c", "Wish", "…")]);
    expect(list.map((s) => [s.id, s.monsters])).toEqual([["a", 2], ["b", 2]]);
  });
});
