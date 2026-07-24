import { SRD_CONDITIONS_2014 } from "@/data/srdConditions2014";
import { SRD_CONDITIONS_2024 } from "@/data/srdConditions2024";
import { CONDITION_PATCHES } from "@/data/conditionPatches";
import type { Condition } from "@/types/condition.types";
import type { RulesetKey } from "@/types/ruleset.types";

export type { Condition };

/**
 * Pickable conditions surfaced in the "+ Condition" dropdown. The canonical 15
 * SRD names plus "Hidden" — a non-SRD tracking marker for a creature that has
 * taken the Hide action (its rules text lives in `CONDITION_PATCHES`, since
 * Open5e has no such entry). Exhaustion is a single entry, not split by level:
 * storage still uses `"Exhausted N"` so the level rides with the condition
 * string, but the picker treats it as one option; the chip UI shows the
 * current level with inline −/+ controls (see `getExhaustionLevel` /
 * `setExhaustionLevel` below). The name list itself doesn't vary between
 * editions.
 */
export const CONDITIONS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Hidden",
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

/** Max exhaustion level — 6 in both the 2014 and 2024 rules; at 6 the character dies. */
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
 * more than one active at a time). The storage shape (level number, max 6)
 * is identical between editions — only what each level *means* differs,
 * which is handled by the ruleset-aware effect helpers below.
 */
export function setExhaustionLevel(conditions: string[], level: number): string[] {
  const without = conditions.filter((c) => !isExhaustion(c));
  const clamped = Math.max(0, Math.min(MAX_EXHAUSTION, level));
  if (clamped === 0) return without;
  return [...without, `Exhausted ${clamped}`];
}

// ── Edition-keyed condition data resolver ──────────────────────────────────────
//
// Base per-edition arrays (`SRD_CONDITIONS_2014` / `SRD_CONDITIONS_2024`) are
// generated data. `CONDITION_PATCHES` is a hand-maintained override/fill-gap
// layer applied last — see `src/data/conditionPatches.ts` for why the 2024
// side currently carries the *entire* condition set (Open5e has no
// structured 2024 condition data yet; open5e-api#793). Once that upstream
// gap closes, `srdConditions2024.ts` can be regenerated wholesale and this
// resolver keeps working unchanged — the patches will just shrink to real
// overrides instead of full entries.

const BASE_CONDITIONS: Record<RulesetKey, Condition[]> = {
  "2014": SRD_CONDITIONS_2014,
  "2024": SRD_CONDITIONS_2024,
};

/** All 15 condition reference entries for a ruleset, with patches applied. */
export function getConditions(ruleset: RulesetKey = "2014"): Condition[] {
  const base = BASE_CONDITIONS[ruleset];
  const patches = CONDITION_PATCHES[ruleset];
  const byId = new Map<string, Condition>(base.map((c) => [c.id, c] as const));
  for (const [id, patch] of Object.entries(patches)) {
    byId.set(id, patch);
  }
  return [...byId.values()];
}

// Lazily-built, cached per-edition lookup by lowercased name.
const CONDITIONS_BY_NAME_CACHE = new Map<RulesetKey, Map<string, Condition>>();

function conditionsByName(ruleset: RulesetKey): Map<string, Condition> {
  const cached = CONDITIONS_BY_NAME_CACHE.get(ruleset);
  if (cached) return cached;
  const map = new Map<string, Condition>(
    getConditions(ruleset).map((c) => [c.name.toLowerCase(), c] as const),
  );
  CONDITIONS_BY_NAME_CACHE.set(ruleset, map);
  return map;
}

/**
 * Returns the baked SRD reference entry for a condition name under the given
 * ruleset ('2014' default, matching the campaign-ruleset default elsewhere —
 * see `src/composables/useRuleset.ts`), handling Grimoire's Exhausted N
 * split by falling back to the single "Exhaustion" entry when the name
 * starts with "Exhaust".
 */
export function getCondition(name: string, ruleset: RulesetKey = "2014"): Condition | undefined {
  const byName = conditionsByName(ruleset);
  const direct = byName.get(name.toLowerCase());
  if (direct) return direct;
  if (name.toLowerCase().startsWith("exhaust")) {
    return byName.get("exhaustion");
  }
  return undefined;
}

/**
 * Full rules text for a condition, suitable for a native tooltip
 * (`<span title>`). Exhausted N injects the current level header so the
 * tooltip reads naturally even though the underlying rules data is for
 * the composite Exhaustion condition.
 */
export function getConditionDescription(name: string, ruleset: RulesetKey = "2014"): string {
  const cond = getCondition(name, ruleset);
  if (!cond) return name;

  const levelMatch = name.match(/^Exhausted\s+(\d)$/i);
  if (levelMatch) {
    return `${name} — level ${levelMatch[1]} of 6.\n\n${cond.description}`;
  }
  return cond.description;
}

