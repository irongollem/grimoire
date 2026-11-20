// A healing spell turned into what a cast restores (#1021): the dice, the spellcasting modifier, how many creatures, what
// it costs to cast and which creatures it does nothing for. Nothing is rolled here; `cast_spell` rolls it and the tactics
// weigh it. Pure and edge-importable (relative `.ts` imports only).
//
// How a spell's healing is known: the library's structured `effects` (kind "healing": dice, slot scaling, the
// spellcasting ability modifier), the same record the damage rules read. A spell with no such effect (Heal, whose 70 hit
// points are not stored as dice; a campaign's own spell, which has only flat columns) is not automatable and the caller
// says why, never guessing from prose.
//
// RULE healing-amount (PHB 2014 "Cure Wounds": regains 1d8 + your spellcasting ability modifier, +1d8 per slot level above
// 1st; "Healing Word": 1d4 + modifier, +1d4 per level; PHB 2024 "Cure Wounds": 2d8 + modifier, +2d8 per level; "Healing
// Word": 2d4 + modifier, +2d4 per level). The record holds the edition's own dice; `effectsForCast` scales them per slot
// level, the rule the sheet shares.
// RULE healing-undead-constructs (PHB 2014 "Cure Wounds", "Healing Word", "Mass Healing Word", "Prayer of Healing", "Heal",
// "Mass Heal": "This spell has no effect on undead or constructs"; the 2024 Player's Handbook text of the same spells has no
// such sentence). The record says it: the healing effect's `unaffected` list (kinds, lower case; an empty list excludes nobody).
// APP CONVENTION, only for a record that has no such field (an older row, a campaign's own spell): the edition decides, a shared
// 2014 record excludes undead and constructs, a 2024 one excludes nobody, a campaign's own spell is taken at its word (none).
// RULE healing-ends (PHB 2014 "Heal": "Heal also ends blindness, deafness, and any diseases"; PHB 2024 "Heal": ends the Blinded,
// Deafened and Poisoned conditions): the effect's `ends` names them. An app condition is removed; a name the app has no condition
// for ("diseases") is left to the table and the line says so.
// RULE healing-pool (PHB 2014 and 2024 "Mass Heal": "A flood of healing energy flows from you into injured creatures around you.
// You restore up to 700 hit points, divided as you choose among any number of creatures that you can see within range"): the
// effect's `pool`. APP CONVENTION for the sharing (the book leaves the division to the caster): the downed first, then the lowest
// share of their hit points, each to full or to what is left of the pool.
// RULE casting-time (PHB 2014 and 2024 "Healing Word": a Bonus Action; "Cure Wounds": an Action): only a spell cast as an
// Action or a Bonus Action is a heal a fight offers; "1 minute" or "10 minutes" (Prayer of Healing) is not.

import { parseExpression } from "../../../lib/dice/dice.ts";
import type { StructuredSpellEffect } from "../../../types/spell.types.ts";
import { effectsForCast } from "../../spellEffects.ts";
import type { SpellRecord } from "./spellChoice.ts";

export type CastSlot = "action" | "bonus_action";

export interface HealPlan {
  healable: true;
  /** The dice at this cast's slot level ("2d8"), without the modifier. */
  dice: string;
  /** The caster's spellcasting ability modifier when the spell adds it, else 0. */
  modifier: number;
  /** How many creatures one cast restores (1 for a single-target spell, 6 for Mass Healing Word). */
  targetCount: number;
  slot: CastSlot;
  /** Creature kinds the spell does nothing for (lower case). */
  excludes: readonly string[];
  /** What the spell ends in each creature it restores (condition names, and words like "diseases" the app has no condition for). */
  ends: readonly string[];
  /** Hit points the caster divides among the creatures instead of dice (Mass Heal), null for a spell that rolls. `dice` is "" then. */
  pool: number | null;
  /** The mean restored to one creature, for weighing. */
  average: number;
}

export type HealEntry = HealPlan | { healable: false; why: string };

const no = (why: string): HealEntry => ({ healable: false, why });

/** Whether the record heals at all: it holds a structured healing effect. Such a spell is never rolled as damage. */
export function isHealingSpell(record: SpellRecord): boolean {
  return (record.effects ?? []).some((e) => e.kind === "healing");
}

/** What a spell's casting time costs in a fight, or null for one that is not an Action or a Bonus Action (a reaction, minutes, hours, or no time stored). */
export function castSlotOf(record: SpellRecord): CastSlot | null {
  const custom = (record.casting_time_custom ?? "").trim().toLowerCase();
  const time = (record.casting_time ?? "").trim().toLowerCase();
  // The library stores a bonus action as "Special" with the custom text "bonus-action" for most rows, and "Bonus Action" for the rest.
  const said = time === "special" || time === "" ? custom : time;
  if (/^(1 )?bonus[- ]action$/.test(said)) return "bonus_action";
  if (/^(1 )?action$/.test(said)) return "action";
  return null;
}

