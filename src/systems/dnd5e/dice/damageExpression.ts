import { DAMAGE_TYPES } from "@/types/damage.types";

export interface DamageRoll {
  dice: string; // e.g. "2d6", "1d8+4", "5"
  type: string; // e.g. "fire", "" for untyped
}

/**
 * Parses a compound expression like "2d6 fire + 1d6 slashing + 5" into
 * structured rolls: [{dice:"2d6", type:"fire"}, {dice:"1d6", type:"slashing"}, {dice:"5", type:""}]
 */
export function parseDamageExpression(expr: string): DamageRoll[] {
  if (!expr.trim()) return [];
  return expr
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((term) => {
      const lower = term.toLowerCase();
      const type =
        (DAMAGE_TYPES as readonly string[]).find((t) => new RegExp(`\\b${t}\\b`).test(lower)) ?? "";
      // Extract dice or flat number, strip type label
      const cleaned = DAMAGE_TYPES.reduce(
        (s, t) => s.replace(new RegExp(`\\b${t}\\b`, "gi"), ""),
        term,
      )
        .replace(/\s+/g, "")
        .trim();
      return { dice: cleaned, type };
    })
    .filter((r) => r.dice.length > 0);
}
