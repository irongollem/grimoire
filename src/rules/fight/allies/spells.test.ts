import { describe, expect, it } from "vitest";
import type { CharacterClass } from "@/types/multiclass.types";
import type { SpellSlotEntry } from "@/types/party.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { MonsterStatBlock } from "@/types/monster.types";
import { limitAvailability } from "../../encounterTurn";
import { spellcastingOf } from "../../statBlock/spellcastingProse";
import { castableNow, listedSpellNames } from "../spells/castNow";
import { fireball, fireBolt } from "../spells/spellTestKit";
import { NO_CASTING, type AllySpellRow, type PlayerSheetRow, type PlayerSheets } from "../playerSheet";
import { allyInnateSpend, allySlotSpend, allySpellcastingEntries, settleInnateSpend, settleSlotSpend, slotPoolFor, slotsLeftAt } from "./spells";
import { allyStatBlock } from "./statBlock";

const slot = (level: number, max: number, used = 0, over: Partial<SpellSlotEntry> = {}): SpellSlotEntry => ({ level, max, used, ...over });

const classRow = (id: string, name: string, definitionId: string): CharacterClass =>
  ({ id, party_member_id: "pm-1", class_name: name, class_definition_id: definitionId, class_definition_kind: "system", subclass_name: null, subclass_definition_id: null, subclass_variant: null, levels: 5, is_primary: true, hit_dice_used: 0, sort_order: 0, capabilities: [] }) as unknown as CharacterClass;

const WIZARD = classRow("cls-wiz", "Wizard", "def-wiz");
const SORCERER = classRow("cls-sor", "Sorcerer", "def-sor");
const CLERIC = classRow("cls-cle", "Cleric", "def-cle");
const DEFINITIONS = {
  system: [
    { id: "def-wiz", caster_type: "prepared" as const, prepared_ability: "int" as const },
    { id: "def-sor", caster_type: "known" as const, prepared_ability: "cha" as const },
    { id: "def-cle", caster_type: "prepared" as const, prepared_ability: "wis" as const },
    // A Monk keeps the ability its definition names (a Wisdom DC) but casts nothing.
    { id: "def-monk", caster_type: "none" as const, primary_ability: "Wisdom" },
  ],
  custom: [], subclasses: [],
};
const MONK = classRow("cls-monk", "Monk", "def-monk");

const grant = (name: string, level: number, over: Partial<AllySpellRow> = {}): AllySpellRow => ({
  id: `${name}-row`, party_member_id: "pm-1", name, level, is_known: true, is_prepared: true, always_prepared: false, source_type: "class", source_class_id: "cls-wiz", casting_ability: null, uses_per_day: null, uses_remaining: null, ...over,
});

/** Mira: level 5, proficiency +3, Intelligence 16 (+3), Wisdom 14 (+2), Charisma 18 (+4): Wizard DC 14 / +6, Cleric DC 13 / +5, Sorcerer DC 15 / +7. */
function sheets(over: { spells?: AllySpellRow[]; classes?: CharacterClass[]; slots?: SpellSlotEntry[]; member?: Partial<PlayerSheetRow> } = {}): PlayerSheets {
  return {
    members: [{
      id: "pm-1", ruleset: "2014", class: "Wizard", subclass: null, ac_formula: null, class_choices: {},
      str: 8, dex: 14, con: 12, int: 16, wis: 14, cha: 18, proficiency_bonus: 3, saving_throw_proficiencies: [], speed: 30, level: 5, custom_attacks: [],
      spell_slots: over.slots ?? [slot(1, 4), slot(2, 3), slot(3, 2)], wildshape_state: null, ...over.member,
    }],
    inventory: [], items: [], beasts: [],
    casting: { spells: over.spells ?? [], classes: over.classes ?? [WIZARD], definitions: DEFINITIONS },
  };
}

const mira = (over: Partial<RunCombatant> = {}): RunCombatant => ({
  instance_id: "mira", type: "player", name: "Mira", faction_id: "p", initiative: null, hp: 30, max_hp: 30, ac: "12", conditions: [], curses: [],
  death_saves: { successes: 0, failures: 0 }, dex_mod: 2, position: { x: 0, y: 0 }, size: "medium", ...over,
});
const castable = (s: PlayerSheets, c: RunCombatant = mira()) => {
  const block = allyStatBlock(s, "pm-1", c.action_uses) as MonsterStatBlock;
  return castableNow(block, c, [fireBolt(), fireball()], "2014");
};
const offered = (s: PlayerSheets, c?: RunCombatant) => castable(s, c).map((i) => `${i.spell}@${i.castLevel}`);

