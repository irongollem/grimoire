import type { ClassFeature } from "@/types/feature.types";
import type { RulesetKey } from "@/types/ruleset.types";

export const ASI_FEATURE_NAME = "Ability Score Improvement";

/** Both editions give a class its Ability Score Improvement at these levels. */
export const DEFAULT_ASI_LEVELS = [4, 8, 12, 16, 19] as const;

/**
 * The official Ability Score Improvement feature (#976): the one shared row a
 * class grants at each of its ASI levels, replacing the per-class `asi_levels`
 * list. The text is the same for every class of an edition, so any official row
 * of that edition serves; a row with no edition fits either.
 */
export function findOfficialAsiFeature(
  features: readonly ClassFeature[],
  ruleset: RulesetKey | null,
): ClassFeature | null {
  const wanted = ASI_FEATURE_NAME.toLowerCase();
  const matches = features.filter(
    (f) => f.user_id === null && f.kind === "feature" && f.name.trim().toLowerCase() === wanted,
  );
  return matches.find((f) => ruleset !== null && f.ruleset === ruleset)
    ?? matches.find((f) => !f.ruleset)
    ?? (ruleset === null ? (matches[0] ?? null) : null);
}

/** `features` with `featureId` granted at each of `levels`, leaving a level that already grants it alone. */
export function withFeatureAtLevels(
  features: Readonly<Record<string, string[]>>,
  featureId: string,
  levels: readonly number[],
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...features };
  for (const level of levels) {
    const key = String(level);
    const current = next[key] ?? [];
    if (!current.includes(featureId)) next[key] = [...current, featureId];
  }
  return next;
}
