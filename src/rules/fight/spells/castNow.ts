// The damage spells a creature could cast on its turn right now (#1021, row 5b step B): every spell its stat block lists
// that has a cast left and a record the rules can roll, one item per sensible slot. The tactics engine turns these into
// turn options and `cast_spell` carries one out; nothing is chosen or resolved here.
// Pure and edge-importable (relative `.ts` imports only).
//
// APP CONVENTION for the slot: a slot spell is offered at its own level; when that level's slots are spent, at the
// lowest higher level that still has one (SRD 5.1 "Spellcasting": a spell is cast with a slot of its level or higher).
// Never both at once: a creature that has a slot of the right level does not spend a bigger one.

import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { StatBlockEntry } from "../../../types/statBlock.types.ts";
import { limitAvailability, type ActionLimit } from "../../encounterTurn.ts";
import { spellcastingOf } from "../../statBlock/spellcastingProse.ts";
import { abilityMod } from "../../abilityScore.ts";
import { castableBy, slotLimitAt, type Castable } from "./castLimit.ts";
import { pickSpellRecord, type SpellRecord } from "./spellChoice.ts";
import { kindLimitOf } from "./creatureKind.ts";
import { healEntryFor, isHealingSpell, type HealPlan } from "./healEntry.ts";
import { spellEntryFor } from "./spellEntry.ts";

/** The area a spell covers, from the record's `aoe_shape` and the first number of its `aoe_size`. */
export interface SpellArea {
  shape: string;
  feet: number;
}

export interface CastNow {
  /** The record's name, which is the printed name in any letter case (`pickSpellRecord` matches by key): what `cast_spell` names the spell by. */
  spell: string;
  record: SpellRecord;
  castLevel: number;
  /** Where the cast is tallied; null for a spell with no limit (a cantrip, at will). */
  useKey: string | null;
  limit: ActionLimit | null;
  kind: "attack" | "save";
  /** The cast as a stat-block entry, in the shape the existing numbers code reads. */
  entry: StatBlockEntry;
  /** Null for a single-target spell, and for a record whose shape has a size that cannot be read (treated as single target, never guessed). */
  area: SpellArea | null;
  /** The creature kinds the spell's condition is limited to, or null for a spell with no such limit: targeting offers it only at those. */
  kindLimit: readonly string[] | null;
}

/** The names of every spell the stat block lists, once each: what a turn needs the records of. Empty for a creature that does not cast. */
export function listedSpellNames(statBlock: MonsterStatBlock): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const { prose } of spellcastingOf(statBlock)) {
    for (const group of prose.groups) {
      for (const spell of group.spells) {
        if (seen.has(spell.key)) continue;
        seen.add(spell.key);
        names.push(spell.name);
      }
    }
  }
  return names;
}

/** The first number of an area's size ("20 feet", "20 ft. radius", "15-foot cube"), or null when there is none. */
export function areaFeetOf(size: string | null): number | null {
  if (size === null) return null;
  const found = /\d+(?:\.\d+)?/.exec(size);
  if (found === null) return null;
  const feet = Number(found[0]);
  return feet > 0 ? feet : null;
}

function areaOf(record: SpellRecord): SpellArea | null {
  if (record.aoe_shape === null || record.aoe_shape.trim() === "") return null;
  const feet = areaFeetOf(record.aoe_size);
  return feet === null ? null : { shape: record.aoe_shape.trim().toLowerCase(), feet };
}

/** The slot a cast of a slot spell would use: its own level, else the lowest higher level with a slot left. Null when every slot it could use is spent. */
function slotFor(statBlock: MonsterStatBlock, combatant: RunCombatant, level: number, own: { useKey: string; limit: ActionLimit }): { level: number; useKey: string; limit: ActionLimit } | null {
  if (limitAvailability(combatant, own.useKey, own.limit).available) return { level, ...own };
  for (let higher = level + 1; higher <= 9; higher++) {
    const slots = slotLimitAt(statBlock, higher);
    if (slots !== null && limitAvailability(combatant, slots.useKey, slots.limit).available) return { level: higher, ...slots };
  }
  return null;
}

