// The spells a party member the AI plays (an ally, #1021) can cast now, written as the Spellcasting entry of their stat
// block so the monster pipeline (`castableNow`, the spell options, `cast_spell`) casts them unchanged: it reads the
// entry's prose, so the prose is built here in the exact shape `parseSpellcasting` reads and one test holds the two
// together. The sheet stays the truth: the entry is rebuilt from it every turn, and what a cast spends is written back
// to it (`allySlotSpend`).
// Pure and edge-importable (relative `.ts` imports only).
//
// RULE spellcasting (PHB 2014 ch. 10 "Spellcasting"; SRD 5.1 "Casting a Spell"): a cantrip is cast at will; a spell of 1st level
// or higher is cast with a slot of its level or higher; a prepared caster casts what they have prepared (always-prepared
// spells included), a known-spells caster what they know. The save DC is 8 + proficiency bonus + spellcasting ability modifier and the
// spell attack bonus is proficiency bonus + that modifier: `computeSpellcastingByClass` and `grantSaveDc`/`grantAttackBonus` work
// them out for the sheet, and this file only asks them.
// APP CONVENTION: a slot is tallied per level (`slots/<level>`, as for a monster). The line's slot count is what the sheet holds plus
// what the fight's tally already counts as used, so a cast that was already written to the sheet is not counted twice and a rest
// the sheet took meanwhile gives the slots back. Innate spells with a daily limit and Pact Magic's shared level are not offered yet. A spell that heals (Cure
// Wounds, Healing Word) is cast by `healableNow` and `cast_spell` like a monster's, adding the modifier of the casting ability the entry names.

import type { SpellSlotEntry } from "../../../types/party.types.ts";
import type { StatBlockEntry } from "../../../types/statBlock.types.ts";
import { ordinal } from "../../../lib/ordinal.ts";
import { proficiencyBonusOf } from "../../proficiencyBonus.ts";
import { computeSpellcastingByClass } from "../../spellcastingByClass.ts";
import { grantAttackBonus, grantSaveDc } from "../../spellGrantStats.ts";
import { pickSpellcastingStats } from "../../../types/multiclass.types.ts";
import { getCasterCategory } from "../../../types/spell.types.ts";
import { spellKey } from "../spells/castLimit.ts";
import type { AllySpellRow, PlayerSheetRow, PlayerSheets } from "../playerSheet.ts";

const ABILITY_NAMES = { int: "Intelligence", wis: "Wisdom", cha: "Charisma" } as const;

/** The tally of a creature's casts in a fight (`RunCombatant.action_uses`): only the slot counts are read. */
export type CastTally = Record<string, { used: number }> | undefined;

/** A spell's name as the prose lists it, or null for one the prose cannot carry (a comma, a bracket or a colon would split or mislabel it). */
function listable(name: string): string | null {
  const trimmed = name.replace(/\s+/g, " ").trim();
  return trimmed === "" || /[,():\n]/.test(trimmed) ? null : trimmed.toLowerCase();
}

/** The slots the sheet holds at one level, whatever pool they come from, still unspent. */
export function slotsLeftAt(slots: readonly SpellSlotEntry[], level: number): number {
  return slots.filter((s) => s.level === level).reduce((sum, s) => sum + Math.max(0, s.max - s.used), 0);
}

interface Ready {
  row: AllySpellRow;
  /** Casts left today for an innate spell with a daily limit (the sheet's count plus what the fight tallied); null for any other spell. */
  perDay: number | null;
  saveDc: number;
  attackBonus: number;
  ability: "int" | "wis" | "cha" | null;
  source: string;
}

/**
 * The spells this member can cast from what the sheet holds: class spells that are prepared, always prepared or known by a
 * known-spells caster (a cantrip is always ready), and innate spells with no daily limit. Each carries the save DC and the attack
 * bonus of the class it comes from (or its own casting ability), from the sheet's shared rules.
 */
