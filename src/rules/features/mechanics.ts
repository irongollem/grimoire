import type { AbilityKey } from "@/rules/characterCreation";
import type { SkillKey } from "@/data/classSkillChoices";
import { parseExpression } from "@/lib/dice/dice";
import {
  ACTIVATIONS,
  FEAT_CATEGORIES,
  OPTION_SETS,
  RECHARGES,
  RIDER_TARGETS,
  type Activation,
  type ByLevel,
  type ChoiceCount,
  type ChoicePick,
  type DamageRider,
  type FeatAbilityIncrease,
  type FeatCategory,
  type FeatPrerequisites,
  type FeatureChoice,
  type FeatureMechanics,
  type FeatureScaling,
  type FeatureToggle,
  type FeatureUses,
  type OptionSet,
  type RiderDice,
  type RiderTarget,
  type SubAction,
  type UsesAmount,
  type UsesCost,
} from "./mechanics.types";

/**
 * Validation of `class_features.mechanics` jsonb (#976). The column is
 * written by the admin import and by homebrew editors, and read by the sheet,
 * the roller and level-up, so a malformed row must degrade to "that part does
 * nothing" with a message for the editor, never throw into a render.
 */

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const satisfies readonly AbilityKey[];
const ARMOR_KINDS = ["light", "medium", "heavy", "shield"] as const;
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMember<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

function isDice(value: unknown): value is string {
  return typeof value === "string" && parseExpression(value) !== null;
}