/**
 * First effect bullet — a terse one-line summary useful for tight contexts
 * (chip tooltips when we don't want the full wall of text). 2024's
 * Exhausted N has no per-level effect table (every level shares the same
 * uniform penalty), so this returns a computed penalty summary rather than
 * trying to match a "Level N" bullet the way the 2014 data does.
 */
export function getConditionShort(name: string, ruleset: RulesetKey = "2014"): string {
  const cond = getCondition(name, ruleset);
  if (!cond) return name;
  const levelMatch = name.match(/^Exhausted\s+(\d)$/i);
  if (levelMatch) {
    const lvl = parseInt(levelMatch[1], 10);
    if (ruleset === "2024") {
      return `−${lvl * 2} to all d20 Tests, −${lvl * 5} ft Speed`;
    }
    // Effects array holds "Level N — …" lines; return the matching one.
    const match = cond.effects.find((e) => e.startsWith(`Level ${lvl}`));
    return match ?? cond.effects[0] ?? cond.description;
  }
  return cond.effects[0] ?? cond.description;
}

// ── Mechanical effects (ruleset-aware) ──────────────────────────────────────────

/** Conditions that impose disadvantage on attack rolls for the sufferer (unchanged between editions). */
export const ATTACK_DIS_CONDITIONS = new Set<string>([
  "Blinded",
  "Frightened",
  "Poisoned",
  "Prone",
  "Restrained",
]);

/**
 * Check-disadvantage raw name set — only non-exhaustion entries (unchanged
 * between editions). Callers should use `hasCheckDisadvantage()` which also
 * accounts for exhaustion under the 2014 rules.
 */
export const CHECK_DIS_CONDITIONS = new Set<string>([
  "Frightened",
  "Poisoned",
]);

/**
 * Whether any of the given conditions impose disadvantage on attack rolls.
 * Under 2014, Exhaustion level 3+ also imposes disadvantage on attack rolls
 * (SRD 5.1: "Level 3 — Disadvantage on attack rolls and saving throws").
 * Under 2024, Exhaustion never causes disadvantage — it's a flat −2×level
 * penalty on every d20 Test instead (see `getExhaustionD20Penalty`).
 */
export function hasAttackDisadvantage(conditions: string[], ruleset: RulesetKey = "2014"): boolean {
  if (conditions.some((c) => ATTACK_DIS_CONDITIONS.has(c))) return true;
  if (ruleset === "2014" && getExhaustionLevel(conditions) >= 3) return true;
  return false;
}

/**
 * Whether any of the given conditions impose disadvantage on ability
 * checks. Under 2014, any Exhaustion level ≥ 1 gives disadvantage on
 * ability checks. Under 2024, Exhaustion contributes a numeric penalty
 * instead (see `getExhaustionD20Penalty`), never disadvantage.
 */
export function hasCheckDisadvantage(conditions: string[], ruleset: RulesetKey = "2014"): boolean {
  if (conditions.some((c) => CHECK_DIS_CONDITIONS.has(c))) return true;
  if (ruleset === "2014" && getExhaustionLevel(conditions) >= 1) return true;
  return false;
}

/**
 * Whether the given conditions impose disadvantage on a saving throw for the
 * given ability. Restrained → disadvantage on DEX saves (unchanged between
 * editions). Under 2014, Exhaustion level ≥ 3 → disadvantage on ALL saves;
 * under 2024, Exhaustion never causes disadvantage on saves (numeric
 * penalty instead — see `getExhaustionD20Penalty`).
 */
export function hasSaveDisadvantage(
  conditions: string[],
  ability: string,
  ruleset: RulesetKey = "2014",
): boolean {
  if (ruleset === "2014" && getExhaustionLevel(conditions) >= 3) return true;
  if (ability.toLowerCase() === "dex" && conditions.includes("Restrained")) return true;
  return false;
}

/**
 * 2024-only: the flat penalty Exhaustion applies to every d20 Test (ability
 * checks, attack rolls, and saving throws) — SRD 5.2's replacement for the
 * 2014 per-level disadvantage table. Returns 0 under the 2014 ruleset
 * (which models exhaustion via `hasAttackDisadvantage` / `hasCheckDisadvantage`
 * / `hasSaveDisadvantage` instead) or when there's no active exhaustion.
 * Always ≤ 0 — add it directly to a roll modifier.
 */
export function getExhaustionD20Penalty(conditions: string[], ruleset: RulesetKey = "2014"): number {
  if (ruleset !== "2024") return 0;
  const level = getExhaustionLevel(conditions);
  return level > 0 ? level * -2 : 0;
}

/**
 * 2024-only: feet of Speed lost to Exhaustion (flat −5 ft per level). 2014
 * uses tiered speed effects instead (halved at level 2, 0 at level 5),
 * which aren't currently wired into a numeric speed field anywhere in the
 * app — the SRD text alone documents them for 2014. Returns 0 under 2014 or
 * when there's no active exhaustion.
 */
export function getExhaustionSpeedPenaltyFt(conditions: string[], ruleset: RulesetKey = "2014"): number {
  if (ruleset !== "2024") return 0;
  return getExhaustionLevel(conditions) * 5;
}