function readySpells(sheets: PlayerSheets, member: PlayerSheetRow, tally: CastTally): Ready[] {
  const classes = sheets.casting.classes.filter((c) => c.party_member_id === member.id);
  const caster = { ...member, proficiency_bonus: proficiencyBonusOf(member) };
  const stats = computeSpellcastingByClass(caster, classes, sheets.casting.definitions, member.ruleset);
  const ready: Ready[] = [];
  for (const row of sheets.casting.spells) {
    if (row.party_member_id !== member.id || listable(row.name) === null) continue;
    const classStats = row.source_type === "class" ? pickSpellcastingStats(stats, row.source_class_id) : null;
    if (row.source_type === "class") {
      if (classStats === null || classStats.casterType === "none") continue;
      if (!(classStats.casterType === "known" || row.is_prepared || row.always_prepared || row.level === 0)) continue;
    }
    // RULE innate-uses (the sheet's own: `uses_remaining` null reads as none left, as the Spells tab and the cast function read it).
    let perDay: number | null = null;
    if (row.source_type !== "class" && row.uses_per_day !== null) {
      perDay = (row.uses_remaining === null ? 0 : row.uses_remaining) + (tally?.[`spell/${spellKey(row.name)}`]?.used ?? 0);
      if (perDay <= 0) continue;
    }
    const saveDc = grantSaveDc(row, caster, classStats, null);
    const attackBonus = grantAttackBonus(row, caster, classStats, null);
    if (saveDc === null || attackBonus === null) continue;
    ready.push({ row, perDay, saveDc, attackBonus, ability: row.casting_ability ?? classStats?.castingAbility ?? null, source: classStats === null ? "Innate" : classStats.className });
  }
  return ready;
}

/**
 * The Spellcasting entries of this member's block: one per source (a class, or innate) and pair of numbers, so a multiclass
 * caster's Wizard spells use the Wizard's DC and their Cleric spells the Cleric's. Empty for a member with nothing ready.
 * `tally` is the fight's own count of casts (see the APP CONVENTION above).
 */
export function allySpellcastingEntries(sheets: PlayerSheets, memberId: string, tally: CastTally): StatBlockEntry[] {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined) return [];
  const slots = member.spell_slots;
  const slotsAt = (level: number) => slotsLeftAt(slots, level) + (tally?.[`slots/${level}`]?.used ?? 0);
  const groups = new Map<string, Ready[]>();
  for (const ready of readySpells(sheets, member, tally)) {
    const key = `${ready.source}|${ready.saveDc}|${ready.attackBonus}`;
    groups.set(key, [...(groups.get(key) ?? []), ready]);
  }
  const entries: StatBlockEntry[] = [];
  for (const spells of groups.values()) {
    const first = spells[0];
    const lines: string[] = [];
    const names = (rows: Ready[]) => [...new Set(rows.map((r) => listable(r.row.name) as string))].join(", ");
    const atWill = spells.filter((r) => r.perDay === null && (r.row.level === 0 || r.row.source_type !== "class"));
    const cantrips = atWill.filter((r) => r.row.level === 0);
    if (cantrips.length > 0) lines.push(`Cantrips (at will): ${names(cantrips)}`);
    const innate = atWill.filter((r) => r.row.level > 0);
    if (innate.length > 0) lines.push(`At will: ${names(innate)}`);
    // One line per count: "2/day each: misty step" is two casts of that spell, whatever else is listed.
    const counts = [...new Set(spells.flatMap((r) => r.perDay ?? []))].sort((a, b) => a - b);
    for (const count of counts) lines.push(`${count}/day each: ${names(spells.filter((r) => r.perDay === count))}`);
    for (let level = 1; level <= 9; level++) {
      const here = spells.filter((r) => r.row.level === level && r.row.source_type === "class");
      const count = slotsAt(level);
      // A level with slots but no spell of its own is still written, for a lower spell to be cast with it.
      if (here.length === 0 && count === 0) continue;
      lines.push(`${ordinal(level)} level (${count} ${count === 1 ? "slot" : "slots"}): ${names(here)}`);
    }
    const ability = first.ability === null ? "" : ` Its spellcasting ability is ${ABILITY_NAMES[first.ability]} (spell save DC ${first.saveDc}, +${first.attackBonus} to hit with spell attacks).`;
    entries.push({
      name: `Spellcasting (${first.source})`,
      description: `The character is a ${ordinal(member.level)}-level spellcaster.${ability}\n\n${lines.join("\n")}`,
      structured: { kind: "other", source: "parsed" },
    });
  }
  return entries;
}