/** Keys must be integer strings 1-20 exactly ("03" and "3.0" are not levels). */
function parseByLevel<T>(
  value: unknown,
  path: string,
  errors: string[],
  valid: (v: unknown) => v is T,
  what: string,
): ByLevel<T> | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object keyed by level`);
    return null;
  }
  const out: ByLevel<T> = {};
  for (const [key, v] of Object.entries(value)) {
    if (!/^(?:[1-9]|1\d|20)$/.test(key)) {
      errors.push(`${path}: '${key}' is not a level from 1 to 20`);
      continue;
    }
    if (!valid(v)) {
      errors.push(`${path}.${key}: expected ${what}`);
      continue;
    }
    out[key] = v;
  }
  if (Object.keys(out).length === 0) {
    errors.push(`${path}: no valid levels`);
    return null;
  }
  return out;
}

function parseBaseAmount(
  value: unknown,
  path: string,
  errors: string[],
): Exclude<UsesAmount, { kind: "unlimited_from" }> | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  switch (value.kind) {
    case "fixed":
      if (!isCount(value.value)) {
        errors.push(`${path}.value: expected a non-negative whole number`);
        return null;
      }
      return { kind: "fixed", value: value.value };
    case "by_level": {
      const values = parseByLevel(value.values, `${path}.values`, errors, isCount, "a non-negative whole number");
      return values ? { kind: "by_level", values } : null;
    }
    case "proficiency":
      return { kind: "proficiency" };
    case "ability_mod":
      if (!isMember(ABILITY_KEYS, value.ability)) {
        errors.push(`${path}.ability: unknown ability '${String(value.ability)}'`);
        return null;
      }
      if (!isCount(value.min)) {
        errors.push(`${path}.min: expected a non-negative whole number`);
        return null;
      }
      if (value.bonus === undefined) return { kind: "ability_mod", ability: value.ability, min: value.min };
      // The bonus may be negative; only a non-integer is malformed.
      if (typeof value.bonus !== "number" || !Number.isInteger(value.bonus)) {
        errors.push(`${path}.bonus: expected a whole number`);
        return null;
      }
      return { kind: "ability_mod", ability: value.ability, min: value.min, bonus: value.bonus };
    case "class_level":
      if (!isCount(value.multiplier) || value.multiplier < 1) {
        errors.push(`${path}.multiplier: expected a whole number of at least 1`);
        return null;
      }
      return { kind: "class_level", multiplier: value.multiplier };
    case "unlimited_from":
      errors.push(`${path}: unlimited_from cannot be nested inside unlimited_from`);
      return null;
    default:
      errors.push(`${path}: unknown kind '${String(value.kind)}'`);
      return null;
  }
}

function parseAmount(value: unknown, path: string, errors: string[]): UsesAmount | null {
  if (isRecord(value) && value.kind === "unlimited_from") {
    if (!isLevel(value.level)) {
      errors.push(`${path}.level: expected a level from 1 to 20`);
      return null;
    }
    const below = parseBaseAmount(value.below, `${path}.below`, errors);
    return below ? { kind: "unlimited_from", level: value.level, below } : null;
  }
  return parseBaseAmount(value, path, errors);
}

/** A spend from a pool by key. A bad one is dropped (the thing is then free), with a message for the editor. */
function parseUsesCost(value: unknown, path: string, errors: string[]): UsesCost | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  if (!isKey(value.key)) {
    errors.push(`${path}.key: must be lowercase letters, digits and underscores, starting with a letter`);
    return null;
  }
  if (typeof value.amount !== "number" || !Number.isInteger(value.amount) || value.amount < 1) {
    errors.push(`${path}.amount: expected a whole number of at least 1`);
    return null;
  }
  return { key: value.key, amount: value.amount };
}

function parseUses(value: unknown, errors: string[]): FeatureUses | null {
  const path = "uses";
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  if (!isKey(value.key)) {
    errors.push(`${path}.key: must be lowercase letters, digits and underscores, starting with a letter`);
    return null;
  }
  if (!isNonEmptyString(value.label)) {
    errors.push(`${path}.label: expected a non-empty label`);
    return null;
  }
  if (!isMember(RECHARGES, value.recharge)) {
    errors.push(`${path}.recharge: unknown recharge '${String(value.recharge)}'`);
    return null;
  }
  const amount = parseAmount(value.amount, `${path}.amount`, errors);
  if (!amount) return null;
  if (typeof value.pool !== "boolean") {
    errors.push(`${path}.pool: expected true or false`);
    return null;
  }
  const uses: FeatureUses = {
    key: value.key,
    label: value.label,
    amount,
    recharge: value.recharge,
    pool: value.pool,
  };
  if (value.recharge_from !== undefined) {
    const rf = value.recharge_from;
    if (isRecord(rf) && isLevel(rf.level) && isMember(RECHARGES, rf.recharge)) {
      uses.recharge_from = { level: rf.level, recharge: rf.recharge };
    } else {
      errors.push(`${path}.recharge_from: expected { level: 1-20, recharge }`);
    }
  }
  if (value.short_rest_regain !== undefined) {
    if (isCount(value.short_rest_regain)) uses.short_rest_regain = value.short_rest_regain;
    else errors.push(`${path}.short_rest_regain: expected a non-negative whole number`);
  }
  return uses;
}

function parseScaling(value: unknown, errors: string[]): FeatureScaling | null {
  if (!isRecord(value)) {
    errors.push("scaling: expected an object");
    return null;
  }
  if (!isNonEmptyString(value.label)) {
    errors.push("scaling.label: expected a non-empty label");
    return null;
  }
  // Display values ("+2", "d8", "3d6"): not necessarily rollable, so any text is fine.
  const values = parseByLevel(value.values, "scaling.values", errors, isNonEmptyString, "a non-empty string");
  return values ? { label: value.label, values } : null;
}

function parseRiderDice(value: unknown, path: string, errors: string[]): RiderDice | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  switch (value.kind) {
    case "scaling":
      return { kind: "scaling" };
    case "fixed":
      if (!isDice(value.expression)) {
        errors.push(`${path}.expression: not a dice expression`);
        return null;
      }
      return { kind: "fixed", expression: value.expression };
    case "slot":
      if (!isDice(value.base)) {
        errors.push(`${path}.base: not a dice expression`);
        return null;
      }
      if (!isDice(value.per_level)) {
        errors.push(`${path}.per_level: not a dice expression`);
        return null;
      }
      if (!isLevel(value.base_level) || value.base_level > 9) {
        errors.push(`${path}.base_level: expected a spell slot level from 1 to 9`);
        return null;
      }
      if (!isCount(value.max_dice) || value.max_dice < 1) {
        errors.push(`${path}.max_dice: expected a whole number of at least 1`);
        return null;
      }
      return {
        kind: "slot",
        base: value.base,
        base_level: value.base_level,
        per_level: value.per_level,
        max_dice: value.max_dice,
      };
    default:
      errors.push(`${path}: unknown kind '${String(value.kind)}'`);
      return null;
  }
}

function parseRider(value: unknown, path: string, errors: string[], toggleKey: string | null): DamageRider | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  if (!isNonEmptyString(value.label)) {
    errors.push(`${path}.label: expected a non-empty label`);
    return null;
  }
  if (!isMember(RIDER_TARGETS, value.applies_to)) {
    errors.push(`${path}.applies_to: unknown target '${String(value.applies_to)}'`);
    return null;
  }
  const applies_to: RiderTarget = value.applies_to;
  if (typeof value.once_per_turn !== "boolean") {
    errors.push(`${path}.once_per_turn: expected true or false`);
    return null;
  }
  const dice = parseRiderDice(value.dice, `${path}.dice`, errors);
  if (!dice) return null;
  const rider: DamageRider = { label: value.label, dice, applies_to, once_per_turn: value.once_per_turn };
  if (value.damage_type !== undefined) {
    if (isNonEmptyString(value.damage_type)) rider.damage_type = value.damage_type;
    else errors.push(`${path}.damage_type: expected a non-empty string`);
  }
  if (value.requires_toggle !== undefined) {
    // A rider gated on a toggle the feature does not own could never be switched on.
    if (toggleKey !== null && value.requires_toggle === toggleKey) rider.requires_toggle = value.requires_toggle;
    else {
      errors.push(`${path}.requires_toggle: '${String(value.requires_toggle)}' is not this feature's toggle`);
      return null;
    }
  }
  if (value.cost !== undefined) {
    const cost = value.cost;
    if (isRecord(cost) && cost.kind === "spell_slot") rider.cost = { kind: "spell_slot" };
    else if (isRecord(cost) && cost.kind === "uses") {
      const spent = parseUsesCost(cost, `${path}.cost`, errors);
      if (spent) rider.cost = { kind: "uses", ...spent };
    } else errors.push(`${path}.cost: expected spell_slot or uses`);
  }
  return rider;
}

