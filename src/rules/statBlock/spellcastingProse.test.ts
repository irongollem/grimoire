import { describe, expect, it } from "vitest";
import type { MonsterStatBlock } from "../../types/monster.types.ts";
import { emptyDefenses, type StatBlockEntry } from "../../types/statBlock.types.ts";
import { isSpellcastingEntry, parseSpellcasting, spellcastingOf, type ProseSpell } from "./spellcastingProse.ts";

const entry = (name: string, description = ""): StatBlockEntry => ({
  name,
  description,
  structured: { kind: "other", source: "manual", review: "unreadable" },
});
const block = (over: Partial<MonsterStatBlock> = {}): MonsterStatBlock => ({
  armor_class: 12, hit_points: "2d8", speed: "30 ft.", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, challenge_rating: "1", defenses: emptyDefenses(), ...over,
});
const spell = (name: string, qualifier: string | null = null): ProseSpell => ({ name, qualifier, key: name.toLowerCase() });
const names = (spells: ProseSpell[]) => spells.map((s) => s.name);

// SRD 5.1, mage.
const MAGE =
  "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:\n\nCantrips (at will): fire bolt, light, mage hand, prestidigitation\n1st level (4 slots): detect magic, mage armor, magic missile, shield\n2nd level (3 slots): misty step, suggestion\n3rd level (3 slots): counterspell, fireball, fly\n4th level (2 slots): greater invisibility, ice storm\n5th level (1 slot): cone of cold";
// SRD 5.1, night hag.
const HAG_2014 =
  "The hag's innate spellcasting ability is Charisma (spell save DC 14, +6 to hit with spell attacks). She can innately cast the following spells, requiring no material components:\n\nAt will: detect magic, magic missile\n2/day each: plane shift (self only), ray of enfeeblement, sleep";
// SRD 5.2, night hag (an action there).
const HAG_2024 =
  "The hag casts one of the following spells, requiring no Material components and using Intelligence as the spellcasting ability (spell save DC 14):\n\n- **At Will:** Detect Magic, Etherealness, Magic Missile\n- **2/Day Each:** Phantasmal Killer, Plane Shift";