export type SlotPool = "pact" | "spellcasting";

const poolOf = (slot: SpellSlotEntry): SlotPool => (slot.pool === "pact" ? "pact" : "spellcasting");

/**
 * The pool a cast of `spellName` spends first: Pact Magic's when the spell comes from a Pact Magic class (a Warlock, or a custom class
 * that recovers its slots on a short rest), Spellcasting's otherwise. Only the order of preference: PHB 2014 "Multiclassing: Pact Magic"
 * lets either kind of slot cast either kind of spell, so `allySlotSpend` falls back to the other pool when the preferred one has none.
 * APP CONVENTION: the Warlock's spell spends the short-rest slot, which comes back soonest.
 */
export function slotPoolFor(sheets: PlayerSheets, memberId: string, spellName: string): SlotPool {
  const wanted = spellKey(spellName);
  const row = sheets.casting.spells.find((r) => r.party_member_id === memberId && r.source_type === "class" && spellKey(r.name) === wanted);
  const source = row === undefined ? undefined : sheets.casting.classes.find((c) => c.party_member_id === memberId && c.id === row.source_class_id);
  if (source === undefined) return "spellcasting";
  if (source.class_definition_kind === "system") return getCasterCategory(source.class_name) === "pact" ? "pact" : "spellcasting";
  const definition = sheets.casting.definitions.custom.find((d) => d.id === source.class_definition_id);
  return definition !== undefined && definition.slot_recovery === "short" ? "pact" : "spellcasting";
}

/**
 * The sheet's slots after a cast at `level`: the first unspent slot of that level in the `prefer` pool, else in the other, is marked
 * used. Null for a cantrip (level 0, which has no slots) and for a level the sheet holds no unspent slot at (the cast was offered from
 * the fight's own tally; nothing to write then).
 */
export function allySlotSpend(sheets: PlayerSheets, memberId: string, level: number, prefer: SlotPool = "spellcasting"): SpellSlotEntry[] | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined) return null;
  const open = member.spell_slots.flatMap((s, i) => (s.level === level && s.used < s.max ? [i] : []));
  const at = open.find((i) => poolOf(member.spell_slots[i]) === prefer) ?? open[0] ?? -1;
  if (at === -1) return null;
  return member.spell_slots.map((s, i) => (i === at ? { ...s, used: s.used + 1 } : s));
}

/** `allySlotSpend`'s write, kept in the sheet in memory so a second cast in the same request finds the slot the first left. */
export function settleSlotSpend(sheets: PlayerSheets, memberId: string, slots: SpellSlotEntry[]): void {
  const at = sheets.members.findIndex((m) => m.id === memberId);
  if (at !== -1) sheets.members[at] = { ...sheets.members[at], spell_slots: slots };
}

/** What a cast of a daily-limited innate spell writes: the grant's row and the uses it has left. */
export interface InnateSpend {
  memberId: string;
  spellRowId: string;
  remaining: number;
}

/**
 * The uses left on the sheet after an innate spell with a daily limit is cast once, or null when the member has no such grant with a use
 * left (the cast was offered from the fight's own tally; nothing to write then).
 */
export function allyInnateSpend(sheets: PlayerSheets, memberId: string, spellName: string): InnateSpend | null {
  const wanted = spellKey(spellName);
  const row = sheets.casting.spells.find((r) => r.party_member_id === memberId && r.source_type !== "class" && r.uses_per_day !== null && r.uses_remaining !== null && r.uses_remaining > 0 && spellKey(r.name) === wanted);
  return row === undefined || row.uses_remaining === null ? null : { memberId, spellRowId: row.id, remaining: row.uses_remaining - 1 };
}

/** `allyInnateSpend`'s write, kept in the sheet in memory so a second cast in the same request finds the use the first left. */
export function settleInnateSpend(sheets: PlayerSheets, spend: InnateSpend): void {
  sheets.casting.spells = sheets.casting.spells.map((r) => (r.id === spend.spellRowId ? { ...r, uses_remaining: spend.remaining } : r));
}
