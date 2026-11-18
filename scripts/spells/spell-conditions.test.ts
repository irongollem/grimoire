import { describe, expect, it } from "vitest";
import type { CuratedSpellCondition } from "../../src/lib/library/curatedSpellConditions.ts";
import { checkReadings, describePlan, planConditionWrites, worklistOf, type SpellText } from "./spell-conditions.ts";

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

describe("planConditionWrites", () => {
  const withSpells = new Map([...spells, ["fog", spell("fog", "Fog", "Mist.")], ["lone", spell("lone", "Lone", HOLD)], ["x", spell("x", "Hold Monster", HOLD)]]);

  // Bug caught: a row a reading is unsure of, or two readings disagree on, written to the shared library.
  it("writes only the usable ids, never one with a finding, a disagreement or one reading", () => {
    const a = { hold: reading(), x: reading(), fog: reading({ evidence: "It is paralyzed." }), lone: reading() };
    const b = { hold: reading(), x: reading({ repeat_save: null }), fog: reading({ evidence: "It is paralyzed." }) };
    const report = checkReadings(a, b, withSpells);
    expect(planConditionWrites(report, a).map((w) => w.id)).toEqual(["hold"]);
  });

  // Bug caught: the sentence of evidence stored in a column that holds facts only.
  it("strips the evidence and writes reading a's facts as they are", () => {
    const a = { hold: reading() };
    const [write] = planConditionWrites(checkReadings(a, { hold: reading({ evidence: "The target must succeed on a Wisdom saving throw or be paralyzed for the duration." }) }, spells), a);
    expect(write.condition_effect).not.toHaveProperty("evidence");
    const { evidence: _evidence, ...facts } = reading();
    expect(write.condition_effect).toEqual(facts);
  });

  it("counts what it would write by verdict and what it skips and why", () => {
    const none = reading({ verdict: "no_condition", conditions: [], evidence: "Mist.", applies: null, save_ability: null, targets: null, only_kinds: [], duration: null, repeat_save: null });
    const a = { hold: reading(), fog: none, lone: reading() };
    const b = { hold: reading(), fog: none };
    const report = checkReadings(a, b, withSpells);
    expect(describePlan(planConditionWrites(report, a), report)).toBe(
      "2 to write (condition 1, no_condition 1, not_simple 0); of them settled by a ruling 0; skipped: disagree 0, with findings 0, in one reading only 1, no such spell 0.",
    );
  });
});

describe("a ruling", () => {
  // Bug caught: a record a person ruled on still skipped as a disagreement; or the ruling written without being
  // held to the spell's own text.
  it("settles a record the readings differ on, is what gets written, and is still checked against the text", () => {
    const a = { hold: reading() };
    const b = { hold: reading({ repeat_save: null }) };
    expect(checkReadings(a, b, spells)).toMatchObject({ usable: [], disagree: ["hold"] });
    const ruled = { hold: reading({ only_kinds: [], evidence: HOLD }) };
    const report = checkReadings(a, b, spells, ruled);
    expect(report).toMatchObject({ usable: [], settled: ["hold"], disagree: [] });
    expect(planConditionWrites(report, a, ruled)).toEqual([expect.objectContaining({ id: "hold", condition_effect: expect.objectContaining({ only_kinds: [] }) })]);
    const bad = checkReadings(a, b, spells, { hold: reading({ evidence: "It is held fast." }) });
    expect(bad.settled).toEqual([]);
    expect(bad.findings.hold.a.join(" ")).toContain("word for word");
  });
});

