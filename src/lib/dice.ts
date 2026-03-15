/**
 * Shared dice utilities.
 * Used by spellAdvisor, monsters, equipment — anything that parses dice expressions.
 * Also exports rollDice() used by DiceRoller and CampaignChat.
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

// ── Live roller types + helpers (used by DiceRoller and CampaignChat) ─────────

export type DieSize = 4 | 6 | 8 | 10 | 12 | 20 | 100;
export type RollMode = "normal" | "advantage" | "disadvantage";

export interface DieResult { val: number; dropped: boolean }
export interface RollResult {
  total: number;
  label: string;
  modifier: number;
  breakdown: DieResult[];
  isCrit: boolean;
  isFumble: boolean;
}

export const ALL_DICE: DieSize[] = [4, 6, 8, 10, 12, 20, 100];

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(
  counts: Partial<Record<DieSize, number>>,
  modifier: number,
  mode: RollMode,
): RollResult {
  const breakdown: DieResult[] = [];
  let sum = 0;
  let isCrit = false;
  let isFumble = false;
  const labelParts: string[] = [];

  for (const sides of ALL_DICE) {
    const n = counts[sides] ?? 0;
    if (n === 0) continue;
    labelParts.push(`${n}d${sides}`);
    for (let i = 0; i < n; i++) {
      if (sides === 20 && n === 1 && mode !== "normal") {
        const r1 = rollDie(20);
        const r2 = rollDie(20);
        const keep = mode === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
        const drop = mode === "advantage" ? Math.min(r1, r2) : Math.max(r1, r2);
        breakdown.push({ val: keep, dropped: false });
        breakdown.push({ val: drop, dropped: true });
        sum += keep;
        if (keep === 20) isCrit = true;
        if (keep === 1) isFumble = true;
      } else {
        const r = rollDie(sides);
        breakdown.push({ val: r, dropped: false });
        sum += r;
        if (sides === 20 && r === 20) isCrit = true;
        if (sides === 20 && r === 1) isFumble = true;
      }
    }
  }

  if (modifier !== 0) labelParts.push(modifier > 0 ? `+${modifier}` : `${modifier}`);
  const modeLabel = (counts[20] ?? 0) > 0 && mode !== "normal"
    ? ` (${mode === "advantage" ? "Adv" : "Dis"})`
    : "";

  return {
    total: sum + modifier,
    label: labelParts.join("+") + modeLabel,
    modifier,
    breakdown,
    isCrit,
    isFumble,
  };
}

// ── Damage expression helpers ──────────────────────────────────────────────────

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
