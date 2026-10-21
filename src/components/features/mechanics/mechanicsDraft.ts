import type {
  Activation,
  ChoiceCount,
  ChoicePick,
  DamageRider,
  EffectAdd,
  EffectKind,
  FeatureChoice,
  FeatureEffect,
  FeatureGrants,
  FeatureMechanics,
  FeatureToggle,
  FeatureUses,
  RiderDice,
  SubAction,
  UsesAmount,
} from "@/rules/features/mechanics.types";
import { ACTIVATIONS } from "@/rules/features/mechanics.types";
import { ACTIVATION_LABELS } from "@/types/feature.types";
import { ordinal } from "@/lib/ordinal";

/**
 * What a part of the mechanics editor starts as when the DM adds it, and how it
 * changes shape when they pick another kind. Every default is a value
 * `parseMechanics` accepts once the DM has filled in the blanks (a key and a
 * label), so "Add uses" never produces something the parser would reject for a
 * reason other than the empty fields the DM can see.
 */

export const ACTIVATION_OPTIONS: ReadonlyArray<{ value: Activation | ""; label: string }> = [
  { value: "", label: "Passive" },
  ...ACTIVATIONS.map((value) => ({ value, label: ACTIVATION_LABELS[value] })),
];

export function newUses(): FeatureUses {
  return { key: "", label: "", amount: { kind: "fixed", value: 1 }, recharge: "long", pool: false };
}

export function newRider(): DamageRider {
  return { label: "", dice: { kind: "fixed", expression: "" }, applies_to: "weapon", once_per_turn: false };
}

export function newToggle(): FeatureToggle {
  return { key: "", label: "", ends_on: "long_rest" };
}

export function newSubAction(): SubAction {
  return { name: "", activation: "action" };
}

export function newChoice(): FeatureChoice {
  return {
    key: "",
    label: "",
    pick: { kind: "option", set: "fighting_style" },
    count: { kind: "per_grant", amount: 1 },
    replace_on_level_up: false,
  };
}

// ── Kind switches ─────────────────────────────────────────────────────────────

export const AMOUNT_KINDS = [
  { value: "fixed", label: "A fixed number" },
  { value: "by_level", label: "Changes by level" },
  { value: "proficiency", label: "Proficiency bonus" },
  { value: "ability_mod", label: "Ability modifier" },
  { value: "class_level", label: "Class level times a number" },
  { value: "unlimited_from", label: "Unlimited from a level" },
] as const satisfies ReadonlyArray<{ value: UsesAmount["kind"]; label: string }>;

export function amountOfKind(kind: UsesAmount["kind"]): UsesAmount {
  switch (kind) {
    case "fixed": return { kind: "fixed", value: 1 };
    case "by_level": return { kind: "by_level", values: { "1": 1 } };
    case "proficiency": return { kind: "proficiency" };
    case "ability_mod": return { kind: "ability_mod", ability: "cha", min: 1 };
    case "class_level": return { kind: "class_level", multiplier: 1 };
    case "unlimited_from": return { kind: "unlimited_from", level: 20, below: { kind: "fixed", value: 1 } };
  }
}

export const RIDER_DICE_KINDS = [
  { value: "fixed", label: "A fixed roll" },
  { value: "scaling", label: "The feature's table value" },
  { value: "flat", label: "A flat amount from the character" },
  { value: "slot", label: "Grows with the spell slot" },
] as const satisfies ReadonlyArray<{ value: RiderDice["kind"]; label: string }>;

export function riderDiceOfKind(kind: RiderDice["kind"]): RiderDice {
  switch (kind) {
    case "fixed": return { kind: "fixed", expression: "" };
    case "scaling": return { kind: "scaling" };
    case "flat": return { kind: "flat", add: [{ kind: "ability", ability: "cha" }], min: 1 };
    case "slot": return { kind: "slot", base: "2d8", base_level: 1, per_level: "1d8", max_dice: 5 };
  }
}

export const PICK_KINDS = [
  { value: "option", label: "An entry from a list" },
  { value: "feat", label: "A feat" },
  { value: "asi_or_feat", label: "Ability Score Improvement or a feat" },
  { value: "expertise", label: "Expertise" },
  { value: "skill", label: "Skill proficiencies" },
  { value: "custom", label: "A list of your own" },
  { value: "spell", label: "Spells from a class list" },
] as const satisfies ReadonlyArray<{ value: ChoicePick["kind"]; label: string }>;