/** The slot (or use) a cast of `record` would spend and the level it is cast at, or null when the creature has none left. Mirrors `cast_spell`: a slot spell is cast at the level its group lists (or a higher slot), anything else at the spell's own level (0 for a cantrip). */
function castingSlot(statBlock: MonsterStatBlock, combatant: RunCombatant, listed: Castable, record: SpellRecord): { castLevel: number; useKey: string | null; limit: ActionLimit | null } | null {
  const slotted = listed.limit !== null && listed.level !== null && listed.level > 0 && listed.group.frequency.kind === "slots";
  if (slotted && listed.useKey !== null && listed.limit !== null && listed.level !== null) {
    const slot = slotFor(statBlock, combatant, listed.level, { useKey: listed.useKey, limit: listed.limit });
    return slot === null ? null : { castLevel: slot.level, useKey: slot.useKey, limit: slot.limit };
  }
  if (listed.useKey !== null && listed.limit !== null && !limitAvailability(combatant, listed.useKey, listed.limit).available) return null;
  return { castLevel: listed.level === 0 ? 0 : record.level, useKey: listed.useKey, limit: listed.limit };
}

/**
 * Every listed spell the creature can cast now with a record that has its numbers (a campaign's own, or a reviewed
 * library one) and an entry the fight can roll. A spell with no record, an unreviewed one, one that has no
 * damage (a healing one is `healableNow`'s) and one with no use left is simply absent.
 */
export function castableNow(
  statBlock: MonsterStatBlock,
  combatant: RunCombatant,
  records: readonly SpellRecord[],
  ruleset: RulesetKey,
  /** True when the caller's targeting keeps a kind-limited spell off the wrong creatures (`spellTargetings` with `kindOf`): such a spell is then castable. */
  options: { kindsChecked?: boolean } = {},
): CastNow[] {
  const out: CastNow[] = [];
  for (const name of listedSpellNames(statBlock)) {
    const listed = castableBy(statBlock, name);
    if (listed === null) continue;
    const chosen = pickSpellRecord(name, records, ruleset);
    if (chosen === null || !chosen.automatable) continue;
    const { record } = chosen;

    const slot = castingSlot(statBlock, combatant, listed, record);
    if (slot === null) continue;
    const { castLevel, useKey, limit } = slot;

    const entry = spellEntryFor(record, castLevel, { saveDc: listed.saveDc, attackBonus: listed.attackBonus, casterLevel: listed.casterLevel }, { kindsChecked: options.kindsChecked === true });
    if (!entry.automatable) continue;
    out.push({ spell: record.name, record, castLevel, useKey, limit, kind: entry.kind, entry: entry.entry, area: areaOf(record), kindLimit: kindLimitOf(record) });
  }
  return out;
}

/** A healing spell the creature could cast on its turn right now (#1021): what it restores and what it spends. The tactics offer it at those who need it. */
export interface HealNow {
  /** The record's name: what `cast_spell` names the spell by. */
  spell: string;
  record: SpellRecord;
  castLevel: number;
  useKey: string | null;
  limit: ActionLimit | null;
  plan: HealPlan;
  /** The record's range text ("Touch", "60 feet"): `rangeFeetOf` reads it. */
  range: string;
}

/** The spellcasting modifier a creature adds to its healing: its listed casting ability's score through the one modifier rule, null when the entry names no ability. */
export function spellcastingModifierOf(statBlock: MonsterStatBlock, ability: Castable["ability"]): number | null {
  if (ability === null) return null;
  const score = ability === "INT" ? statBlock.int : ability === "WIS" ? statBlock.wis : statBlock.cha;
  return abilityMod(score);
}

/**
 * Every listed healing spell the creature can cast now with a record the rules can roll (reviewed or its own, a structured
 * healing effect, cast as an Action or a Bonus Action) and a use left, one per sensible slot as `castableNow` does for damage.
 */
export function healableNow(statBlock: MonsterStatBlock, combatant: RunCombatant, records: readonly SpellRecord[], ruleset: RulesetKey): HealNow[] {
  const out: HealNow[] = [];
  for (const name of listedSpellNames(statBlock)) {
    const listed = castableBy(statBlock, name);
    if (listed === null) continue;
    const chosen = pickSpellRecord(name, records, ruleset);
    if (chosen === null || !chosen.automatable || !isHealingSpell(chosen.record)) continue;
    const slot = castingSlot(statBlock, combatant, listed, chosen.record);
    if (slot === null) continue;
    const plan = healEntryFor(chosen.record, slot.castLevel, { modifier: spellcastingModifierOf(statBlock, listed.ability) });
    if (!plan.healable) continue;
    out.push({ spell: chosen.record.name, record: chosen.record, castLevel: slot.castLevel, useKey: slot.useKey, limit: slot.limit, plan, range: chosen.record.range });
  }
  return out;
}
