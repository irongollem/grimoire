/**
 * Decides whether a library spell's stored automation provably matches the
 * spell's own rules text (#1123). Approve only on proof: a false reject costs a
 * player one manual roll, a false approve rolls the wrong dice in someone's game.
 * Pure: the script feeds it rows, the caller decides what to do with a verdict.
 */
import { scaleExpression } from "@/lib/dice/dice";
import type { DamageRoll } from "@/lib/dice/dice";
import { UPCAST_DICE_RE } from "@/lib/library/open5eSpellImport";
import {
  classifyTextDice, cleanText as clean, isDurationOnlyUpcast, matchAttackDamage, matchChoiceAttackDamage, matchChoiceSaveDamage,
  matchHealing, matchInstances, matchRider, matchSaveDamage, normDice, textDiceIn, upcastNamedTypes, withoutRiderWording,
  withoutZoneTrigger,
} from "@/lib/library/spellTextMechanics";
import type { DamagePart, SaveDamage } from "@/lib/library/spellTextMechanics";
import { cantripDiceMultiplier } from "@/types/spell.types";
import type { HigherLevelDamage, SpellEffectInstances, StructuredSpellEffect } from "@/types/spell.types";

export interface SpellMechanicsInput {
  name: string;
  level: number;
  description: string;
  higher_levels: string | null;
  attack_type: string | null;
  save_attribute: string | null;
  save_effect: string | null;
  damage_rolls: DamageRoll[] | null;
  healing_dice: string | null;
  higher_level_damage: HigherLevelDamage | null;
  higher_level_healing: string | null;
  effects?: StructuredSpellEffect[] | null;
  casting_options?: Array<Record<string, unknown>> | null;
}

export interface SpellMechanicsFinding {
  code: string;
  detail: string;
}

export type SpellMechanicsVerdict =
  | { approved: true; basis: "no_dice" | "no_cast_roll" | "automation" | "rider" }
  | { approved: false; findings: SpellMechanicsFinding[] };

const ABILITY_NAMES: Record<string, string> = {
  STR: "strength",
  DEX: "dexterity",
  CON: "constitution",
  INT: "intelligence",
  WIS: "wisdom",
  CHA: "charisma",
};

/** Phrases that signal a rule the effect model does not hold; each is its own finding. */
const RED_FLAGS: Array<[string, RegExp]> = [
  ["for every", /\bfor every\b/],
  ["for each", /\bfor each\b/],
  ["extra", /\bextra\b/],
  ["whenever", /\bwhenever\b/],
  // "can't be affected by this spell again" (Prayer of Healing) is a limit on casting, not a repeat of the roll.
  ["again", /(?<!affected by this spell )\bagain\b/],
  // "dim light for an additional 30 feet" (Sunbeam) is distance, not extra damage or targets.
  ["additional", /\badditional\b(?! \d+ feet)/],
  ["instead", /\binstead\b/],
  ["double", /\bdouble\b/],
  ["twice", /\btwice\b/],
  // "hit point maximum" (Harm) is a side effect the damage roll does not touch.
  ["maximum", /(?<!hit point )\bmaximum\b/],
  ["temporary hit points", /\btemporary hit points\b/],
  ["plural rays, beams, darts or missiles", /\b(?:rays|beams|darts|missiles)\b/],
  // Chromatic Orb 2024: a second roll against a second target the one-roll model cannot hold.
  ["leaps to another target", /\bleaps? to\b/],
  ["separate attack", /\bseparate attack\b/],
];

const textDice = textDiceIn;

/** A dice expression as it may be written in prose: spaces allowed around + and -. */
function diceSource(dice: string): string {
  return normDice(dice).replace(/([+-])/g, "\\s*\\$1\\s*");
}

function sameSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

/** "1d10" at a cantrip's character level 11 is "3d10"; a flat modifier stays. */
function multiplyDice(dice: string, factor: number): string | null {
  const match = normDice(dice).match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  return `${Number(match[1]) * factor}d${match[2]}${match[3] ?? ""}`;
}