export function pickOfKind(kind: ChoicePick["kind"]): ChoicePick {
  switch (kind) {
    case "option": return { kind: "option", set: "fighting_style" };
    case "feat": return { kind: "feat", categories: null };
    case "asi_or_feat": return { kind: "asi_or_feat" };
    case "expertise": return { kind: "expertise", thieves_tools: false };
    case "skill": return { kind: "skill", from: [] };
    case "custom": return { kind: "custom", options: [] };
    case "spell": return { kind: "spell", lists: ["Wizard"], level: 0, free_cast: false };
  }
}

export const COUNT_KINDS = [
  { value: "per_grant", label: "More at every level that grants it" },
  { value: "known", label: "A running total by level" },
] as const satisfies ReadonlyArray<{ value: ChoiceCount["kind"]; label: string }>;

export function countOfKind(kind: ChoiceCount["kind"]): ChoiceCount {
  return kind === "per_grant" ? { kind: "per_grant", amount: 1 } : { kind: "known", values: { "1": 1 } };
}

// ── Whole-mechanics edits ─────────────────────────────────────────────────────

/** `mechanics` with one top-level part set, or removed when `value` is undefined. */
export function withPart<K extends keyof FeatureMechanics>(
  mechanics: FeatureMechanics,
  key: K,
  value: FeatureMechanics[K] | undefined,
): FeatureMechanics {
  const next: FeatureMechanics = { ...mechanics };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** Drops list parts that were emptied, so "remove the last rider" removes the rider section. */
export function tidyMechanics(mechanics: FeatureMechanics): FeatureMechanics {
  const next: FeatureMechanics = { ...mechanics };
  if (next.riders && next.riders.length === 0) delete next.riders;
  if (next.actions && next.actions.length === 0) delete next.actions;
  if (next.choices && next.choices.length === 0) delete next.choices;
  if (next.grants) {
    const grants = { ...next.grants };
    if (grants.skills && grants.skills.length === 0) delete grants.skills;
    if (grants.tools && grants.tools.length === 0) delete grants.tools;
    if (grants.languages && grants.languages.length === 0) delete grants.languages;
    if (Object.keys(grants).length === 0) delete next.grants;
    else next.grants = grants;
  }
  return next;
}

// ── Spell picks ───────────────────────────────────────────────────────────────

type SpellPick = Extract<ChoicePick, { kind: "spell" }>;

/** The classes whose spell lists a pick can draw from, in the order they are offered. */
export const SPELL_LIST_CLASSES = ["Artificer", "Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"] as const;

export const SPELL_LEVEL_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: "Cantrips" },
  ...Array.from({ length: 9 }, (_, i) => ({ value: i + 1, label: ordinal(i + 1) })),
];

/** The standard lists, then any other name already on the pick (a homebrew class), each once. */
export function spellListChoices(lists: readonly string[]): string[] {
  const extra = lists.filter((l) => !(SPELL_LIST_CLASSES as readonly string[]).includes(l));
  return [...SPELL_LIST_CLASSES, ...new Set(extra)];
}

/** Ticks or unticks a list. The last list cannot be removed: a pick with no list offers nothing. */
export function toggleSpellList(pick: SpellPick, list: string, on: boolean): SpellPick {
  const rest = pick.lists.filter((l) => l !== list);
  const lists = on ? [...rest, list] : rest;
  return lists.length === 0 ? pick : { ...pick, lists };
}

/** Adds a class name's list, trimmed; blank or already present leaves the pick as it was. */
export function addSpellList(pick: SpellPick, name: string): SpellPick {
  const trimmed = name.trim();
  if (trimmed === "") return pick;
  if (pick.lists.some((l) => l.toLowerCase() === trimmed.toLowerCase())) return pick;
  return { ...pick, lists: [...pick.lists, trimmed] };
}

/** Cantrips are never cast "for free", so switching to level 0 clears that. */
export function setSpellLevel(pick: SpellPick, level: number): SpellPick {
  return { ...pick, level, free_cast: level === 0 ? false : pick.free_cast };
}

// ── Granted proficiencies ─────────────────────────────────────────────────────

/** The starting value for the "Proficiencies granted" part; `tidyMechanics` drops it again if left empty. */
export function newGrants(): FeatureGrants {
  return {};
}

// ── Rolls ─────────────────────────────────────────────────────────────────────

export const EFFECT_KIND_OPTIONS = [
  { value: "attack", label: "An attack roll" },
  { value: "save", label: "A saving throw it forces" },
  { value: "damage", label: "Damage" },
  { value: "heal", label: "Healing" },
  { value: "temp_hp", label: "Temporary hit points" },
] as const satisfies ReadonlyArray<{ value: EffectKind; label: string }>;