describe("an ally's spells", () => {
  // SRD 5.1 "Spellcasting": a cantrip is cast at will. Bug caught: a cantrip tallied against a slot (so a wizard with no slots left cast nothing).
  // The attack bonus is proficiency + Intelligence modifier = 3 + 3 = +6 (PHB 2014 ch. 10 "Spell Attack Modifier").
  it("offers a ready cantrip with no slot and the sheet's spell attack bonus", () => {
    const now = castable(sheets({ spells: [grant("Fire Bolt", 0)], slots: [] }));
    expect(now).toHaveLength(1);
    expect(now[0]).toMatchObject({ spell: "Fire Bolt", castLevel: 0, useKey: null, limit: null, kind: "attack" });
    expect(now[0].entry.structured).toMatchObject({ attack: { bonus: 6 } });
  });

  // PHB 2014 "Spell Save DC": 8 + proficiency + ability modifier = 8 + 3 + 3 = 14. Bug caught: a DC taken from another ability or class.
  it("offers a prepared leveled spell with the save DC of its class, and the slots the sheet holds", () => {
    const now = castable(sheets({ spells: [grant("Fireball", 3)] }));
    expect(now).toHaveLength(1);
    expect(now[0]).toMatchObject({ spell: "Fireball", castLevel: 3, useKey: "slots/3", limit: { per_day: 2 }, kind: "save" });
    expect(now[0].entry.structured).toMatchObject({ save: { dc: 14 } });
  });

  // Bug caught: a spell with every slot spent still offered (the ally cast on credit). Only the cantrip is left.
  it("does not offer a leveled spell with no slot of its level or higher left", () => {
    const spent = sheets({ spells: [grant("Fire Bolt", 0), grant("Fireball", 3)], slots: [slot(1, 4), slot(2, 3), slot(3, 2, 2)] });
    expect(offered(spent)).toEqual(["Fire Bolt@0"]);
  });

  // PHB 2014 "Spell Slots": a higher slot casts a lower spell. The 3rd-level slots are spent and a 4th remains: Fireball at 4th.
  it("casts a spell with a higher slot when its own level is spent", () => {
    const s = sheets({ spells: [grant("Fireball", 3)], slots: [slot(3, 2, 2), slot(4, 1)] });
    expect(castable(s)).toMatchObject([{ spell: "Fireball", castLevel: 4, useKey: "slots/4", limit: { per_day: 1 } }]);
  });

  // PHB 2014 "Preparing and Casting Spells": a prepared caster casts what is prepared. Bug caught: every spell on the sheet offered.
  it("does not offer a spell a prepared caster has not prepared, but does one that is always prepared", () => {
    expect(offered(sheets({ spells: [grant("Fireball", 3, { is_prepared: false })] }))).toEqual([]);
    expect(offered(sheets({ spells: [grant("Fireball", 3, { is_prepared: false, always_prepared: true })] }))).toEqual(["Fireball@3"]);
  });

  // PHB 2014 "Spells Known and Prepared": a known-spells caster (a Sorcerer) casts what they know, with no preparing.
  // Bug caught: the prepared rule applied to a known caster, so a sorcerer cast nothing. Charisma 18: DC 8 + 3 + 4 = 15.
  it("offers every spell a known-spells caster knows", () => {
    const s = sheets({ classes: [SORCERER], spells: [grant("Fireball", 3, { is_prepared: false, source_class_id: "cls-sor" })] });
    expect(castable(s)).toHaveLength(1);
    expect(castable(s)[0].entry.structured).toMatchObject({ save: { dc: 15 } });
  });

  // Bug caught: the slot count taken as the sheet's alone, so a cast the fight already tallied and the sheet already took
  // counted twice (two slots left became one). The sheet holds 2 of 3 (one spent and written), the fight tallies that 1.
  it("counts the casts the fight already tallied once, not again", () => {
    const s = sheets({ spells: [grant("Fireball", 3)], slots: [slot(3, 3, 1)] });
    const tallied = mira({ action_uses: { "slots/3": { used: 1, per_day: 2 } } });
    const [now] = castable(s, tallied);
    expect(now.limit).toEqual({ per_day: 3 });
    expect(limitAvailability(tallied, now.useKey as string, now.limit as NonNullable<typeof now.limit>)).toMatchObject({ available: true, label: "2/3 left" });
  });

  // PHB 2014 "Multiclassing: Spellcasting": each class casts off its own ability. Bug caught: every spell using the first class's DC.
  it("uses the save DC of the class each spell comes from", () => {
    const s = sheets({ classes: [WIZARD, CLERIC], spells: [grant("Fireball", 3), grant("Fire Bolt", 0, { source_class_id: "cls-cle" })] });
    const entries = allySpellcastingEntries(s, "pm-1", undefined);
    const dcs = spellcastingOf({ special_abilities: entries } as unknown as MonsterStatBlock).map((e) => e.prose.saveDc);
    expect(dcs.sort()).toEqual([13, 14]);
  });

  // PHB 2014 "Wild Shape": the form keeps no spellcasting. Bug caught: a Wild Shaped ally still casting from its sheet.
  it("gives a Wild Shaped ally's form no spells", () => {
    const form = { monster_id: "m-bear", beast_name: "Bear", beast_image_url: null, beast_hp: 34, beast_max_hp: 34, beast_ac: "11", beast_dex: 10 } as PlayerSheetRow["wildshape_state"];
    const s = { ...sheets({ spells: [grant("Fire Bolt", 0)], member: { wildshape_state: form } }), beasts: [{ id: "m-bear", stat_block: { str: 19, dex: 10, con: 16, speed: "40 ft." } }] };
    expect(listedSpellNames(allyStatBlock(s, "pm-1") as MonsterStatBlock)).toEqual([]);
  });

  // The prose cannot carry a name with a comma or a bracket (it would split into two spells or lose its tail), so such a spell is left out, not mangled.
  it("leaves out a spell whose name the Spellcasting prose cannot carry", () => {
    const s = sheets({ spells: [grant("Fire Bolt", 0), grant("Strange, Odd (Spell)", 1)] });
    expect(listedSpellNames(allyStatBlock(s, "pm-1") as MonsterStatBlock)).toEqual(["fire bolt"]);
  });

  // An innate cantrip (a racial one) is cast off its own ability (Charisma 18: 3 + 4 = +7).
  it("offers an at-will innate spell with its own ability", () => {
    const racial = grant("Fire Bolt", 0, { source_type: "racial", source_class_id: null, casting_ability: "cha" });
    expect(castable(sheets({ classes: [], spells: [racial] }))[0].entry.structured).toMatchObject({ attack: { bonus: 7 } });
  });

  // Bug caught: a class that casts nothing (a Monk, who has a Wisdom DC for its features) casting the spells on its sheet.
  it("offers nothing to a class that does not cast", () => {
    expect(offered(sheets({ classes: [MONK], spells: [grant("Fire Bolt", 0, { source_class_id: "cls-monk" })] }))).toEqual([]);
  });

  it("gives a member with nothing ready no Spellcasting entry at all", () => {
    expect(allyStatBlock(sheets(), "pm-1")?.special_abilities).toBeUndefined();
    expect(allyStatBlock({ ...sheets(), casting: NO_CASTING }, "pm-1")?.special_abilities).toBeUndefined();
  });
});