describe("parseSpellcasting", () => {
  it("fails if the SRD 5.1 mage loses a header field, a slot count or a spell", () => {
    expect(parseSpellcasting(entry("Spellcasting", MAGE))).toEqual({
      innate: false,
      ability: "INT",
      saveDc: 14,
      attackBonus: 6,
      casterLevel: 9,
      className: "wizard",
      groups: [
        { frequency: { kind: "cantrips" }, spells: ["fire bolt", "light", "mage hand", "prestidigitation"].map((n) => spell(n)) },
        { frequency: { kind: "slots", level: 1, slots: 4 }, spells: ["detect magic", "mage armor", "magic missile", "shield"].map((n) => spell(n)) },
        { frequency: { kind: "slots", level: 2, slots: 3 }, spells: [spell("misty step"), spell("suggestion")] },
        { frequency: { kind: "slots", level: 3, slots: 3 }, spells: ["counterspell", "fireball", "fly"].map((n) => spell(n)) },
        { frequency: { kind: "slots", level: 4, slots: 2 }, spells: [spell("greater invisibility"), spell("ice storm")] },
        { frequency: { kind: "slots", level: 5, slots: 1 }, spells: [spell("cone of cold")] },
      ],
    });
  });

  it("fails if the SRD 5.1 innate night hag is not innate or loses the 2/day each group or a qualifier", () => {
    expect(parseSpellcasting(entry("Innate Spellcasting", HAG_2014))).toEqual({
      innate: true,
      ability: "CHA",
      saveDc: 14,
      attackBonus: 6,
      casterLevel: null,
      className: null,
      groups: [
        { frequency: { kind: "at_will" }, spells: [spell("detect magic"), spell("magic missile")] },
        {
          frequency: { kind: "per_day", count: 2, each: true },
          spells: [spell("plane shift", "self only"), spell("ray of enfeeblement"), spell("sleep")],
        },
      ],
    });
  });

  it("fails if the SRD 5.2 night hag's bold, bulleted lines or 'using X as the spellcasting ability' are not read", () => {
    const prose = parseSpellcasting(entry("Spellcasting", HAG_2024));
    expect(prose).toMatchObject({ innate: false, ability: "INT", saveDc: 14, attackBonus: null, casterLevel: null, className: null });
    expect(prose?.groups).toEqual([
      { frequency: { kind: "at_will" }, spells: ["Detect Magic", "Etherealness", "Magic Missile"].map((n) => ({ name: n, qualifier: null, key: n.toLowerCase() })) },
      { frequency: { kind: "per_day", count: 2, each: true }, spells: ["Phantasmal Killer", "Plane Shift"].map((n) => ({ name: n, qualifier: null, key: n.toLowerCase() })) },
    ]);
  });

  it("fails if a comma inside parentheses splits one spell in two", () => {
    const prose = parseSpellcasting(entry("Spellcasting", "At will: conjure elemental (fire elemental only), fire shield (warm, cold)"));
    expect(prose?.groups[0].spells).toEqual([
      { name: "conjure elemental", qualifier: "fire elemental only", key: "conjure elemental" },
      { name: "fire shield", qualifier: "warm, cold", key: "fire shield" },
    ]);
  });

  it("fails if a qualifier stays in the spell's name or its lookup key, or a trailing full stop stays on the name", () => {
    const prose = parseSpellcasting(entry("Spellcasting", "At will: fire bolt (2d10), Disguise Self (any humanoid form)."));
    expect(prose?.groups[0].spells).toEqual([
      { name: "fire bolt", qualifier: "2d10", key: "fire bolt" },
      { name: "Disguise Self", qualifier: "any humanoid form", key: "disguise self" },
    ]);
  });

  it("fails if italics or bold markers survive into names or break the marker", () => {
    const prose = parseSpellcasting(entry("Spellcasting", "**At will:** _fireball_, *shield*\n- _3/day each:_ __fly__"));
    expect(prose?.groups).toEqual([
      { frequency: { kind: "at_will" }, spells: [spell("fireball"), spell("shield")] },
      { frequency: { kind: "per_day", count: 3, each: true }, spells: [spell("fly")] },
    ]);
  });

  it("fails if '(1 slot)' singular is not read as a slot line", () => {
    expect(parseSpellcasting(entry("Spellcasting", "5th level (1 slot): cone of cold"))?.groups[0].frequency).toEqual({ kind: "slots", level: 5, slots: 1 });
  });

  it("fails if '3/day' without 'each' is given each: true, or a spaced slash is not read", () => {
    expect(parseSpellcasting(entry("Innate Spellcasting", "3/day: fly\n1 / Day Each: wish"))?.groups.map((g) => g.frequency)).toEqual([
      { kind: "per_day", count: 3, each: false },
      { kind: "per_day", count: 1, each: true },
    ]);
  });

  // Found by running the parser over every caster in the library: some third-party books write "3/day ea:" and
  // keep a literal <br> between lines, which left "hold<br>" as a spell name and whole lists unread.
  it("fails if the 'ea' abbreviation is not read as each, or a <br> tag is left on the last spell of a line", () => {
    const prose = parseSpellcasting(entry("Innate Spellcasting", "At will: charm person, hold person<br>3/day ea: command, suggestion<br>1/day: geas"));
    expect(prose?.groups.map((g) => g.frequency)).toEqual([
      { kind: "at_will" },
      { kind: "per_day", count: 3, each: true },
      { kind: "per_day", count: 1, each: false },
    ]);
    expect(prose?.groups.map((g) => names(g.spells))).toEqual([["charm person", "hold person"], ["command", "suggestion"], ["geas"]]);
  });

  it("fails if a line with two markers loses the second group or gives its spells to the first", () => {
    const prose = parseSpellcasting(entry("Innate Spellcasting", "At will: light, mage hand 1/day each: fireball, fly"));
    expect(prose?.groups).toEqual([
      { frequency: { kind: "at_will" }, spells: [spell("light"), spell("mage hand")] },
      { frequency: { kind: "per_day", count: 1, each: true }, spells: [spell("fireball"), spell("fly")] },
    ]);
  });

  it("fails if an ability other than Intelligence, Wisdom or Charisma is read as a spellcasting ability", () => {
    expect(parseSpellcasting(entry("Spellcasting", "Its spellcasting ability is Strength (spell save DC 12).\nAt will: light"))?.ability).toBeNull();
  });

  it("fails if a missing header turns up header values, or drops the groups", () => {
    const prose = parseSpellcasting(entry("Spellcasting", "At will: light"));
    expect(prose).toEqual({
      innate: false, ability: null, saveDc: null, attackBonus: null, casterLevel: null, className: null,
      groups: [{ frequency: { kind: "at_will" }, spells: [spell("light")] }],
    });
  });

  it("fails if a doubled or trailing comma gives a spell with an empty name", () => {
    const prose = parseSpellcasting(entry("Spellcasting", "At will: light, , shield,"));
    expect(names(prose?.groups[0].spells ?? [])).toEqual(["light", "shield"]);
  });

  it("fails if a line without a marker contributes spells", () => {
    const prose = parseSpellcasting(entry("Spellcasting", "The mage casts fireball and shield when it likes.\nAt will: light"));
    expect(prose?.groups.flatMap((g) => names(g.spells))).toEqual(["light"]);
  });

  it("fails if a spellcasting entry without any marker line is given groups, or not returned at all", () => {
    expect(parseSpellcasting(entry("Spellcasting", "The creature can innately cast fireball once."))?.groups).toEqual([]);
  });

  it("fails if an entry called Innate Spellcasting is not innate even when its text never says so", () => {
    expect(parseSpellcasting(entry("Innate Spellcasting", "At will: light"))?.innate).toBe(true);
  });

  it("fails if 'innately cast' in the text of a plain Spellcasting entry does not make it innate", () => {
    expect(parseSpellcasting(entry("Spellcasting", "It can innately cast the following spells:\nAt will: light"))?.innate).toBe(true);
  });

  it("fails if a non-spellcasting entry is parsed instead of giving null", () => {
    expect(parseSpellcasting(entry("Multiattack", "At will: light"))).toBeNull();
  });
});