function parseToggle(value: unknown, errors: string[]): FeatureToggle | null {
  if (!isRecord(value)) {
    errors.push("toggle: expected an object");
    return null;
  }
  if (!isKey(value.key)) {
    errors.push("toggle.key: must be lowercase letters, digits and underscores, starting with a letter");
    return null;
  }
  if (!isNonEmptyString(value.label)) {
    errors.push("toggle.label: expected a non-empty label");
    return null;
  }
  if (value.ends_on !== "short_rest" && value.ends_on !== "long_rest") {
    errors.push(`toggle.ends_on: unknown value '${String(value.ends_on)}'`);
    return null;
  }
  const toggle: FeatureToggle = { key: value.key, label: value.label, ends_on: value.ends_on };
  if (value.spends !== undefined) {
    const spends = parseUsesCost(value.spends, "toggle.spends", errors);
    if (spends) toggle.spends = spends;
  }
  return toggle;
}

function parseActions(value: unknown, errors: string[]): SubAction[] | null {
  if (!Array.isArray(value)) {
    errors.push("actions: expected a list");
    return null;
  }
  const out: SubAction[] = [];
  value.forEach((item, i) => {
    const path = `actions[${i}]`;
    if (!isRecord(item)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    if (!isNonEmptyString(item.name)) {
      errors.push(`${path}.name: expected a non-empty name`);
      return;
    }
    if (!isMember(ACTIVATIONS, item.activation)) {
      errors.push(`${path}.activation: unknown activation '${String(item.activation)}'`);
      return;
    }
    const action: SubAction = { name: item.name, activation: item.activation };
    if (item.spends !== undefined) {
      const spends = parseUsesCost(item.spends, `${path}.spends`, errors);
      if (spends) action.spends = spends;
    }
    out.push(action);
  });
  return out.length > 0 ? out : null;
}

function parsePick(value: unknown, path: string, errors: string[]): ChoicePick | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  switch (value.kind) {
    case "feat": {
      if (value.categories === null) return { kind: "feat", categories: null };
      if (!Array.isArray(value.categories)) {
        errors.push(`${path}.categories: expected a list or null`);
        return null;
      }
      const categories: FeatCategory[] = [];
      for (const c of value.categories) {
        if (isMember(FEAT_CATEGORIES, c)) categories.push(c);
        else errors.push(`${path}.categories: unknown category '${String(c)}'`);
      }
      return categories.length > 0 ? { kind: "feat", categories } : null;
    }
    case "asi_or_feat":
      return { kind: "asi_or_feat" };
    case "expertise":
      if (typeof value.thieves_tools !== "boolean") {
        errors.push(`${path}.thieves_tools: expected true or false`);
        return null;
      }
      return { kind: "expertise", thieves_tools: value.thieves_tools };
    case "skill": {
      if (!Array.isArray(value.from)) {
        errors.push(`${path}.from: expected a list of skills`);
        return null;
      }
      // Skill keys are validated by shape only: the skill list is data, not part of this contract.
      const from: SkillKey[] = [];
      for (const s of value.from) {
        if (isKey(s)) from.push(s as SkillKey);
        else errors.push(`${path}.from: '${String(s)}' is not a skill key`);
      }
      return { kind: "skill", from };
    }
    case "option": {
      if (!isMember(OPTION_SETS, value.set)) {
        errors.push(`${path}.set: unknown option set '${String(value.set)}'`);
        return null;
      }
      const set: OptionSet = value.set;
      return { kind: "option", set };
    }
    case "custom": {
      const options = Array.isArray(value.options) ? value.options.filter(isNonEmptyString) : [];
      if (options.length === 0) {
        errors.push(`${path}.options: a custom pick needs at least one non-empty option`);
        return null;
      }
      return { kind: "custom", options };
    }
    default:
      errors.push(`${path}: unknown kind '${String(value.kind)}'`);
      return null;
  }
}

