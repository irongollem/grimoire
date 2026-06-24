import { DAMAGE_TYPES, type DamageType } from "@/types/damage.types";
import type { DamageRoll } from "@/lib/dice";

/**
 * Result of pulling damage types out of a free-text stat string such as
 * "bludgeoning, piercing, and slashing from nonmagical attacks".
 */
export interface ParsedDamage {
  /** matched damage types, in canonical DAMAGE_TYPES order, de-duplicated. */
  types: DamageType[];
  /** leftover qualifier text once type words + connectors are removed. */
  qualifier: string;
}

/**
 * Extract the damage types named in a string, plus whatever qualifier text
 * remains (e.g. "from nonmagical attacks"). Used to render damage rows on
 * cards as icons + a short note instead of a long comma list.
 */
export function parseDamageString(
  input: string | null | undefined,
): ParsedDamage {
  if (!input) return { types: [], qualifier: "" };

  const lower = input.toLowerCase();
  const types = DAMAGE_TYPES.filter((t) =>
    new RegExp(`\\b${t}\\b`).test(lower),
  );

  let qualifier = input;
  for (const t of DAMAGE_TYPES) {
    qualifier = qualifier.replace(new RegExp(`\\b${t}\\b`, "gi"), "");
  }
  qualifier = qualifier
    .replace(/[,;]/g, " ")
    .replace(/\b(and|or)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { types, qualifier };
}

/**
 * Distinct, canonically-ordered damage types named by a set of damage rolls
 * (weapon/spell dice). Untyped or unrecognized roll types are ignored.
 */
export function damageTypesFromRolls(
  rolls: DamageRoll[] | null | undefined,
): DamageType[] {
  if (!rolls?.length) return [];
  const present = new Set(rolls.map((r) => r.type.toLowerCase()));
  return DAMAGE_TYPES.filter((t) => present.has(t));
}
