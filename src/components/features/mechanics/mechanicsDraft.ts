import type {
  Activation,
  ChoiceCount,
  ChoicePick,
  DamageRider,
  FeatureChoice,
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
] as const satisfies ReadonlyArray<{ value: ChoicePick["kind"]; label: string }>;

export function pickOfKind(kind: ChoicePick["kind"]): ChoicePick {
  switch (kind) {
    case "option": return { kind: "option", set: "fighting_style" };
    case "feat": return { kind: "feat", categories: null };
    case "asi_or_feat": return { kind: "asi_or_feat" };
    case "expertise": return { kind: "expertise", thieves_tools: false };
    case "skill": return { kind: "skill", from: [] };
    case "custom": return { kind: "custom", options: [] };
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
  return next;
}