/** The creature kinds the spell does nothing for (see RULE healing-undead-constructs above): the effect's own list, else the edition's. */
export function healExcludedKinds(record: SpellRecord): readonly string[] {
  const typed = (record.effects ?? []).find((e) => e.kind === "healing")?.unaffected;
  if (typed !== undefined && typed !== null) return typed.map((k) => k.trim().toLowerCase());
  // The fallback for a record without the field: the edition's text.
  return record.ruleset === "2014" && record.own !== true ? ["undead", "construct"] : [];
}

/**
 * A campaign's own spell has no structured effects, only the flat columns (`healing_dice`, `higher_level_healing`): its healing
 * effect is built from them here, once, where the records are read (`fightSpells.ts`). One creature, at the spell's own level and
 * scaling by slot level when the row has a per-level dice. The spellcasting modifier is NOT added: no column of the row says the
 * spell adds it, and the app does not guess it from the text, so a DM's "1d8" heals 1d8. A row with no healing dice, one that also
 * has damage rolls, or one that already has structured effects is returned as it is (not automatable, as before).
 */
export function withFlatHealing(record: SpellRecord, higherLevelHealing: string | null): SpellRecord {
  const dice = (record.healing_dice ?? "").trim();
  if (dice === "" || (record.effects ?? []).length > 0 || (record.damage_rolls ?? []).length > 0) return record;
  const higher = (higherLevelHealing ?? "").trim();
  const effect: StructuredSpellEffect = {
    id: "base", phase: "impact", outcome: "automatic", target: { type: "creature", count: 1 }, kind: "healing", dice,
    multiplier: 1, damageType: null, condition: null, description: null, scaling: higher === "" ? null : { mode: "slot", dice: higher }, modifier: null,
  };
  return { ...record, effects: [effect] };
}

/**
 * The healing of one cast, or the plain reason it is not one. `castLevel` is the slot used (the spell's own level for
 * innate casting). `modifier` is the caster's spellcasting ability modifier, null when the stat block does not say.
 */
export function healEntryFor(record: SpellRecord, castLevel: number, caster: { modifier: number | null }): HealEntry {
  if (castLevel < record.level) return no(`${record.name} is a level ${record.level} spell and cannot be cast with a level ${castLevel} slot.`);
  const healing = (record.effects ?? []).filter((e) => e.kind === "healing");
  if (healing.length === 0) return no(`${record.name} has no healing in its data, and the rules do not read it from the spell's text.`);
  if (healing.length > 1) return no(`${record.name} has several healing effects, which the rules do not roll yet.`);
  const slot = castSlotOf(record);
  if (slot === null) return no(`${record.name} is not cast as an Action or a Bonus Action, so a fight does not cast it.`);
  const [effect] = healing;
  if (effect.phase !== "impact" || effect.outcome !== "automatic" || effect.multiplier !== 1 || (effect.instances !== undefined && effect.instances !== null)) {
    return no(`${record.name} heals later in its duration or only on a roll, which the rules do not roll yet.`);
  }
  if (effect.target.type !== "creature") return no(`${record.name} heals an area rather than chosen creatures, which the rules do not aim yet.`);
  const [cast] = effectsForCast([effect], record.level, castLevel, 1);
  const count = effect.target.count === null ? 1 : Math.max(1, effect.target.count);
  const ends = (effect.ends ?? []).map((n) => n.trim()).filter((n) => n !== "");
  if (typeof effect.pool === "number" && effect.pool > 0) {
    // A pool the caster divides (Mass Heal): nothing is rolled, any number of creatures may share it.
    const targetCount = effect.target.count === null ? Number.MAX_SAFE_INTEGER : count;
    return { healable: true, dice: "", modifier: 0, targetCount, slot, excludes: healExcludedKinds(record), ends, pool: effect.pool, average: effect.pool };
  }
  if (cast.dice === null) return no(`${record.name} has no healing dice in its data.`);
  const dice = cast.dice.replace(/\s+/g, "");
  const parsed = parseExpression(dice);
  if (parsed === null) return no(`${record.name}'s healing "${cast.dice}" is not a dice expression the rules can roll.`);
  let modifier = 0;
  if (cast.modifier === "spellcasting_ability") {
    if (caster.modifier === null) return no(`The caster's stat block names no spellcasting ability, so ${record.name} has no modifier to add.`);
    modifier = caster.modifier;
  } else if (typeof cast.modifier === "number") {
    modifier = cast.modifier;
  }
  const mean = parsed.terms.reduce((sum, t) => sum + (t.count * (t.sides + 1)) / 2, 0) + parsed.modifier + modifier;
  return { healable: true, dice, modifier, targetCount: count, slot, excludes: healExcludedKinds(record), ends, pool: null, average: Math.max(0, mean) };
}