describe("an ally's innate spells with a daily limit", () => {
  const fireballRacial = (over: Partial<AllySpellRow> = {}) => grant("Fireball", 3, { source_type: "racial", source_class_id: null, casting_ability: "cha", uses_per_day: 2, uses_remaining: 2, ...over });
  const innate = (spells: AllySpellRow[], c?: RunCombatant) => castable(sheets({ classes: [], spells, slots: [] }), c);

  // SRD 5.1 "Innate Spellcasting": "N/day" is N casts of that spell. Charisma 18, proficiency +3: DC 15. Bug caught: a daily spell left out
  // (the old behaviour), or cast against a slot line (limit keyed `slots/3` instead of the spell's own tally).
  it("offers a daily innate spell while uses remain, tallied under its own key at the sheet's DC", () => {
    const [now] = innate([fireballRacial()]);
    expect(now).toMatchObject({ spell: "Fireball", castLevel: 3, useKey: "spell/fireball", limit: { per_day: 2 }, kind: "save" });
    expect(now.entry.structured).toMatchObject({ save: { dc: 15 } });
  });

  // Bug caught: a spent daily spell still offered. `uses_remaining` null reads as none left, as the Spells tab reads it.
  it("does not offer one with no use left, or with its remaining count unset", () => {
    expect(innate([fireballRacial({ uses_remaining: 0 })])).toEqual([]);
    expect(innate([fireballRacial({ uses_remaining: null })])).toEqual([]);
    // Not even listed on the block: a "0/day" line is no line.
    expect(allySpellcastingEntries(sheets({ classes: [], spells: [fireballRacial({ uses_remaining: 0 })], slots: [] }), "pm-1", undefined)).toEqual([]);
  });

  // Bug caught: the fight's tally subtracted from a sheet that already shows the cast (one of two used and written: 1 on the sheet, 1 tallied
  // is two casts in all, not one), or a last use that the sheet already wrote read as gone.
  it("counts a cast the sheet already took and the fight tallied once", () => {
    const tallied = mira({ action_uses: { "spell/fireball": { used: 1, per_day: 2 } } });
    const [now] = innate([fireballRacial({ uses_remaining: 1 })], tallied);
    expect(now.limit).toEqual({ per_day: 2 });
    expect(limitAvailability(tallied, now.useKey as string, now.limit as NonNullable<typeof now.limit>)).toMatchObject({ available: true, label: "1/2 left" });
    // And with the last use written and tallied, none is left.
    const done = mira({ action_uses: { "spell/fireball": { used: 2, per_day: 2 } } });
    expect(innate([fireballRacial({ uses_remaining: 0 })], done)).toEqual([]);
  });

  // Bug caught: the daily line taking a slot-line shape, so the prose reader would give the spell a slot tally.
  it("writes the line the monster pipeline reads as N per day each", () => {
    const [entry] = allySpellcastingEntries(sheets({ classes: [], spells: [fireballRacial()], slots: [] }), "pm-1", undefined);
    const [group] = spellcastingOf({ special_abilities: [entry] } as unknown as MonsterStatBlock)[0].prose.groups;
    expect(group.frequency).toEqual({ kind: "per_day", count: 2, each: true });
  });

  // Bug caught: a class spell with a `uses_per_day` (never set by the app) read as innate and limited, or an at-will innate leveled spell given a daily count.
  it("leaves an at-will innate spell unlimited", () => {
    const [now] = castable(sheets({ classes: [], slots: [], spells: [grant("Fireball", 3, { source_type: "racial", source_class_id: null, casting_ability: "cha" })] }));
    expect(now).toMatchObject({ spell: "Fireball", useKey: null, limit: null });
  });
});

