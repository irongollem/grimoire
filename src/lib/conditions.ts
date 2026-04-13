import { SRD_CONDITIONS } from "@/data/srdConditions";
import type { Condition } from "@/types/condition.types";

export { SRD_CONDITIONS };
export type { Condition };

/**
 * List of conditions the app accepts as values in a creature's `conditions`
 * array. Grimoire splits Exhaustion into three named levels
 * (`"Exhausted 1"` / `"Exhausted 2"` / `"Exhausted 3"`) so the UI chip
 * carries the current level without a separate numeric field. The SRD
 * itself treats exhaustion as one condition with six levels; the baked
 * static data reflects the SRD text but the picker/storage uses these
 * split names.
 */
export const CONDITIONS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhausted 1",
  "Exhausted 2",
  "Exhausted 3",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
] as const;

export type ConditionName = (typeof CONDITIONS)[number];

/** Conditions that impose disadvantage on attack rolls for the sufferer. */
export const ATTACK_DIS_CONDITIONS = new Set<string>([
  "Blinded",
  "Frightened",
  "Poisoned",
  "Prone",
  "Restrained",
]);

/** Conditions that impose disadvantage on ability checks for the sufferer. */
export const CHECK_DIS_CONDITIONS = new Set<string>([
  "Frightened",
  "Poisoned",
  "Exhausted 1",
  "Exhausted 2",
  "Exhausted 3",
]);

// ── Lookups ───────────────────────────────────────────────────────────────────

// Map the baked SRD data by lowercased name for O(1) lookup.
const SRD_BY_NAME = new Map<string, Condition>(
  SRD_CONDITIONS.map((c) => [c.name.toLowerCase(), c] as const),
);

/**
 * Returns the baked SRD reference entry for a condition name, handling
 * Grimoire's Exhausted N split by falling back to the single "Exhaustion"
 * entry when the name starts with "Exhausted".
 */
export function getCondition(name: string): Condition | undefined {
  const direct = SRD_BY_NAME.get(name.toLowerCase());
  if (direct) return direct;
  if (name.toLowerCase().startsWith("exhaust")) {
    return SRD_BY_NAME.get("exhaustion");
  }
  return undefined;
}

/**
 * Full rules text for a condition, suitable for a native tooltip
 * (`<span title>`). Exhausted N injects the current level header so the
 * tooltip reads naturally even though the underlying rules data is for
 * the composite Exhaustion condition.
 */
export function getConditionDescription(name: string): string {
  const cond = getCondition(name);
  if (!cond) return name;

  const levelMatch = name.match(/^Exhausted\s+(\d)$/i);
  if (levelMatch) {
    return `${name} — level ${levelMatch[1]} of 6.\n\n${cond.description}`;
  }
  return cond.description;
}

/**
 * First effect bullet — a terse one-line summary useful for tight contexts
 * (chip tooltips when we don't want the full wall of text).
 */
export function getConditionShort(name: string): string {
  const cond = getCondition(name);
  if (!cond) return name;
  const levelMatch = name.match(/^Exhausted\s+(\d)$/i);
  if (levelMatch) {
    const lvl = parseInt(levelMatch[1], 10);
    // Effects array holds "Level N — …" lines; return the matching one.
    const match = cond.effects.find((e) => e.startsWith(`Level ${lvl}`));
    return match ?? cond.effects[0] ?? cond.description;
  }
  return cond.effects[0] ?? cond.description;
}
