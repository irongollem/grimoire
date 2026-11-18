// A spell turned into the stat-block entry the fight already resolves (#1021, row 5b): a creature's Fireball is rolled
// like a breath weapon (one damage roll, each target saves), its Fire Bolt like an attack. Nothing is resolved here;
// this only says what the cast is, in the shape `resolveAttackOn` and `resolveSaveOn` read, or why it cannot be.
// Pure and edge-importable (relative `.ts` imports only).
//
// RULE spell-damage-scaling is the record's own (SRD 5.1 "Fireball": 8d6, +1d6 for each slot level above 3rd; a
// cantrip grows at 5th, 11th and 17th level). It is read through `effectsForCast` and `castDamageRolls`, the rules the
// player sheet and the runner already share, never a second scaler.
// APP CONVENTION: a spell whose stored data does not say everything its cast does (no damage, a special save, rays,
// damage later in its duration) is never half-resolved. It is not automatable, and the caller says why.

import { DAMAGE_TYPES, type DamageType } from "../../../types/damage.types.ts";
import { SAVE_ABILITIES, type DamagePart, type SaveAbility, type SaveCondition, type SaveEnds, type StatBlockEntry } from "../../../types/statBlock.types.ts";
import type { SpellConditionEffect, StructuredSpellEffect } from "../../../types/spell.types.ts";
import { castDamageRolls } from "../../spellDamageScaling.ts";
import { effectsForCast } from "../../spellEffects.ts";
import type { SpellRecord } from "./spellChoice.ts";

export interface SpellCaster {
  saveDc: number | null;
  attackBonus: number | null;
  /** The caster's level, when its stat block names one: a cantrip's damage steps up with it. */
  casterLevel?: number | null;
}

export interface SpellEntryOptions {
  /** The caller vouches that every target is of a kind the spell's `condition_effect.only_kinds` allows, so its conditions are imposed. */
  kindsChecked?: boolean;
}

export type SpellEntry =
  | { automatable: true; kind: "attack" | "save"; entry: StatBlockEntry }
  | { automatable: false; why: string };

const no = (why: string): SpellEntry => ({ automatable: false, why });

function isDamageType(value: string): value is DamageType {
  return (DAMAGE_TYPES as readonly string[]).includes(value);
}

function isSaveAbility(value: string): value is SaveAbility {
  return (SAVE_ABILITIES as readonly string[]).includes(value);
}

/** SRD 5.1 "Duration": a round is 6 seconds, so a minute is ten rounds. */
const ROUNDS_PER_MINUTE = 10;

/**
 * The conditions a failed save imposes, from the record's `condition_effect` (#1021 step C), or none when the entry
 * cannot say it completely. Only a `condition` verdict that lands on a failed save, whose save is the record's own
 * column, aimed at someone other than the caster. Whatever is not said is left to the table, never guessed.
 */
function conditionsOf(record: SpellRecord, kindsChecked: boolean): SaveCondition[] {
  const effect = record.condition_effect;
  if (effect === null || effect === undefined) return [];
  if (effect.verdict !== "condition" || effect.applies !== "failed_save" || effect.conditions.length === 0) return [];
  if (effect.targets === null || effect.targets.kind === "self") return [];
  // Two sources of the save's ability that differ: do not guess which one is right.
  if (effect.save_ability === null || effect.save_ability !== (record.save_attribute ?? "").toUpperCase()) return [];
  // A condition limited to a kind ("humanoid") is imposed only when the caller vouches that every target is of an
  // allowed kind (`kindsChecked`, from `creatureKind.ts`); otherwise it stays the table's to rule rather than being
  // imposed on everyone.
  if (effect.only_kinds.length > 0 && !kindsChecked) return [];
  const ends = endsOf(effect);
  if (ends === "unsaid") return [];
  return effect.conditions.map((name): SaveCondition => (ends === null ? { name } : { name, ends }));
}

/**
 * What ends the condition. `null`: nothing but someone removing it (an hour or more, until dispelled, special, instant:
 * the table or the concentration ends those). `unsaid`: a repeat save the type cannot state.
 * APP CONVENTION: `stops_casting` and `speed_zero` of the entry are not used by this story.
 */
function endsOf(effect: SpellConditionEffect): SaveEnds | null | "unsaid" {
  const rounds =
    effect.duration?.unit === "round" ? effect.duration.amount : effect.duration?.unit === "minute" && effect.duration.amount !== null ? effect.duration.amount * ROUNDS_PER_MINUTE : null;
  const repeat = effect.repeat_save;
  if (repeat !== null) {
    // `SaveEnds` has a repeat save at the start or the end of the bearer's turn and nothing for "when it takes damage"
    // or "as an action", so such a spell gets no conditions at all rather than a different rule.
    if (repeat.when !== "end_of_its_turn" && repeat.when !== "start_of_its_turn") return "unsaid";
    // The DC is left out on purpose: it is filled in with the save's own when the condition is applied.
    return { kind: "save", at: repeat.when === "end_of_its_turn" ? "end" : "start", ability: repeat.ability.toLowerCase() as SaveAbility, ...(rounds !== null ? { remaining: rounds } : {}) };
  }
  return rounds === null ? null : { kind: "rounds", remaining: rounds };
}

type Parts = { parts: DamagePart[]; half: boolean | null } | { why: string };