describe("allyInnateSpend", () => {
  const racial = (over: Partial<AllySpellRow> = {}) => grant("Misty Step", 2, { source_type: "racial", source_class_id: null, casting_ability: "cha", uses_per_day: 1, uses_remaining: 1, ...over });

  // Bug caught: the cast writing nothing, or writing the count before the cast (the same number back).
  it("says the count left after one cast, and lets a second cast find it", () => {
    const s = sheets({ classes: [], spells: [racial({ uses_per_day: 3, uses_remaining: 3 })] });
    const first = allyInnateSpend(s, "pm-1", "Misty Step");
    expect(first).toEqual({ memberId: "pm-1", spellRowId: "Misty Step-row", remaining: 2 });
    settleInnateSpend(s, first as NonNullable<typeof first>);
    expect(allyInnateSpend(s, "pm-1", "Misty Step")).toMatchObject({ remaining: 1 });
  });

  // Bug caught: a spent grant "spent" again into a negative count; a class spell (slots, not uses) or an at-will grant written to.
  it("writes nothing for a grant with no use left, an at-will grant or a class spell", () => {
    expect(allyInnateSpend(sheets({ classes: [], spells: [racial({ uses_remaining: 0 })] }), "pm-1", "Misty Step")).toBeNull();
    expect(allyInnateSpend(sheets({ classes: [], spells: [racial({ uses_per_day: null, uses_remaining: null })] }), "pm-1", "Misty Step")).toBeNull();
    expect(allyInnateSpend(sheets({ spells: [grant("Misty Step", 2)] }), "pm-1", "Misty Step")).toBeNull();
    // A class spell never spends uses, whatever its row says (the app does not set a daily limit on one).
    expect(allyInnateSpend(sheets({ spells: [grant("Misty Step", 2, { uses_per_day: 1, uses_remaining: 1 })] }), "pm-1", "Misty Step")).toBeNull();
  });

  // Bug caught: another member's grant of the same name spent.
  it("spends the named member's own grant", () => {
    expect(allyInnateSpend(sheets({ classes: [], spells: [racial()] }), "pm-other", "Misty Step")).toBeNull();
  });
});