const sameScaling = (
  a: StructuredSpellEffect["scaling"] | undefined,
  b: StructuredSpellEffect["scaling"] | undefined,
): boolean => {
  if (!a || !b) return !a && !b;
  return a.mode === b.mode && a.interval === b.interval && normDice(a.dice) === normDice(b.dice);
};

const partsMatch = (read: DamagePart[], stored: DamagePart[]): boolean =>
  read.length === stored.length && read.every((p, i) => p.dice === stored[i].dice && p.type === stored[i].type);

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

function sameInstances(a: SpellEffectInstances, b: SpellEffectInstances): boolean {
  const steps = (i: SpellEffectInstances) => (i.byCharacterLevel ?? []).map((step) => `${step.level}:${step.count}`);
  return a.noun === b.noun && a.count === b.count && (a.perSlotAbove ?? 0) === (b.perSlotAbove ?? 0) && sameList(steps(a), steps(b));
}

/** The phrases of RED_FLAGS the text contains, each as its own finding. */
function redFlagFindings(text: string): SpellMechanicsFinding[] {
  return RED_FLAGS.filter(([, pattern]) => pattern.test(text)).map(([phrase]) => ({ code: "red_flag", detail: phrase }));
}

/** Open5e's own per-slot table must agree with the dice and per-level step (it tabulates the first part). */
function upcastTableFindings(spell: SpellMechanicsInput, dice: string, perLevel: string | null): SpellMechanicsFinding[] {
  const findings: SpellMechanicsFinding[] = [];
  for (const option of spell.casting_options ?? []) {
    const type = typeof option.type === "string" ? option.type.match(/^slot_level_(\d+)$/) : null;
    if (!type || typeof option.damage_roll !== "string") continue;
    const slot = Number(type[1]);
    const expected = perLevel ? scaleExpression(normDice(dice), slot - spell.level, perLevel) : normDice(dice);
    if (normDice(option.damage_roll) !== normDice(expected)) {
      findings.push({ code: "upcast_table_disagrees", detail: `Slot level ${slot}: expected ${expected}, the table has ${option.damage_roll}.` });
    }
  }
  return findings;
}

/**
 * Extra damage rolled when a weapon hits (Hex, Divine Favor, Branding Smite): no effects and
 * no cast-time attack, so nothing rolls at cast; the stored roll is the rider itself.
 */
function checkRider(spell: SpellMechanicsInput, rider: DamagePart): SpellMechanicsVerdict {
  const findings: SpellMechanicsFinding[] = [];
  const fail = (code: string, detail: string): void => {
    findings.push({ code, detail });
  };
  const rolls = spell.damage_rolls ?? [];
  const description = clean(spell.description);
  const higherLevels = spell.higher_levels ? clean(spell.higher_levels) : "";
  if ((spell.effects ?? []).length > 0) fail("rider_has_effects", "A rider rolls when a weapon hits; effects would open the resolver at cast.");
  if (spell.attack_type !== null) fail("rider_attack_type", `attack_type ${spell.attack_type} would roll at cast; a rider has none.`);
  if (spell.save_attribute || spell.save_effect || spell.healing_dice) fail("rider_shape", "A rider carries no save or healing.");
  const stored = rolls.length === 1 ? { dice: normDice(rolls[0].dice), type: rolls[0].type.trim().toLowerCase() } : null;
  if (!stored || stored.dice !== rider.dice || stored.type !== rider.type) {
    fail("rider_roll_mismatch", `The text gives an extra ${rider.dice} ${rider.type}; the stored roll is ${stored ? `${stored.dice} ${stored.type}` : `${rolls.length} rolls`}.`);
  }
  findings.push(...redFlagFindings(withoutRiderWording(description)));
  const upcastDice = textDice(higherLevels);
  let perLevel: string | null = null;
  if (upcastDice.length > 0) {
    const match = spell.higher_levels?.match(UPCAST_DICE_RE);
    if (!match || !/\bdamage increases by\b/.test(higherLevels)) fail("upcast_unparsed", "higher_levels has dice but no 'the damage increases by X for each slot level above' phrase.");
    else {
      perLevel = normDice(match[1]);
      if (!sameSet(upcastDice, [perLevel])) fail("upcast_extra_dice", `higher_levels has dice ${[...new Set(upcastDice)].join(", ")}.`);
      if (!spell.higher_level_damage?.dice_per_level || normDice(spell.higher_level_damage.dice_per_level) !== perLevel) {
        fail("upcast_stored_mismatch", `The stored per-level dice are ${spell.higher_level_damage?.dice_per_level ?? "empty"}, the text says ${perLevel}.`);
      }
    }
  } else {
    if (higherLevels && !isDurationOnlyUpcast(higherLevels)) fail("upcast_not_modelled", "higher_levels says something the model does not hold.");
    if (spell.higher_level_damage) fail("upcast_stored_mismatch", "A per-level step is stored but higher_levels has no dice.");
  }
  findings.push(...upcastTableFindings(spell, rider.dice, perLevel));
  return findings.length > 0 ? { approved: false, findings } : { approved: true, basis: "rider" };
}

