import type { FeatureGrants, FeatureMechanics } from "@/rules/features/mechanics.types";
import { SKILLS } from "@/types/party.types";

/** What a character picked for one of a feature's choices, ready to show. */
export interface FeaturePick {
  key: string;
  label: string;
  values: string[];
}

/** How an id-shaped stored value becomes a name; null while it has not resolved. */
export interface PickNames {
  /** Feature ids: a feat taken at an Ability Score Improvement, an invocation. */
  feature: (id: string) => string | null;
  /** Spell ids: library ids (`srd_srd_fire_bolt`) and homebrew UUIDs alike. */
  spell: (id: string) => string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function valuesOf(stored: unknown): string[] {
  if (typeof stored === "string") return stored === "" ? [] : [stored];
  if (Array.isArray(stored)) return stored.filter((v): v is string => typeof v === "string" && v !== "");
  return [];
}

/**
 * The picks a feature's choices hold in `class_choices`. A feature-id value shows
 * as that feature's name and a spell pick's values (any shape of id, a homebrew
 * spell's UUID included) as spell names; one that has not resolved yet is left
 * out rather than shown as an id a player cannot read.
 */
export function picksFor(
  mechanics: FeatureMechanics,
  classChoices: Record<string, unknown>,
  names: PickNames,
): FeaturePick[] {
  const picks: FeaturePick[] = [];
  for (const choice of mechanics.choices ?? []) {
    const isSpell = choice.pick.kind === "spell";
    const values = valuesOf(classChoices[choice.key]).flatMap((value) => {
      if (isSpell) {
        const name = names.spell(value);
        return name === null ? [] : [name];
      }
      if (!UUID_RE.test(value)) return [value];
      const name = names.feature(value);
      return name === null ? [] : [name];
    });
    if (values.length > 0) picks.push({ key: choice.key, label: choice.label, values });
  }
  return picks;
}

/** What a feature gives outright, as one row: skills, tools and languages together. */
export function grantsPick(mechanics: FeatureMechanics): FeaturePick | null {
  const grants: FeatureGrants | undefined = mechanics.grants;
  if (grants === undefined) return null;
  const skills = (grants.skills ?? []).map((key) => SKILLS.find((s) => s.key === key)?.label ?? key);
  const values = [...skills, ...(grants.tools ?? []), ...(grants.languages ?? [])];
  return values.length === 0 ? null : { key: "grants", label: "Proficiency", values };
}

/** Every feature-id pick across these mechanics, so the caller can fetch the names. */
export function pickIdsOf(
  mechanicsList: readonly FeatureMechanics[],
  classChoices: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  for (const mechanics of mechanicsList) {
    for (const choice of mechanics.choices ?? []) {
      if (choice.pick.kind === "spell") continue;
      for (const value of valuesOf(classChoices[choice.key])) if (UUID_RE.test(value)) ids.add(value);
    }
  }
  return [...ids];
}

/** Every spell id a spell pick holds, so the caller can fetch the spell names. */
export function spellPickIdsOf(
  mechanicsList: readonly FeatureMechanics[],
  classChoices: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  for (const mechanics of mechanicsList) {
    for (const choice of mechanics.choices ?? []) {
      if (choice.pick.kind !== "spell") continue;
      for (const value of valuesOf(classChoices[choice.key])) ids.add(value);
    }
  }
  return [...ids];
}
