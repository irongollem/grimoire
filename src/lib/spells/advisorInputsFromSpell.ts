// What the Spell Level Advisor can read off a spell's own fields, so the DM is not asked what the form already says.
//
// The advisor was one of the first things in the codebase and asked every question by hand. A spell now carries its
// mechanics in fields the rest of the app acts on (damage dice, the save, the area, and since #1021 what it does
// besides damage: `condition_effect`), so the advisor starts from those. What only a person can judge stays a
// question: how strong a buff or a piece of utility is. Pure: no I/O.

import { CONDITION_SHARES } from "@/rules/fight/tactics/conditionWorth";
import type { DamageRoll } from "@/systems/dnd5e/dice/damageExpression";
import type { SpellConditionEffect } from "@/types/spell.types";
import type { AdvisorInputs, DurationTier, EffectIntensity, SaveType, TargetingMode } from "./spellAdvisor";

/** The fields of a spell the advisor reads: a stored spell has them, and so does the editor's draft. */
export interface AdvisorSpellFields {
  damage_rolls: DamageRoll[] | null;
  healing_dice: string | null;
  attack_type: string | null;
  save_effect: string | null;
  aoe_shape: string | null;
  aoe_size: string | null;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  condition_effect?: SpellConditionEffect | null;
}

/** An area's size on the advisor's three steps. A radius reaches twice as far as its number; a cone, line or cube does not. */
function areaOf(shape: string, size: string | null): TargetingMode {
  const feet = size === null ? Number.NaN : Number.parseInt(size, 10);
  if (Number.isNaN(feet)) return "aoe_medium";
  const radial = shape === "sphere" || shape === "cylinder" || shape === "emanation";
  const reach = radial ? feet * 2 : feet;
  if (reach >= 60) return "aoe_large";
  if (reach >= 30) return "aoe_medium";
  return "aoe_small";
}

function targetsOf(spell: AdvisorSpellFields): TargetingMode {
  if (spell.aoe_shape) return areaOf(spell.aoe_shape, spell.aoe_size);
  const targets = spell.condition_effect?.targets;
  if (!targets) return "single";
  if (targets.kind === "self") return "self";
  if (targets.kind === "area") return "aoe_medium";
  if (targets.kind === "several") {
    if (targets.count === null || targets.count >= 4) return "multi_4_5";
    return targets.count === 3 ? "multi_3" : "multi_2";
  }
  return "single";
}

function saveOf(spell: AdvisorSpellFields): SaveType {
  const applies = spell.condition_effect?.applies;
  const type = spell.attack_type;
  if (type === "ranged_spell" || type === "melee_spell") return "attack_roll";
  if (type === "save") return spell.save_effect === "half" ? "save_for_half" : "save_negates";
  if (type === "automatic") return "automatic";
  // No attack or save stated: go by how the condition lands, if the spell imposes one.
  if (applies === "failed_save") return "save_negates";
  if (applies === "hit") return "attack_roll";
  return "automatic";
}

function durationOf(spell: AdvisorSpellFields): DurationTier {
  const d = spell.duration.toLowerCase();
  if (d.includes("instant") || d.includes("round")) return "instantaneous";
  const long = d.includes("hour") || d.includes("dispelled") || d.includes("day");
  if (spell.concentration) return long ? "conc_1hour" : d.includes("10 minutes") ? "conc_10min" : "conc_1min";
  if (long && !/\b1 hour\b/.test(d)) return "sustained_long";
  return "sustained_1min";
}

/**
 * How hard the conditions a spell imposes hit, on the advisor's scale. The measure is the fight rules' own: the
 * share of its turn a condition costs a creature (`CONDITION_SHARES`). Losing the whole turn is major, half of it
 * moderate, less than that weak. "Extreme" (a creature made a puppet) is not a condition and stays the DM's call.
 */
export function controlIntensityOf(effect: SpellConditionEffect): EffectIntensity | null {
  if (effect.verdict !== "condition") return null;
  let share = effect.stops_casting === "all" ? 0.5 : effect.stops_casting === "verbal" ? 0.25 : 0;
  if (effect.leaves_play) share = 1;
  if (effect.speed_zero) share = Math.max(share, 0.25);
  for (const name of effect.conditions) share = Math.max(share, CONDITION_SHARES[name].base);
  if (share <= 0) return null;
  return share >= 1 ? "major" : share >= 0.5 ? "moderate" : "weak";
}

/**
 * Everything the spell's fields say about the advisor's questions. How it reaches, lands and lasts can always be
 * read; what kind of effect it is only when there is damage, healing or a harmful condition. The rest (a buff,
 * utility, how strong) is left out, for the DM to answer.
 */
export function advisorFieldsFromSpell(spell: AdvisorSpellFields): Partial<AdvisorInputs> {
  const effect = spell.condition_effect ?? null;
  const control = effect === null ? null : controlIntensityOf(effect);
  const damage = (spell.damage_rolls ?? []).filter((r) => r.dice.trim() !== "");
  const base: Partial<AdvisorInputs> = {
    targetingMode: targetsOf(spell),
    saveType: saveOf(spell),
    durationTier: durationOf(spell),
    requiresConcentration: spell.concentration,
    isRitual: spell.ritual,
    repeatSave: effect?.repeat_save != null,
    endsWhenHarmed: effect?.ends_when_harmed != null,
    limitedKinds: (effect?.only_kinds ?? []).length > 0,
    canBreakFree: effect?.break_free != null,
  };
  // Healing first: a healing spell with a leftover damage roll in the form is still a healing spell.
  if (spell.healing_dice) return { ...base, effectType: "healing", damageDice: spell.healing_dice, hasSecondaryEffect: false };
  if (damage.length > 0) {
    return { ...base, effectType: "damage", ...(control === null ? {} : { effectIntensity: control }), damageDice: damage.map((r) => r.dice).join(" + "), hasSecondaryEffect: control !== null };
  }
  if (control !== null && effect?.targets?.kind !== "self") return { ...base, effectType: "control", effectIntensity: control, damageDice: "", hasSecondaryEffect: false };
  return base;
}

/** The advisor's whole inputs, or null where the fields do not say what kind of effect the spell is. */
export function advisorInputsFromSpell(spell: AdvisorSpellFields): AdvisorInputs | null {
  const read = advisorFieldsFromSpell(spell);
  if (read.effectType === undefined) return null;
  return { effectIntensity: "moderate", damageDice: "", hasSecondaryEffect: false, ...read } as AdvisorInputs;
}
