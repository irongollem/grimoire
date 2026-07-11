import { SRD_CONDITIONS } from "@/data/srdConditions";
import type { Condition } from "@/types/condition.types";

export { SRD_CONDITIONS };
export type { Condition };

/**
 * Pickable conditions surfaced in the "+ Condition" dropdown. Just the
 * canonical 15 SRD names — Exhaustion is a single entry, not split by
 * level. Storage still uses `"Exhausted N"` so the level rides with the
 * condition string, but the picker treats it as one option; the chip UI
 * shows the current level with inline −/+ controls (see
 * `getExhaustionLevel` / `setExhaustionLevel` below).
 */
export const CONDITIONS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
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

/** Max exhaustion level per SRD — at 6 the character dies. */
export const MAX_EXHAUSTION = 6;

/** True when the stored string encodes any exhaustion level. */
export function isExhaustion(condition: string): boolean {
  return /^Exhaust(ed|ion)\s+\d$/i.test(condition);
}

/** Extract the level from a stored exhaustion string, or 0 if not present. */
export function parseExhaustionLevel(condition: string): number {
  const m = condition.match(/^Exhaust(?:ed|ion)\s+(\d)$/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Current exhaustion level on a creature, or 0 if none. */
export function getExhaustionLevel(conditions: string[]): number {
  for (const c of conditions) {
    const level = parseExhaustionLevel(c);
    if (level > 0) return level;
  }
  return 0;
}

/**
 * Returns a new conditions array with exhaustion set to `level`. `level=0`
 * removes exhaustion entirely; values outside [0, MAX_EXHAUSTION] are
 * clamped. Any existing exhaustion entries are replaced (there's never
 * more than one active at a time).
 */
export function setExhaustionLevel(conditions: string[], level: number): string[] {
  const without = conditions.filter((c) => !isExhaustion(c));
  const clamped = Math.max(0, Math.min(MAX_EXHAUSTION, level));
  if (clamped === 0) return without;
  return [...without, `Exhausted ${clamped}`];
}

/** Conditions that impose disadvantage on attack rolls for the sufferer. */
export const ATTACK_DIS_CONDITIONS = new Set<string>([
  "Blinded",
  "Frightened",
  "Poisoned",
  "Prone",
  "Restrained",
]);

/**
 * Check-disadvantage raw name set — only non-exhaustion entries. Callers
 * should use `hasCheckDisadvantage()` which also accounts for any
 * exhaustion level (level 1+ gives disadvantage on ability checks per the
 * SRD).
 */
export const CHECK_DIS_CONDITIONS = new Set<string>([
  "Frightened",
  "Poisoned",
]);

/** Whether any of the given conditions impose disadvantage on attack rolls. */
export function hasAttackDisadvantage(conditions: string[]): boolean {
  return conditions.some((c) => ATTACK_DIS_CONDITIONS.has(c));
}

/** Whether any of the given conditions impose disadvantage on ability checks. */
export function hasCheckDisadvantage(conditions: string[]): boolean {
  if (conditions.some((c) => CHECK_DIS_CONDITIONS.has(c))) return true;
  // Any exhaustion level ≥ 1 gives disadvantage on ability checks.
  return getExhaustionLevel(conditions) >= 1;
}

/**
 * Whether the given conditions impose disadvantage on a saving throw for the
 * given ability (SRD 5e): Exhaustion level ≥ 3 → disadvantage on ALL saves;
 * Restrained → disadvantage on DEX saves.
 */
export function hasSaveDisadvantage(conditions: string[], ability: string): boolean {
  if (getExhaustionLevel(conditions) >= 3) return true;
  if (ability.toLowerCase() === "dex" && conditions.includes("Restrained")) return true;
  return false;
}

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
