import type {
  Activation,
  ChoiceCount,
  ChoicePick,
  DamageRider,
  FeatureChoice,
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
  { value: "slot", label: "Grows with the spell slot" },
] as const satisfies ReadonlyArray<{ value: RiderDice["kind"]; label: string }>;

export function riderDiceOfKind(kind: RiderDice["kind"]): RiderDice {
  switch (kind) {
    case "fixed": return { kind: "fixed", expression: "" };
    case "scaling": return { kind: "scaling" };
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
  ...["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"].map((label, i) => ({ value: i + 1, label })),
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
