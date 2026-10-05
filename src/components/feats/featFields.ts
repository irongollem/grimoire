import type { AbilityKey } from "@/rules/characterCreation";
import type {
  FeatAbilityIncrease,
  FeatCategory,
  FeatPrerequisites,
} from "@/rules/features/mechanics.types";
import { deepEqual } from "@/lib/utils";
import { parseFeatAbilityIncrease, parseFeatPrerequisites } from "@/rules/features/mechanics";

/** The columns only a feat has, as the editor holds them. */
export interface FeatFormFields {
  feat_category: FeatCategory | null;
  prerequisites: FeatPrerequisites | null;
  repeatable: boolean;
  ability_increase: FeatAbilityIncrease | null;
}

export const ARMORS = [
  { value: "light", label: "Light armor" },
  { value: "medium", label: "Medium armor" },
  { value: "heavy", label: "Heavy armor" },
  { value: "shield", label: "Shields" },
] as const satisfies ReadonlyArray<{ value: NonNullable<FeatPrerequisites["armor"]>; label: string }>;

/** A cleared number input is nothing, not zero. */
export function numberOrNothing(raw: unknown): number | undefined {
  if (raw === "" || raw === null || raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** `abilities` with one score set or cleared; none left means the whole condition goes. */
export function withAbilityScore(
  abilities: FeatPrerequisites["abilities"],
  key: AbilityKey,
  score: number | undefined,
): FeatPrerequisites["abilities"] {
  const any_of = { ...abilities?.any_of };
  if (score === undefined) delete any_of[key];
  else any_of[key] = score;
  return Object.keys(any_of).length > 0 ? { any_of } : undefined;
}

/**
 * What the stored feat columns would be if saved as they stand, plus a message for
 * each part the parser would silently drop. The editor saves the parsed values and
 * pauses on the messages, so a half-filled condition never loses data unseen.
 */
export function validateFeatFields(fields: FeatFormFields): { parsed: FeatFormFields; errors: string[] } {
  const errors: string[] = [];
  const prerequisites = fields.prerequisites === null ? null : parseFeatPrerequisites(fields.prerequisites);
  if (fields.prerequisites !== null && prerequisites === null) {
    errors.push("Prerequisites: set a value for each condition, or clear them.");
  } else if (prerequisites !== null && !deepEqual(prerequisites, fields.prerequisites)) {
    errors.push("Prerequisites: a value is out of range (levels 1 to 20, scores 1 to 30).");
  }
  const ability_increase = fields.ability_increase === null ? null : parseFeatAbilityIncrease(fields.ability_increase);
  if (fields.ability_increase !== null && ability_increase === null) {
    errors.push("Ability score increase: pick at least one ability and a maximum; a split needs two abilities and an amount of 2.");
  }
  return {
    parsed: { feat_category: fields.feat_category, prerequisites, repeatable: fields.repeatable, ability_increase },
    errors,
  };
}
