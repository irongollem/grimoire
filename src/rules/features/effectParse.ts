import { DAMAGE_TYPES } from "@/types/damage.types";
import { EFFECT_KINDS, type EffectAdd, type FeatureEffect } from "./mechanics.types";
import { ABILITY_KEYS, isCount, isDice, isMember, isNonEmptyString, isRecord, parseByLevel } from "./parsePrimitives";

/**
 * Parsing a feature's rollable `effect` (and the `add` lists a flat rider
 * shares with it) out of `class_features.mechanics`. Split from mechanics.ts,
 * which calls it for a feature and for each of its sub-actions.
 */

/** A flat number or a dice expression: what an effect rolls. */
export function isEffectDice(value: unknown): value is string {
  return isDice(value);
}

export function parseAdd(value: unknown, path: string, errors: string[]): EffectAdd | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  switch (value.kind) {
    case "ability":
      if (!isMember(ABILITY_KEYS, value.ability)) {
        errors.push(`${path}.ability: unknown ability '${String(value.ability)}'`);
        return null;
      }
      return { kind: "ability", ability: value.ability };
    case "proficiency":
      return { kind: "proficiency" };
    case "class_level":
      return { kind: "class_level" };
    default:
      errors.push(`${path}: unknown kind '${String(value.kind)}'`);
      return null;
  }
}

/** A non-empty list of adds, or null when none survive (bad items are reported and dropped). */
export function parseAddList(value: unknown, path: string, errors: string[]): EffectAdd[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected a list`);
    return null;
  }
  const add: EffectAdd[] = [];
  value.forEach((item, i) => {
    const parsed = parseAdd(item, `${path}[${i}]`, errors);
    if (parsed) add.push(parsed);
  });
  return add.length > 0 ? add : null;
}

/** A rollable effect. A bad one is dropped whole (the thing then rolls nothing), with a message for the editor. */
export function parseEffect(value: unknown, path: string, errors: string[]): FeatureEffect | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  if (!isMember(EFFECT_KINDS, value.kind)) {
    errors.push(`${path}.kind: unknown kind '${String(value.kind)}'`);
    return null;
  }
  const effect: FeatureEffect = { kind: value.kind };

  if (value.attack !== undefined) {
    const a = value.attack;
    if (!isRecord(a) || (a.delivery !== "melee" && a.delivery !== "ranged")) {
      errors.push(`${path}.attack: expected { delivery: melee or ranged, ability }`);
      return null;
    }
    if (a.ability !== "spell" && !isMember(ABILITY_KEYS, a.ability)) {
      errors.push(`${path}.attack.ability: expected an ability or 'spell'`);
      return null;
    }
    effect.attack = { delivery: a.delivery, ability: a.ability };
    if (a.range !== undefined) {
      if (isNonEmptyString(a.range)) effect.attack.range = a.range;
      else errors.push(`${path}.attack.range: expected a non-empty string`);
    }
  }
  if (value.save !== undefined) {
    const s = value.save;
    if (!isRecord(s) || !isMember(ABILITY_KEYS, s.ability)) {
      errors.push(`${path}.save: expected { ability, dc_ability, success }`);
      return null;
    }
    if (s.dc_ability !== "spell" && !isMember(ABILITY_KEYS, s.dc_ability)) {
      errors.push(`${path}.save.dc_ability: expected an ability or 'spell'`);
      return null;
    }
    if (s.success !== "half" && s.success !== "none") {
      errors.push(`${path}.save.success: expected 'half' or 'none'`);
      return null;
    }
    effect.save = { ability: s.ability, dc_ability: s.dc_ability, success: s.success };
  }
  if (value.dice !== undefined) {
    const dice = parseByLevel(value.dice, `${path}.dice`, errors, isEffectDice, "a dice expression or a number");
    if (!dice) return null;
    effect.dice = dice;
  }
  if (value.damage_type !== undefined) {
    if (isMember(DAMAGE_TYPES, value.damage_type)) effect.damage_type = value.damage_type;
    else errors.push(`${path}.damage_type: unknown damage type '${String(value.damage_type)}'`);
  }
  if (value.add !== undefined) {
    const add = parseAddList(value.add, `${path}.add`, errors);
    if (add) effect.add = add;
  }
  if (value.min !== undefined) {
    if (isCount(value.min)) effect.min = value.min;
    else errors.push(`${path}.min: expected a non-negative whole number`);
  }
  if (value.area !== undefined) {
    if (isNonEmptyString(value.area)) effect.area = value.area;
    else errors.push(`${path}.area: expected a non-empty string`);
  }

  // Each kind needs the block that makes it rollable.
  if (effect.kind === "attack" && !effect.attack) {
    errors.push(`${path}.attack: an attack effect needs an attack block`);
    return null;
  }
  if (effect.kind === "save" && !effect.save) {
    errors.push(`${path}.save: a save effect needs a save block`);
    return null;
  }
  if ((effect.kind === "heal" || effect.kind === "temp_hp" || effect.kind === "damage") && !effect.dice && !effect.add) {
    errors.push(`${path}.dice: a ${effect.kind === "temp_hp" ? "temporary hit point" : effect.kind} effect needs dice or something to add`);
    return null;
  }
  return effect;
}
