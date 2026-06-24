import { DAMAGE_TYPES, type DamageType } from "@/types/damage.types";
import type { DamageRoll } from "@/lib/dice";

/** The three physical damage types that "nonmagical" qualifiers modify. */
const PHYSICAL: DamageType[] = ["bludgeoning", "piercing", "slashing"];

/**
 * A set of damage types that share a qualifier — e.g. the physical types in
 * "...slashing from nonmagical attacks". Rendered as icons + a short note.
 */
export interface DamageGroup {
  types: DamageType[];
  /** normalized, compact qualifier ("nonmagical", "nonmagical (non-silvered)") or "". */
  qualifier: string;
}

/**
 * Collapse the many spellings of a damage qualifier into one short token so it
 * takes minimal room on a card. Unknown qualifiers are lightly cleaned and kept.
 */
export function normalizeQualifier(raw: string): string {
  const s = raw.toLowerCase();
  if (/non[\s-]?magical/.test(s)) {
    if (/silver/.test(s)) return "nonmagical (non-silvered)";
    if (/adamant/.test(s)) return "nonmagical (non-adamantine)";
    return "nonmagical";
  }
  return s
    .replace(/[,;]/g, " ")
    .replace(/\b(from|that|is|are|aren'?t|not|made|with|and|or|attacks?|weapons?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a free-text damage string into groups of types that share a qualifier.
 *
 * Splits on ";" (D&D separates an unconditional list from a qualified one that
 * way), and — because a "nonmagical" qualifier only ever applies to physical
 * B/P/S — splits a mixed group so the elemental types stay unconditional even
 * when the source omits the semicolon. Types are canonically ordered per group.
 */
export function parseDamageGroups(
  input: string | null | undefined,
): DamageGroup[] {
  if (!input) return [];

  const groups: DamageGroup[] = [];
  for (const segment of input.split(";")) {
    const lower = segment.toLowerCase();
    const types = DAMAGE_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(lower));
    if (!types.length) continue;

    let rest = segment;
    for (const t of DAMAGE_TYPES) {
      rest = rest.replace(new RegExp(`\\b${t}\\b`, "gi"), " ");
    }
    const qualifier = normalizeQualifier(rest);

    const physical = types.filter((t) => PHYSICAL.includes(t));
    const elemental = types.filter((t) => !PHYSICAL.includes(t));
    if (
      qualifier.startsWith("nonmagical") &&
      physical.length &&
      elemental.length
    ) {
      groups.push({ types: elemental, qualifier: "" });
      groups.push({ types: physical, qualifier });
    } else {
      groups.push({ types, qualifier });
    }
  }
  return groups;
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