describe("isSpellcastingEntry", () => {
  it.each(["Spellcasting", "Innate Spellcasting", "Spellcasting (Psionics)", "  innate  SPELLCASTING "])(
    "fails if %j is not accepted",
    (name) => expect(isSpellcastingEntry(entry(name))).toBe(true),
  );
  // SRD 5.1 hag and library traits that only mention the word.
  it.each(["Shared Spellcasting (Coven Only)", "Detect Spellcasting", "Spellcasting Animosity", "Flawed Spellcasting"])(
    "fails if %j is taken for the creature's own spell list",
    (name) => expect(isSpellcastingEntry(entry(name))).toBe(false),
  );
});

describe("spellcastingOf", () => {
  it("fails if an entry in special_abilities or in actions is missed, or the list it sits in is misreported", () => {
    const traits = entry("Innate Spellcasting", HAG_2014);
    const action = entry("Spellcasting", HAG_2024);
    const found = spellcastingOf(block({ special_abilities: [entry("Magic Resistance"), traits], actions: [entry("Claws"), action] }));
    expect(found.map((f) => [f.list, f.entry])).toEqual([["special_abilities", traits], ["actions", action]]);
    expect(found[0].prose.innate).toBe(true);
  });

  it("fails if a bonus action spellcasting entry is not found", () => {
    expect(spellcastingOf(block({ bonus_actions: [entry("Spellcasting", "At will: light")] })).map((f) => f.list)).toEqual(["bonus_actions"]);
  });

  it("fails if a stat block with no spellcasting entry gives any result", () => {
    expect(spellcastingOf(block({ actions: [entry("Shared Spellcasting (Coven Only)", "1st level (4 slots): identify")] }))).toEqual([]);
  });
});
