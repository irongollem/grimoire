import type { FeatureMechanics } from "@/rules/features/mechanics.types";

/** What a character picked for one of a feature's choices, ready to show. */
export interface FeaturePick {
  key: string;
  label: string;
  values: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function valuesOf(stored: unknown): string[] {
  if (typeof stored === "string") return stored === "" ? [] : [stored];
  if (Array.isArray(stored)) return stored.filter((v): v is string => typeof v === "string" && v !== "");
  return [];
}

/**
 * The picks a feature's choices hold in `class_choices`. A value that is a
 * feature id shows as that feature's name; one that has not resolved yet is
 * left out rather than shown as an id a player cannot read.
 */
export function picksFor(
  mechanics: FeatureMechanics,
  classChoices: Record<string, unknown>,
  nameOfId: (id: string) => string | null,
): FeaturePick[] {
  const picks: FeaturePick[] = [];
  for (const choice of mechanics.choices ?? []) {
    const values = valuesOf(classChoices[choice.key]).flatMap((value) => {
      if (!UUID_RE.test(value)) return [value];
      const name = nameOfId(value);
      return name === null ? [] : [name];
    });
    if (values.length > 0) picks.push({ key: choice.key, label: choice.label, values });
  }
  return picks;
}

/** Every id-shaped pick across these mechanics, so the caller can fetch the names. */
export function pickIdsOf(
  mechanicsList: readonly FeatureMechanics[],
  classChoices: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  for (const mechanics of mechanicsList) {
    for (const choice of mechanics.choices ?? []) {
      for (const value of valuesOf(classChoices[choice.key])) if (UUID_RE.test(value)) ids.add(value);
    }
  }
  return [...ids];
}