export function checkSpellMechanics(spell: SpellMechanicsInput): SpellMechanicsVerdict {
  const findings: SpellMechanicsFinding[] = [];
  const fail = (code: string, detail: string): void => {
    findings.push({ code, detail });
  };

  const description = clean(spell.description);
  const higherLevels = spell.higher_levels ? clean(spell.higher_levels) : "";
  const rolls = spell.damage_rolls ?? [];
  const effects = spell.effects ?? [];
  const hasAutomation = effects.length > 0 || rolls.length > 0 || Boolean(spell.healing_dice);

  if (!hasAutomation) {
    const dice = classifyTextDice(description);
    if (dice.length === 0 && textDice(higherLevels).length === 0) return { approved: true, basis: "no_dice" };
    // Bless, Guidance, Resistance: the die is rolled later, by the player, and it is not damage or hit points.
    if (dice.every((die) => die.role === "modifier_to_roll") && textDice(higherLevels).length === 0) {
      return { approved: true, basis: "no_cast_roll" };
    }
    return { approved: false, findings: [{ code: "dice_without_automation", detail: "The text rolls dice but nothing is automated." }] };
  }

  const rider = matchRider(description);
  if (rider) return checkRider(spell, rider);

  const attack = spell.attack_type === "ranged_spell" || spell.attack_type === "melee_spell";
  const base = effects.find((effect) => effect.id === "base");
  // The caster picks the type at cast: the base effect says so, and the text must list the same types.
  const storedChoices = base?.damageTypeChoices ?? null;
  const choiceFlow = Boolean(storedChoices && storedChoices.length > 0);
  const choiceRead = !choiceFlow ? null : spell.attack_type === "save" ? matchChoiceSaveDamage(description) : attack ? matchChoiceAttackDamage(description) : null;
  const choiceAsSave: SaveDamage | null = choiceRead ? { parts: [{ dice: choiceRead.dice, type: "" }], half: choiceRead.half, ability: null } : null;
  // Several rays, darts or beams: the base effect says so, and the text's own sentences must give the same count.
  const storedInstances = base?.instances ?? null;
  const instanceRead = storedInstances ? matchInstances(spell.description, spell.higher_levels, spell.level) : null;

  // 1. One roll, or two damage parts the text names in one sentence.
  const saveRead = spell.attack_type === "save" ? (choiceFlow ? choiceAsSave : matchSaveDamage(description)) : null;
  const healingDice = rolls.length === 0 ? spell.healing_dice : null;
  const isHealing = Boolean(healingDice);
  const twoPartsAllowed = rolls.length === 2 && saveRead?.parts.length === 2;
  const isDamage = (rolls.length === 1 || twoPartsAllowed) && !spell.healing_dice;
  if (!healingDice && !isDamage) {
    return {
      approved: false,
      findings: [{ code: "roll_count", detail: `${rolls.length} damage roll(s) and ${spell.healing_dice ? "a" : "no"} healing roll; exactly one roll is required.` }],
    };
  }
  const parts: DamagePart[] = healingDice
    ? [{ dice: normDice(healingDice), type: "" }]
    : rolls.map((r) => ({ dice: normDice(r.dice), type: r.type.trim().toLowerCase() }));
  const two = parts.length === 2;
  const roll = parts[0].dice;
  if (isDamage) {
    for (const p of parts) {
      if (choiceFlow ? p.type !== "" : !p.type) fail(choiceFlow ? "choice_type_stored" : "damage_type_missing", choiceFlow ? "A roll whose type is chosen at cast stores no type." : "The damage roll has no type.");
    }
    if (choiceFlow && (two || isHealing || !choiceRead)) fail("choices_not_in_text", "The text does not list the damage types as a single choice.");
  }
  const kind = isHealing ? "healing" : "damage";

  // 2. Effects.
  const baseIds = two ? ["base", "base-2"] : ["base"];
  const halfIds = baseIds.map((id) => `${id}-save-half`);
  const byId = (id: string) => effects.find((effect) => effect.id === id);
  if (effects.length === 0) fail("effects_missing", "A roll is stored but no effects.");
  for (const id of baseIds) {
    const count = effects.filter((effect) => effect.id === id).length;
    if (count !== 1) fail("base_effect_count", `${count} ${id} effects; exactly one is required.`);
  }
  const half = byId("base-save-half");
  for (const effect of effects) {
    const known = baseIds.includes(effect.id) || halfIds.includes(effect.id) || /^option-\d+$/.test(effect.id);
    if (!known) fail("unknown_effect", `Effect id ${effect.id}.`);
    else if (/^option-\d+$/.test(effect.id) && effect.scaling?.mode !== "character_level") {
      fail("option_not_character_level", `${effect.id} is not a character level variant.`);
    }
    if (effect.phase !== "impact") fail("effect_phase", `${effect.id} resolves in phase ${effect.phase}.`);
    if (effect.kind !== kind) fail("effect_kind", `${effect.id} is ${effect.kind}, the roll is ${kind}.`);
  }
  baseIds.forEach((id, index) => {
    const effect = byId(id);
    if (!effect) return;
    if (effect.multiplier !== 1) fail("base_multiplier", `Base multiplier is ${effect.multiplier}.`);
    if (effect.dice === null || normDice(effect.dice) !== parts[index].dice) {
      fail("base_dice_mismatch", `${id} rolls ${effect.dice}, the stored roll is ${parts[index].dice}.`);
    }
    if (isDamage && effect.damageType !== (choiceFlow ? null : parts[index].type)) {
      fail("base_damage_type_mismatch", `${id} type ${effect.damageType}, the stored roll is ${parts[index].type}.`);
    }
  });
  for (const effect of effects) {
    if (effect.id === "base" || !(baseIds.includes(effect.id) || halfIds.includes(effect.id))) continue;
    const listed = effect.damageTypeChoices ?? [];
    if (choiceFlow ? !choiceRead || !sameList(listed, choiceRead.choices) : listed.length > 0) {
      fail("choices_mismatch", `${effect.id} lists ${listed.join(", ") || "no types"}${choiceRead ? `, the text lists ${choiceRead.choices.join(", ")}` : ""}.`);
    }
  }
  if (base && choiceFlow && (!choiceRead || !sameList(storedChoices ?? [], choiceRead.choices))) {
    fail("choices_mismatch", `base lists ${(storedChoices ?? []).join(", ")}, the text lists ${choiceRead?.choices.join(", ") ?? "no single choice"}.`);
  }
  if (storedInstances) {
    if (!instanceRead) fail("instances_not_in_text", "The text does not give the ray, dart or beam count in its own sentences.");
    else if (!sameInstances(storedInstances, instanceRead.instances)) fail("instances_mismatch", `The effect says ${JSON.stringify(storedInstances)}, the text says ${JSON.stringify(instanceRead.instances)}.`);
    if (isHealing || two || half || spell.attack_type === "save") fail("instances_shape", "Instances are held only by a single attack or automatic damage roll.");
  }
  for (const effect of effects) {
    if (effect.id !== "base" && effect.instances) fail("instances_on_other_effect", `${effect.id} carries instances; only the base effect may.`);
  }

  // 3. The main sentence, read with the same templates the importer derives from.
  const outcomeOf = (id: string) => byId(id)?.outcome;
  if (isHealing) {
    if (spell.attack_type === "save" || attack) fail("healing_with_attack_or_save", "A healing spell is marked as an attack or save.");
    if (matchHealing(description) !== roll) fail("main_sentence_not_found", "No single 'regains hit points equal to <dice>' sentence for this roll.");
    if (description.includes("damage")) fail("healing_mentions_damage", "A healing spell's text mentions damage.");
    if (base && base.outcome !== "automatic") fail("outcome_mismatch", `Healing outcome is ${base.outcome}.`);
    if (half) fail("unexpected_save_half", "A healing spell has a save-for-half effect.");
  } else if (instanceRead && !instanceRead.attack) {
    // Magic Missile: every dart strikes on its own, so there is no attack or save, and one shared roll.
    if (spell.attack_type !== "automatic") fail("instances_attack_type", `attack_type ${spell.attack_type}; darts that strike on their own are automatic.`);
    if (spell.save_attribute || spell.save_effect) fail("instances_shape", "Darts that strike on their own carry no save.");
    if (!instanceRead.damage || !partsMatch([instanceRead.damage], parts)) fail("main_sentence_not_found", "No 'a dart deals <dice> <type> damage' sentence for this roll.");
    if (base && base.outcome !== "automatic") fail("outcome_mismatch", `Automatic outcome is ${base.outcome}.`);
  } else if (attack) {
    const phrase = spell.attack_type === "ranged_spell" ? "ranged spell attack" : "melee spell attack";
    if (!description.includes(phrase)) fail("attack_type_not_in_text", `The text does not say '${phrase}'.`);
    const read = choiceFlow ? choiceAsSave?.parts ?? null : matchAttackDamage(description);
    if (!read || !partsMatch(read, parts)) fail("main_sentence_not_found", "No 'on a hit, the target takes <dice> <type> damage' sentence for this roll.");
    if (base && base.outcome !== "hit") fail("outcome_mismatch", `Attack outcome is ${base.outcome}.`);
    if (half) fail("unexpected_save_half", "An attack spell has a save-for-half effect.");
  } else if (spell.attack_type === "save") {
    const ability = spell.save_attribute ? ABILITY_NAMES[spell.save_attribute.toUpperCase()] : undefined;
    if (!ability) fail("save_attribute_missing", "A save spell has no known save ability.");
    else if (!description.includes(`${ability} saving throw`)) fail("save_ability_not_in_text", `The text does not name a ${ability} saving throw.`);
    // The damage sentence may name its own ability; it must be the one stored.
    if (ability && saveRead?.ability && saveRead.ability !== ability) fail("save_ability_mismatch", `The damage sentence names a ${saveRead.ability} save, the row says ${ability}.`);
    if (!saveRead || !partsMatch(saveRead.parts, parts)) {
      fail("main_sentence_not_found", "No recognised save-damage sentence for this roll.");
    } else if (saveRead.half) {
      if (spell.save_effect !== "half") fail("save_effect_mismatch", `The text halves damage, save_effect is ${spell.save_effect}.`);
      baseIds.forEach((id, index) => {
        if (outcomeOf(id) && outcomeOf(id) !== "failed_save") fail("outcome_mismatch", `${id} outcome is ${outcomeOf(id)}.`);
        const halfEffect = byId(halfIds[index]);
        if (!halfEffect) {
          fail("save_half_missing", `The text halves damage but there is no ${halfIds[index]} effect.`);
          return;
        }
        if (halfEffect.outcome !== "successful_save" || halfEffect.multiplier !== 0.5) fail("save_half_shape", `${halfIds[index]} is not a 0.5 successful_save effect.`);
        if (halfEffect.dice === null || normDice(halfEffect.dice) !== parts[index].dice) fail("save_half_dice_mismatch", `${halfIds[index]} rolls ${halfEffect.dice}.`);
        const baseEffect = byId(id);
        if (baseEffect && !sameScaling(baseEffect.scaling, halfEffect.scaling)) fail("save_half_scaling_mismatch", `${halfIds[index]} scales differently from ${id}.`);
      });
    } else {
      // "Half Cover" (Sacred Flame) is not half damage.
      if (/\bhalf (?:as much|the damage|damage)\b/.test(description)) fail("half_not_modelled", "The text mentions half damage the sentence does not model.");
      if (spell.save_effect === "half") fail("save_effect_mismatch", "save_effect is half but the text does not say so.");
      if (base && base.outcome !== "failed_save") fail("outcome_mismatch", `Base outcome is ${base.outcome}.`);
      if (half) fail("unexpected_save_half", "The text has no half damage but a base-save-half effect is stored.");
    }
  } else {
    fail("no_attack_or_save", `attack_type ${spell.attack_type} carries damage that is neither an attack nor a save.`);
  }
  if (!attack && description.includes("spell attack")) fail("spell_attack_not_modelled", "The text has a spell attack the row does not model.");

  // 4. Modifier.
  const modifierInText = new RegExp(`${diceSource(roll)} (?:\\+|plus) your spellcasting ability modifier`).test(description);
  if (base) {
    if (modifierInText && base.modifier !== "spellcasting_ability") fail("modifier_missing", "The text adds the spellcasting modifier; the effect does not.");
    if (!modifierInText && base.modifier !== undefined && base.modifier !== null) fail("modifier_not_in_text", `The effect carries modifier ${base.modifier} the text does not.`);
  }
  if (two) {
    for (const id of ["base-2", "base-2-save-half"]) {
      const modifier = byId(id)?.modifier;
      if (modifier !== undefined && modifier !== null) fail("modifier_not_in_text", `${id} carries modifier ${modifier} the text does not.`);
    }
  }

  // 5. Dice in the description are exactly the roll.
  const descriptionDice = textDice(description);
  if (!sameSet(descriptionDice, parts.map((p) => p.dice))) {
    fail("extra_dice_in_text", `The text has dice ${[...new Set(descriptionDice)].join(", ") || "none"}; the roll is ${parts.map((p) => p.dice).join(", ")}.`);
  }

  // 6. Red flags.
  // An instance set's own sentences are consumed by its template; the rest of the text is scanned as usual.
  findings.push(...redFlagFindings(withoutZoneTrigger(instanceRead ? instanceRead.description : description)));

  // 7. Cantrip variants / 8. slot scaling.
  const characterVariants = effects.filter((effect) => effect.scaling?.mode === "character_level");
  const mainEffects = [...baseIds, ...halfIds].flatMap((id) => byId(id) ?? []);
  let perLevel: string | null = null;
  if (instanceRead) {
    // The count grows, the dice do not: no cantrip variants, no slot dice, and nothing else in the upcast text.
    if (characterVariants.length > 0) fail("instances_character_variant", "A count that grows has no dice variants.");
    for (const effect of mainEffects) if (effect.scaling) fail("upcast_scaling_without_text", `${effect.id} scales by dice but the text grows a count.`);
    if (instanceRead.higherLevels) fail("upcast_not_modelled", "higher_levels says something beyond the count.");
    if (spell.higher_level_damage || spell.higher_level_healing) fail("upcast_stored_mismatch", "Per-level dice are stored for a spell that grows a count.");
  } else if (spell.level === 0) {
    if (two) fail("cantrip_two_parts", "A cantrip with two damage parts.");
    if (half) fail("cantrip_save_half", "A cantrip with a save-for-half effect.");
    if (base?.scaling) fail("unexpected_scaling", "A cantrip's base effect scales by slot.");
    for (const interval of [5, 11, 17]) {
      const matching = characterVariants.filter((effect) => effect.scaling?.interval === interval);
      if (matching.length !== 1) fail("cantrip_variant_missing", `${matching.length} variant(s) for character level ${interval}.`);
    }
    // The 2024 SRD lists the steps at 5, 11 and 17; the 2014 SRD lists every level
    // from 5 to 20. Either is right as long as each level rolls what the cantrip
    // rule gives at that level, since the resolver picks the highest one reached.
    for (const variant of characterVariants) {
      const interval = variant.scaling?.interval;
      if (interval === undefined || !Number.isInteger(interval) || interval < 2 || interval > 20) {
        fail("cantrip_variant_unexpected", `A variant at character level ${interval}.`);
        continue;
      }
      const expected = multiplyDice(roll, cantripDiceMultiplier(interval));
      if (expected === null || variant.dice === null || normDice(variant.dice) !== expected) {
        fail("cantrip_variant_dice", `Level ${interval} rolls ${variant.dice}, expected ${expected}.`);
      }
      if (variant.scaling && variant.dice !== null && normDice(variant.scaling.dice) !== normDice(variant.dice)) {
        fail("cantrip_variant_dice", `Level ${interval} scaling dice differ from its dice.`);
      }
      if (base && (variant.outcome !== base.outcome || variant.damageType !== base.damageType || variant.multiplier !== 1 || (variant.modifier ?? null) !== (base.modifier ?? null))) {
        fail("cantrip_variant_shape", `Level ${interval} differs from base in outcome, type, multiplier or modifier.`);
      }
    }
    const upgrades = textDice(higherLevels);
    for (const factor of [2, 3, 4]) {
      const wanted = multiplyDice(roll, factor);
      if (wanted === null || !upgrades.includes(wanted)) fail("cantrip_text_missing", `higher_levels does not give ${wanted}.`);
    }
  } else {
    if (characterVariants.length > 0) fail("leveled_character_variant", "A leveled spell has character level variants.");
    const upcastDice = textDice(higherLevels);
    if (upcastDice.length > 0) {
      const match = spell.higher_levels?.match(UPCAST_DICE_RE);
      if (!match) fail("upcast_unparsed", "higher_levels has dice but no 'X for each slot level above' phrase.");
      else {
        const step = normDice(match[1]);
        if (!sameSet(upcastDice, [step])) fail("upcast_extra_dice", `higher_levels has dice ${[...new Set(upcastDice)].join(", ")}.`);
        // Two parts: only the part whose type the sentence names scales (Ice Storm: "the bludgeoning damage increases").
        let scaledPart = 0;
        let typeOk = true;
        if (two) {
          const named = upcastNamedTypes(higherLevels).filter((type) => parts.some((p) => p.type === type));
          if (named.length !== 1) {
            typeOk = false;
            fail("upcast_part_unnamed", `The upcast names ${named.length === 0 ? "no damage type" : named.join(" and ")}; exactly one part must be named.`);
          } else {
            scaledPart = parts.findIndex((p) => p.type === named[0]);
            if (spell.higher_level_damage?.type?.toLowerCase() !== named[0]) fail("upcast_stored_type_mismatch", `The stored upcast type is ${spell.higher_level_damage?.type ?? "empty"}, the text names ${named[0]}.`);
          }
        }
        if (typeOk) {
          if (scaledPart === 0) perLevel = step;
          baseIds.forEach((id, index) => {
            for (const effect of [byId(id), byId(halfIds[index])]) {
              if (!effect) continue;
              const shouldScale = index === scaledPart;
              const scales = effect.scaling?.mode === "slot" && normDice(effect.scaling.dice) === step;
              if (shouldScale && !scales) fail("upcast_scaling_mismatch", `${effect.id} does not scale by ${step} per slot level.`);
              if (!shouldScale && effect.scaling) fail("upcast_scaling_mismatch", `${effect.id} scales but the upcast names the other part.`);
            }
          });
          const stored = isHealing ? spell.higher_level_healing : spell.higher_level_damage?.dice_per_level;
          if (!stored || normDice(stored) !== step) fail("upcast_stored_mismatch", `The stored per-level dice are ${stored ?? "empty"}, the text says ${step}.`);
        }
      }
    } else {
      for (const effect of mainEffects) {
        if (effect.scaling) fail("upcast_scaling_without_text", `${effect.id} scales but higher_levels has no dice.`);
      }
      if (higherLevels) fail("upcast_not_modelled", "higher_levels says something the model does not hold.");
    }
  }

  // 9. Open5e's own per-slot table must agree (it tabulates the first part).
  if (base?.dice) findings.push(...upcastTableFindings(spell, base.dice, perLevel));

  return findings.length > 0 ? { approved: false, findings } : { approved: true, basis: "automation" };
}