function parseCount(value: unknown, path: string, errors: string[]): ChoiceCount | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  if (value.kind === "per_grant") {
    if (!isCount(value.amount) || value.amount < 1) {
      errors.push(`${path}.amount: expected a whole number of at least 1`);
      return null;
    }
    return { kind: "per_grant", amount: value.amount };
  }
  if (value.kind === "known") {
    const values = parseByLevel(value.values, `${path}.values`, errors, isCount, "a non-negative whole number");
    return values ? { kind: "known", values } : null;
  }
  errors.push(`${path}: unknown kind '${String(value.kind)}'`);
  return null;
}

function parseChoices(value: unknown, errors: string[]): FeatureChoice[] | null {
  if (!Array.isArray(value)) {
    errors.push("choices: expected a list");
    return null;
  }
  const out: FeatureChoice[] = [];
  const seen = new Set<string>();
  value.forEach((item, i) => {
    const path = `choices[${i}]`;
    if (!isRecord(item)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    if (!isKey(item.key)) {
      errors.push(`${path}.key: must be lowercase letters, digits and underscores, starting with a letter`);
      return;
    }
    if (seen.has(item.key)) {
      errors.push(`${path}.key: '${item.key}' is used twice`);
      return;
    }
    if (!isNonEmptyString(item.label)) {
      errors.push(`${path}.label: expected a non-empty label`);
      return;
    }
    if (typeof item.replace_on_level_up !== "boolean") {
      errors.push(`${path}.replace_on_level_up: expected true or false`);
      return;
    }
    const pick = parsePick(item.pick, `${path}.pick`, errors);
    const count = parseCount(item.count, `${path}.count`, errors);
    if (!pick || !count) return;
    seen.add(item.key);
    out.push({ key: item.key, label: item.label, pick, count, replace_on_level_up: item.replace_on_level_up });
  });
  return out.length > 0 ? out : null;
}

export function parseMechanics(value: unknown): { mechanics: FeatureMechanics; errors: string[] } {
  const errors: string[] = [];
  const mechanics: FeatureMechanics = {};
  if (value === null || value === undefined) return { mechanics, errors };
  if (!isRecord(value)) {
    return { mechanics, errors: ["mechanics: expected an object"] };
  }

  if (value.activation !== undefined) {
    if (isMember(ACTIVATIONS, value.activation)) mechanics.activation = value.activation as Activation;
    else errors.push(`activation: unknown activation '${String(value.activation)}'`);
  }
  if (value.spends !== undefined) {
    const spends = parseUsesCost(value.spends, "spends", errors);
    if (spends) mechanics.spends = spends;
  }
  if (value.uses !== undefined) {
    const uses = parseUses(value.uses, errors);
    if (uses) mechanics.uses = uses;
  }
  if (value.scaling !== undefined) {
    const scaling = parseScaling(value.scaling, errors);
    if (scaling) mechanics.scaling = scaling;
  }
  if (value.toggle !== undefined) {
    const toggle = parseToggle(value.toggle, errors);
    if (toggle) mechanics.toggle = toggle;
  }
  if (value.riders !== undefined) {
    if (!Array.isArray(value.riders)) errors.push("riders: expected a list");
    else {
      const toggleKey = mechanics.toggle ? mechanics.toggle.key : null;
      const riders: DamageRider[] = [];
      value.riders.forEach((r, i) => {
        const rider = parseRider(r, `riders[${i}]`, errors, toggleKey);
        if (rider) riders.push(rider);
      });
      if (riders.length > 0) mechanics.riders = riders;
    }
  }
  if (value.actions !== undefined) {
    const actions = parseActions(value.actions, errors);
    if (actions) mechanics.actions = actions;
  }
  if (value.choices !== undefined) {
    const choices = parseChoices(value.choices, errors);
    if (choices) mechanics.choices = choices;
  }
  if (value.replaces !== undefined) {
    if (isNonEmptyString(value.replaces)) mechanics.replaces = value.replaces;
    else errors.push("replaces: expected a non-empty feature key");
  }
  return { mechanics, errors };
}

export function parseFeatPrerequisites(value: unknown): FeatPrerequisites | null {
  if (!isRecord(value)) return null;
  const pre: FeatPrerequisites = {};
  if (isLevel(value.level)) pre.level = value.level;
  if (isRecord(value.abilities) && isRecord(value.abilities.any_of)) {
    const any_of: Partial<Record<AbilityKey, number>> = {};
    for (const key of ABILITY_KEYS) {
      const score = value.abilities.any_of[key];
      if (typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 30) any_of[key] = score;
    }
    if (Object.keys(any_of).length > 0) pre.abilities = { any_of };
  }
  if (value.spellcasting === true) pre.spellcasting = true;
  if (isMember(ARMOR_KINDS, value.armor)) pre.armor = value.armor;
  if (value.fighting_style_feature === true) pre.fighting_style_feature = true;
  return Object.keys(pre).length > 0 ? pre : null;
}

export function parseFeatAbilityIncrease(value: unknown): FeatAbilityIncrease | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.abilities)) return null;
  const abilities: AbilityKey[] = [];
  for (const a of value.abilities) {
    if (isMember(ABILITY_KEYS, a) && !abilities.includes(a)) abilities.push(a);
  }
  if (abilities.length === 0) return null;
  if (typeof value.amount !== "number" || !Number.isInteger(value.amount) || value.amount < 1) return null;
  if (typeof value.split !== "boolean") return null;
  if (typeof value.max !== "number" || !Number.isInteger(value.max) || value.max < 1 || value.max > 30) return null;
  // A split needs two abilities to split across, and the +1/+1 form needs an amount of 2.
  if (value.split && (abilities.length < 2 || value.amount !== 2)) return null;
  return { abilities, amount: value.amount, split: value.split, max: value.max };
}
