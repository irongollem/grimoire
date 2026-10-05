import type { AbilityKey } from "@/rules/characterCreation";
import { optionsFor, type ChoiceOption, type DueChoice, type OptionContext } from "@/rules/features/levelUpChoices";
import { parseFeatAbilityIncrease } from "@/rules/features/mechanics";
import type { FeatAbilityIncrease } from "@/rules/features/mechanics.types";
import type { ClassFeature } from "@/types/feature.types";

/**
 * What a player has chosen for one `DueChoice` (#976). Plain data so the picker
 * can be a controlled component and the level-up wizard can resolve every
 * choice into one `LevelChoiceRecord` without asking the components anything.
 */

export type AsiMode = "plus2" | "plus1plus1" | "feat";

export interface AsiPick {
  mode: AsiMode;
  primary: AbilityKey | null;
  secondary: AbilityKey | null;
}

export interface AbilityPick {
  primary: AbilityKey | null;
  secondary: AbilityKey | null;
}

export interface ChoiceValue {
  /** Option values; feat ids for a feat pick (and for the feat half of an ASI). */
  picks: string[];
  /** One earlier pick swapped for a new one, when the entry allows it. */
  replace: { from: string; to: string } | null;
  /** Only for `asi_or_feat`. */
  asi: AsiPick | null;
  /** The ability the picked feat raises, when it raises one. */
  ability: AbilityPick;
}

export function emptyChoiceValue(): ChoiceValue {
  return { picks: [], replace: null, asi: null, ability: { primary: null, secondary: null } };
}

/** A fresh value for an entry: an Ability Score Improvement starts on its first form. */
export function initialChoiceValue(due: DueChoice): ChoiceValue {
  const value = emptyChoiceValue();
  if (due.choice.pick.kind === "asi_or_feat") value.asi = { mode: "plus2", primary: null, secondary: null };
  return value;
}

/** Key of a due entry in the wizard's value map. */
export function dueKey(due: Pick<DueChoice, "featureId" | "choice">): string {
  return `${due.featureId}:${due.choice.key}`;
}

export function featIncrease(feat: ClassFeature | undefined): FeatAbilityIncrease | null {
  return feat === undefined ? null : parseFeatAbilityIncrease(feat.ability_increase);
}

/** The feat an entry's picks name, whichever way the entry takes a feat. */
export function pickedFeatId(due: DueChoice, value: ChoiceValue): string | null {
  const takesFeat = due.choice.pick.kind === "feat" || (value.asi !== null && value.asi.mode === "feat");
  return takesFeat && value.picks.length > 0 ? value.picks[0] : null;
}

/**
 * True once the entry holds everything it owes. A replacement is optional but,
 * once started, must name both ends.
 *
 * `selectable` is how many options can still be picked: a short list must not
 * wedge Confirm for a pick nobody could make.
 */
export function isChoiceComplete(
  due: DueChoice,
  value: ChoiceValue,
  featsById: ReadonlyMap<string, ClassFeature>,
  selectable: number,
): boolean {
  if (value.replace !== null && (value.replace.from === "" || value.replace.to === "")) return false;
  const pick = due.choice.pick;
  if (pick.kind === "asi_or_feat") {
    const asi = value.asi;
    if (asi === null) return false;
    if (asi.mode === "plus2") return asi.primary !== null;
    if (asi.mode === "plus1plus1") return asi.primary !== null && asi.secondary !== null && asi.primary !== asi.secondary;
    return featPicked(value, featsById, 1);
  }
  if (pick.kind === "feat") return featPicked(value, featsById, Math.min(due.picks, selectable));
  return value.picks.length >= Math.min(due.picks, selectable);
}

function featPicked(value: ChoiceValue, featsById: ReadonlyMap<string, ClassFeature>, needed: number): boolean {
  if (value.picks.length < needed) return false;
  const increase = featIncrease(featsById.get(value.picks[0]));
  return increase === null || value.ability.primary !== null;
}

/** Whether the entry is taking a feat right now: a feat pick, or an Ability Score Improvement set to Feat. */
export function entryTakesFeat(due: DueChoice, value: ChoiceValue): boolean {
  return due.choice.pick.kind === "feat" || (value.asi !== null && value.asi.mode === "feat");
}

/** The options an entry lists. An Ability Score Improvement lists feats only once it takes one. */
export function optionsForDue(due: DueChoice, value: ChoiceValue, context: Omit<OptionContext, "existing">): ChoiceOption[] {
  const pick = due.choice.pick;
  const ctx: OptionContext = { ...context, existing: due.existing };
  if (pick.kind === "asi_or_feat") {
    return entryTakesFeat(due, value) ? optionsFor({ kind: "feat", categories: null }, ctx) : [];
  }
  return optionsFor(pick, ctx);
}

/** Completeness of one entry against its own option list. */
export function entryComplete(
  due: DueChoice,
  value: ChoiceValue,
  context: Omit<OptionContext, "existing">,
  featsById: ReadonlyMap<string, ClassFeature>,
): boolean {
  const selectable = optionsForDue(due, value, context).filter((o) => o.unavailable === null).length;
  return isChoiceComplete(due, value, featsById, selectable);
}