/** The record's damage at this cast, split into what an outcome deals. `half` is whether a successful save still takes half. */
function damageOf(record: SpellRecord, castLevel: number, casterLevel: number, save: boolean): Parts {
  const damaging = (record.effects ?? []).filter((e) => e.kind === "damage");
  const raw: DamagePart[] = [];
  let half: boolean | null = save ? false : null;

  if (damaging.length > 0) {
    if (damaging.some((e) => e.instances)) return { why: `${record.name} fires several rays, darts or beams, which the rules do not roll yet.` };
    if (damaging.some((e) => e.phase !== "impact")) return { why: `${record.name} deals damage later in its duration, which the rules do not roll yet.` };
    if (damaging.some((e) => e.modifier !== null && e.modifier !== undefined)) return { why: `${record.name} adds the caster's spellcasting modifier, which the creature's stat block does not give.` };
    const cast: StructuredSpellEffect[] = effectsForCast(damaging, record.level, castLevel, casterLevel);
    const dealt = save ? "failed_save" : "hit";
    for (const e of cast) {
      if (e.outcome === dealt && e.multiplier === 1 && e.dice) {
        const type = e.damageType === null ? null : e.damageType.toLowerCase();
        if (type !== null && !isDamageType(type)) return { why: `${record.name} deals "${e.damageType}" damage, which is not a damage type the rules know.` };
        raw.push({ dice: e.dice.replace(/\s+/g, ""), type });
      } else if (save && e.outcome === "successful_save") {
        if (e.multiplier === 0.5) half = true;
        else if (e.multiplier !== 0) return { why: `${record.name} takes ${e.multiplier} of its damage on a successful save, which the rules do not roll yet.` };
      } else {
        return { why: `${record.name} has a ${e.outcome} damage effect the rules do not roll yet.` };
      }
    }
    return { parts: raw, half };
  }

  // No structured effect: the flat columns, grown by the shared rule.
  for (const roll of castDamageRolls(record, castLevel, casterLevel)) {
    const type = roll.type.trim() === "" ? null : roll.type.trim().toLowerCase();
    if (type !== null && !isDamageType(type)) return { why: `${record.name} deals "${roll.type}" damage, which is not a damage type the rules know.` };
    raw.push({ dice: roll.dice.replace(/\s+/g, ""), type });
  }
  return { parts: raw, half: null };
}

/**
 * The cast as a stat-block entry, or the plain reason it is not one. `castLevel` is the slot the spell is cast with
 * (the spell's own level for innate casting, 0 for a cantrip). The caster brings its own spell attack bonus and save DC.
 */
export function spellEntryFor(record: SpellRecord, castLevel: number, caster: SpellCaster, options: SpellEntryOptions = {}): SpellEntry {
  if (castLevel < record.level) return no(`${record.name} is a level ${record.level} spell and cannot be cast with a level ${castLevel} slot.`);

  const kind = record.attack_type;
  if (kind === "automatic") return no(`${record.name} needs neither an attack roll nor a save, and the rules do not apply that kind of damage yet.`);
  const isAttack = kind === "ranged_spell" || kind === "melee_spell";
  if (!isAttack && kind !== "save") return no(`${record.name} has no attack roll or saving throw in its data.`);

  // A cantrip's step comes from the caster's level; without one it deals its base dice (level 1 is below the first step).
  const casterLevel = caster.casterLevel === undefined || caster.casterLevel === null ? 1 : caster.casterLevel;
  const dealt = damageOf(record, castLevel, casterLevel, !isAttack);
  if ("why" in dealt) return no(dealt.why);
  const conditions = isAttack ? [] : conditionsOf(record, options.kindsChecked === true);
  // A save that only imposes a condition (Hold Person) has no damage and is still resolvable.
  const conditionOnly = dealt.parts.length === 0 && conditions.length > 0;
  if (dealt.parts.length === 0 && !conditionOnly) {
    const heals = (record.healing_dice ?? "").trim() !== "" || (record.effects ?? []).some((e) => e.kind === "healing");
    return no(heals ? `${record.name} heals rather than harms, and the rules do not roll healing yet.` : `${record.name} has no damage in its data.`);
  }

  if (isAttack) {
    if (caster.attackBonus === null) return no(`The caster's stat block gives no spell attack bonus, so ${record.name} has nothing to roll.`);
    return {
      automatable: true,
      kind: "attack",
      entry: {
        name: record.name,
        description: "",
        structured: {
          kind: "attack",
          attack: { delivery: kind === "melee_spell" ? "melee" : "ranged", bonus: caster.attackBonus, hit: dealt.parts },
          source: "manual",
        },
      },
    };
  }

  if (caster.saveDc === null) return no(`The caster's stat block gives no spell save DC, so ${record.name} has no save to set.`);
  const ability = (record.save_attribute ?? "").toLowerCase();
  if (!isSaveAbility(ability)) return no(`${record.name} names no saving throw ability in its data.`);
  // A condition-only spell's save effect is "special" in the data, and the conditions say all there is to say.
  if (!conditionOnly) {
    if (record.save_effect === "special") return no(`${record.name} does something special on a save that the rules do not roll yet.`);
    if (record.save_effect !== "half" && record.save_effect !== "negates") return no(`${record.name} does not say what a successful save does.`);
  }
  // The record's own flat column and its effects must agree: a "half" spell whose effects take none is not provable.
  if (!conditionOnly && dealt.half !== null && dealt.half !== (record.save_effect === "half")) return no(`${record.name}'s save effect and its damage effects disagree about a successful save.`);
  return {
    automatable: true,
    kind: "save",
    entry: {
      name: record.name,
      description: "",
      structured: {
        kind: "save",
        save: { ability, dc: caster.saveDc, fail: dealt.parts, success: record.save_effect === "half" && !conditionOnly ? "half" : "none", conditions },
        source: "manual",
      },
    },
  };
}
