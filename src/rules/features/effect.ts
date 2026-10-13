import type { AbilityKey } from "@/rules/characterCreation";
import { assembleDamage, type AssembledDamage } from "./damageRoll";
import { sumAdds, valueAtLevel } from "./resolve";
import type { EffectKind, FeatureEffect } from "./mechanics.types";

/**
 * Turning a feature's rollable effect into this character's numbers (#976).
 * Pure: the Feature actions card builds a context from the sheet and rolls what
 * comes back. The row says "Constitution save, DC from Charisma, 1d6 thunder,
 * 2d6 from level 10"; this says "DC 14 Con save, 2d6 thunder" for a level 10
 * character with a 18 Charisma and +4 proficiency.
 */

export interface EffectContext {
  /** Level in the granting class (a feat has none; its levels are the character's total level). */
  classLevel: number;
  proficiencyBonus: number;
  abilityMods: Record<AbilityKey, number>;
  /**
   * The granting class's spell save DC and spell attack bonus, or null when the
   * feature has no spellcasting class behind it (a feat, or a class that casts nothing).
   */
  spell: { dc: number; attack: number } | null;
}

export interface ResolvedDamage {
  /** The dice at this level ("2d6"); a flat value ("5") has no dice. */
  base: string;
  /** Flat bonuses from `add`, summed. */
  modifier: number;
  /** The floor already applied to `modifier` (`FeatureEffect.min`), kept to say so; null when there is none. */
  min: number | null;
  /** Readable total expression ("2d6+3"). */
  label: string;
  /** One of `DAMAGE_TYPES`, or null for healing and typeless damage. */
  type: string | null;
}

export interface ResolvedEffect {
  kind: EffectKind;
  /** The attack roll's bonus, or null when the effect makes no attack roll. */
  toHit: number | null;
  delivery: "melee" | "ranged" | null;
  range: string | null;
  save: { ability: AbilityKey; dc: number; success: "half" | "none" } | null;
  /** Null for an effect that imposes something without rolling damage. */
  damage: ResolvedDamage | null;
  area: string | null;
}

export type EffectResolution = { ok: true; effect: ResolvedEffect } | { ok: false; reason: string };

const NEEDS_SPELLCASTING = "Needs a spellcasting class";

/** The lowest level that lists a value, for "available from level N". */
function firstLevel(values: Record<string, unknown>): number {
  return Math.min(...Object.keys(values).map(Number));
}

export function resolveEffect(effect: FeatureEffect, ctx: EffectContext): EffectResolution {
  let toHit: number | null = null;
  if (effect.attack) {
    if (effect.attack.ability === "spell") {
      if (!ctx.spell) return { ok: false, reason: NEEDS_SPELLCASTING };
      toHit = ctx.spell.attack;
    } else {
      toHit = ctx.proficiencyBonus + ctx.abilityMods[effect.attack.ability];
    }
  }

  let save: ResolvedEffect["save"] = null;
  if (effect.save) {
    if (effect.save.dc_ability === "spell") {
      if (!ctx.spell) return { ok: false, reason: NEEDS_SPELLCASTING };
      save = { ability: effect.save.ability, dc: ctx.spell.dc, success: effect.save.success };
    } else {
      save = {
        ability: effect.save.ability,
        dc: 8 + ctx.proficiencyBonus + ctx.abilityMods[effect.save.dc_ability],
        success: effect.save.success,
      };
    }
  }

  let damage: ResolvedDamage | null = null;
  if (effect.dice || effect.add) {
    // A flat amount ("fire damage equal to your proficiency bonus") has no dice of its own.
    const base = effect.dice ? valueAtLevel(effect.dice, ctx.classLevel) : "0";
    // Below the first listed level the feature does not do this yet.
    if (base === null) return { ok: false, reason: `Available from level ${effect.dice ? firstLevel(effect.dice) : 1}` };
    // The floor is on the modifier ("Charisma modifier (minimum of 1)"), as in the books, so the
    // dice prompt and the card's total can never disagree. Shared with the flat rider.
    const modifier = sumAdds(effect.add ?? [], effect.min, ctx);
    const minimum = effect.min === undefined ? null : effect.min;
    // A flat total has no dice to put its sign after, so "+15" reads as "15".
    const label = assembleDamage({ base, modifier, riders: [], critical: false }).parts.join("").replace(/^\+/, "");
    damage = { base, modifier, min: minimum, label: label === "" ? "0" : label, type: effect.damage_type === undefined ? null : effect.damage_type };
  }

  return {
    ok: true,
    effect: {
      kind: effect.kind,
      toHit,
      delivery: effect.attack ? effect.attack.delivery : null,
      range: effect.attack?.range === undefined ? null : effect.attack.range,
      save,
      damage,
      area: effect.area === undefined ? null : effect.area,
    },
  };
}

/**
 * The dice to roll for a resolved effect. A critical hit doubles every die and
 * never the modifier, the same as a weapon's damage (`assembleDamage`).
 */
export function effectDamageRoll(damage: ResolvedDamage, critical: boolean): AssembledDamage {
  return assembleDamage({ base: damage.base, modifier: damage.modifier, riders: [], critical });
}

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "+7 to hit", "DC 14 Con save", "2d6 thunder", "Heals 1d8+3": the card's one-line description. */
export function describeResolved(effect: ResolvedEffect): string {
  const parts: string[] = [];
  if (effect.toHit !== null) parts.push(`${effect.toHit >= 0 ? "+" : ""}${effect.toHit} to hit`);
  if (effect.save) {
    const half = effect.save.success === "half" ? ", half on success" : "";
    parts.push(`DC ${effect.save.dc} ${capitalised(effect.save.ability)} save${half}`);
  }
  if (effect.damage) {
    const floor = effect.damage.min !== null ? ` (minimum ${effect.damage.min})` : "";
    if (effect.kind === "heal") parts.push(`Heals ${effect.damage.label}${floor}`);
    else if (effect.kind === "temp_hp") parts.push(`Temporary hit points ${effect.damage.label}${floor}`);
    else parts.push((effect.damage.type ? `${effect.damage.label} ${effect.damage.type}` : effect.damage.label) + floor);
  }
  if (effect.range) parts.push(effect.range);
  if (effect.area) parts.push(effect.area);
  return parts.join(" · ");
}
