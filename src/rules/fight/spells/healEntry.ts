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
// RULE healing-undead-constructs (PHB 2014 "Cure Wounds", "Healing Word", "Mass Healing Word", "Prayer of Healing":
// "This spell has no effect on undead or constructs"; the 2024 Player's Handbook text of the same spells has no such
// sentence). APP CONVENTION: the record does not carry the sentence, so it is read from the edition: a shared 2014 record
// excludes undead and constructs, a 2024 one excludes nobody, and a campaign's own spell is taken at its word (none).
// RULE casting-time (PHB 2014 and 2024 "Healing Word": a Bonus Action; "Cure Wounds": an Action): only a spell cast as an
// Action or a Bonus Action is a heal a fight offers; "1 minute" or "10 minutes" (Prayer of Healing) is not.

import { parseExpression } from "../../../lib/dice/dice.ts";
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

/** The creature kinds the spell does nothing for (see RULE healing-undead-constructs above). */
export function healExcludedKinds(record: SpellRecord): readonly string[] {
  return record.ruleset === "2014" && record.own !== true ? ["undead", "construct"] : [];
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
  const count = effect.target.count === null ? 1 : Math.max(1, effect.target.count);
  return { healable: true, dice, modifier, targetCount: count, slot, excludes: healExcludedKinds(record), average: Math.max(0, mean) };
}
