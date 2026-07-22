import { WEAPON_MASTERY_PROPERTIES } from "@/types/item.types";
import type { WeaponMasteryProperty } from "@/types/item.types";
import type { RulesetKey } from "@/types/ruleset.types";

const MASTERY_SET = new Set<string>(WEAPON_MASTERY_PROPERTIES);

/**
 * Normalize an AI-generated `mastery` value (#564 — ruleset-aware generation).
 *
 * Weapon Mastery is a 2024-only mechanic, so the result is null unless the
 * campaign ruleset is "2024" AND the item is a weapon. Otherwise the raw
 * value is lowercased and accepted only if it matches a member of
 * `WEAPON_MASTERY_PROPERTIES` — junk (misspellings, non-2024 properties,
 * empty strings) normalizes to null rather than being persisted verbatim.
 */
export function normalizeAiItemMastery(
  value: string | null | undefined,
  opts: { ruleset: RulesetKey; itemType: string },
): WeaponMasteryProperty | null {
  if (opts.ruleset !== "2024") return null;
  if (opts.itemType !== "weapon") return null;
  if (!value) return null;

  const lowered = value.trim().toLowerCase();
  return MASTERY_SET.has(lowered) ? (lowered as WeaponMasteryProperty) : null;
}