/** A new roll of one kind, with the block that kind needs; the dice are blank until the DM types them. */
export function effectOfKind(kind: EffectKind, from?: FeatureEffect): FeatureEffect {
  const next: FeatureEffect = { kind };
  // What the kinds share carries over when the DM changes their mind.
  if (from?.dice) next.dice = from.dice;
  if (from?.add) next.add = from.add;
  if (from?.min !== undefined) next.min = from.min;
  if (from?.area !== undefined) next.area = from.area;
  if (from?.damage_type !== undefined && kind !== "heal" && kind !== "temp_hp") next.damage_type = from.damage_type;
  if (kind === "attack") next.attack = from?.attack ?? { delivery: "melee", ability: "str" };
  if (kind === "save") next.save = from?.save ?? { ability: "dex", dc_ability: "spell", success: "half" };
  if (kind === "attack" && from?.kind === "attack" && from.save) next.save = from.save;
  if ((kind === "damage" || kind === "heal" || kind === "temp_hp") && !next.dice) next.dice = { "1": "" };
  return next;
}

export function newEffect(): FeatureEffect {
  return effectOfKind("save");
}

/** An attack or save "deals damage" while it has dice; turning it off drops the dice and everything about them. */
export function withDamage(effect: FeatureEffect, on: boolean): FeatureEffect {
  const { dice: _dice, damage_type: _type, add: _add, min: _min, ...rest } = effect;
  return on ? { ...rest, dice: { "1": "" } } : rest;
}

/** An attack whose hit forces a saving throw (a poisoned blade) carries both blocks. */
export function withForcedSave(effect: FeatureEffect, on: boolean): FeatureEffect {
  const { save: _save, ...rest } = effect;
  return on ? { ...rest, save: { ability: "con", dc_ability: "str", success: "none" } } : rest;
}

export function hasAdd(effect: FeatureEffect, add: EffectAdd): boolean {
  return (effect.add ?? []).some((a) => a.kind === add.kind && (a.kind !== "ability" || (add.kind === "ability" && a.ability === add.ability)));
}

/** Ticks or unticks one addend; an emptied list is dropped so the stored effect stays minimal. */
export function toggleAdd(effect: FeatureEffect, add: EffectAdd, on: boolean): FeatureEffect {
  const kept = (effect.add ?? []).filter((a) => !(a.kind === add.kind && (a.kind !== "ability" || (add.kind === "ability" && a.ability === add.ability))));
  const list = on ? [...kept, add] : kept;
  const { add: _add, ...rest } = effect;
  // A fixed amount (no dice) is nothing but its addends, so the last one stays.
  if (list.length === 0 && !effect.dice) return effect;
  return list.length > 0 ? { ...rest, add: list } : rest;
}

/** Sets or clears the floor on a total; a blank or non-numeric entry clears it. */
export function withMin(effect: FeatureEffect, value: string): FeatureEffect {
  const { min: _min, ...rest } = effect;
  const n = Number(value);
  return value.trim() === "" || !Number.isInteger(n) || n < 0 ? rest : { ...rest, min: n };
}

/** A flat rider with one addend ticked or unticked (at least one stays, since an empty flat rider adds nothing). */
export function toggleFlatAdd(dice: Extract<RiderDice, { kind: "flat" }>, add: EffectAdd, on: boolean): Extract<RiderDice, { kind: "flat" }> {
  const same = (a: EffectAdd) => a.kind === add.kind && (a.kind !== "ability" || (add.kind === "ability" && a.ability === add.ability));
  const kept = dice.add.filter((a) => !same(a));
  const list = on ? [...kept, add] : kept;
  return list.length > 0 ? { ...dice, add: list } : dice;
}

/** Sets or clears a flat rider's floor. */
export function withFlatMin(dice: Extract<RiderDice, { kind: "flat" }>, value: string): Extract<RiderDice, { kind: "flat" }> {
  const { min: _min, ...rest } = dice;
  const n = Number(value);
  return value.trim() === "" || !Number.isInteger(n) || n < 0 ? rest : { ...rest, min: n };
}

/** Whether a heal, temporary hit points or damage effect rolls dice (otherwise its amount is only what it adds). */
export function rollsDice(effect: FeatureEffect): boolean {
  return effect.dice !== undefined;
}

/**
 * "No dice (a fixed amount)" for heal, temp HP and damage. Off drops the dice and
 * leaves the addends as the amount (proficiency bonus if none were ticked, since an
 * amount of nothing is not an effect); on starts blank dice again.
 */
export function withDice(effect: FeatureEffect, on: boolean): FeatureEffect {
  if (on) return effect.dice ? effect : { ...effect, dice: { "1": "" } };
  const { dice: _dice, ...rest } = effect;
  return { ...rest, add: effect.add && effect.add.length > 0 ? effect.add : [{ kind: "proficiency" }] };
}