describe("Pact Magic slots", () => {
  const WARLOCK = classRow("cls-wl", "Warlock", "def-wl");
  const pactSlots = (over: Partial<SpellSlotEntry> = {}) => slot(2, 2, 0, { pool: "pact", recovery: "short", ...over });
  const withPact = (slots: SpellSlotEntry[], spells: AllySpellRow[] = []) => {
    const s = sheets({ classes: [WIZARD, WARLOCK], slots, spells });
    s.casting.definitions.system.push({ id: "def-wl", caster_type: "known" as const, prepared_ability: "cha" as const });
    return s;
  };

  // PHB 2014 "Multiclassing: Pact Magic": slots of either kind cast spells of either kind, so both count at their level.
  // Bug caught: the pact pool left out of the count (a Warlock/Wizard seeing only half its slots).
  it("counts pact slots with the spellcasting slots at their level", () => {
    expect(slotsLeftAt([slot(2, 3), pactSlots()], 2)).toBe(5);
  });

  // The Warlock's spell spends the short-rest slot first, the Wizard's the spellcasting slot; the other pool is the fallback.
  // Bug caught: the first unspent slot at the level spent whichever pool it came from (a Wizard spell eating the Warlock's short-rest slot).
  it("spends the pool of the spell's own class first", () => {
    const slots = [pactSlots(), slot(2, 3)];
    const s = withPact(slots, [grant("Fireball", 3), grant("Hex", 1, { source_class_id: "cls-wl" })]);
    expect(slotPoolFor(s, "pm-1", "Fireball")).toBe("spellcasting");
    expect(slotPoolFor(s, "pm-1", "Hex")).toBe("pact");
    expect(allySlotSpend(s, "pm-1", 2, "spellcasting")).toEqual([pactSlots(), slot(2, 3, 1)]);
    expect(allySlotSpend(s, "pm-1", 2, "pact")).toEqual([pactSlots({ used: 1 }), slot(2, 3)]);
  });

  // PHB 2014 "Multiclassing: Pact Magic": either pool may cast either kind of spell, so an empty preferred pool falls back to the other.
  // Bug caught: a Warlock spell with no pact slot left (spent) cast for free instead of from the Spellcasting slots, or refused.
  it("falls back to the other pool when the preferred one has none at the level", () => {
    const s = withPact([pactSlots({ used: 2 }), slot(2, 3)]);
    expect(allySlotSpend(s, "pm-1", 2, "pact")).toEqual([pactSlots({ used: 2 }), slot(2, 3, 1)]);
  });

  // A custom class that recovers its slots on a short rest is a pact class too.
  it("reads a custom class with short-rest slots as a pact class", () => {
    const custom = { ...classRow("cls-cu", "Hexblade", "def-cu"), class_definition_kind: "custom" as const };
    const s = sheets({ classes: [custom], spells: [grant("Hex", 1, { source_class_id: "cls-cu" })] });
    s.casting.definitions.custom.push({ id: "def-cu", caster_type: "known" as const, prepared_ability: "cha" as const, slot_recovery: "short" as const });
    expect(slotPoolFor(s, "pm-1", "Hex")).toBe("pact");
  });
});

describe("allySlotSpend", () => {
  // Bug caught: a cast writing nothing (the slot never spent) or spending the wrong level. The first unspent 2nd-level slot is marked used.
  it("marks the first unspent slot of the level used and leaves the rest alone", () => {
    const s = sheets({ slots: [slot(1, 4), slot(2, 3, 3), slot(2, 1, 0, { pool: "pact" }), slot(3, 2)] });
    expect(allySlotSpend(s, "pm-1", 2)).toEqual([slot(1, 4), slot(2, 3, 3), slot(2, 1, 1, { pool: "pact" }), slot(3, 2)]);
  });

  it("spends nothing for a cantrip or a level with no unspent slot", () => {
    const s = sheets({ slots: [slot(1, 4), slot(3, 2, 2)] });
    expect(allySlotSpend(s, "pm-1", 0)).toBeNull();
    expect(allySlotSpend(s, "pm-1", 3)).toBeNull();
  });

  // Bug caught: two casts in one request both writing "one fewer than it began with".
  it("lets a second cast find the slot the first left", () => {
    const s = sheets({ slots: [slot(3, 2)] });
    const first = allySlotSpend(s, "pm-1", 3) as SpellSlotEntry[];
    settleSlotSpend(s, "pm-1", first);
    expect(allySlotSpend(s, "pm-1", 3)).toEqual([slot(3, 2, 2)]);
    expect(slotsLeftAt(s.members[0].spell_slots, 3)).toBe(1);
  });
});
