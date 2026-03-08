/**
 * Shared dice utilities.
 * Used by spellAdvisor, monsters, equipment — anything that parses dice expressions.
 */

import { DAMAGE_TYPES } from "@/types/damage.types";

/**
 * Parses a dice expression into its average value.
 *
 * Supports:
 *   - Simple:    "3d6", "2d8+4", "10d6+40"
 *   - Spaced:    "2d6 + 12"
 *   - Compound:  "2d6 force + 1d6 fire", "3d8 + 2d6 + 5"
 *
 * Damage type words (fire, cold, etc.) are stripped before parsing.
 */
export function parseDiceAvg(expr: string): number {
  if (!expr.trim()) return 0;

  let cleaned = expr.toLowerCase();
  for (const word of DAMAGE_TYPES) {
    cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, "g"), "");
  }

  const terms = cleaned.replace(/\s+/g, "").split("+").filter(Boolean);

  let total = 0;
  for (const term of terms) {
    const diceMatch = term.match(/^(\d+)d(\d+)$/);
    if (diceMatch) {
      const count = parseInt(diceMatch[1]);
      const sides = parseInt(diceMatch[2]);
      total += (count * (sides + 1)) / 2;
    } else {
      const flat = parseFloat(term);
      if (!isNaN(flat)) total += flat;
    }
  }
  return total;
}

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
