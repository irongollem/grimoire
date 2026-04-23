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
  manual?: boolean;
  /** True for spell/weapon damage rolls — suppresses d20-centric display in chat. */
  isDamage?: boolean;
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

// ── Simple expression parser (used by DiceExprInput for avg + roll button) ────

export interface ExprTerm {
  count: number;
  sides: number;
}

export interface ParsedExpression {
  terms: ExprTerm[];
  modifier: number;
}

/**
 * Parse a dice expression into structured form. Handles:
 *   "2d6+3"  "1d8"  "3d6-2"  "15" (flat)  "2d6+1d4+3" (compound)
 *   "22 (3d8+9)" — monster HP format; extracts the parenthetical expression
 *   "2d6 fire" — strips damage type words before parsing
 *
 * Returns null if unparseable.
 */
export function parseExpression(expr: string | null | undefined): ParsedExpression | null {
  if (!expr?.trim()) return null;

  let s = expr.trim();

  // Handle "N (expression)" format, e.g. "22 (3d8+9)"
  const parenMatch = s.match(/\(([^)]+)\)/);
  if (parenMatch) s = parenMatch[1].trim();

  // Strip damage type words so "2d6 fire" parses cleanly
  for (const word of DAMAGE_TYPES) {
    s = s.replace(new RegExp(`\\b${word}\\b`, "gi"), "");
  }
  s = s.replace(/\s+/g, "");
  if (!s) return null;

  // Flat integer
  if (/^-?\d+$/.test(s)) return { terms: [], modifier: parseInt(s, 10) };

  const terms: ExprTerm[] = [];
  let modifier = 0;

  // Split on + / - while keeping the sign with the next token
  // "2d6+3" → ["2d6", "+3"]   "2d6-2" → ["2d6", "-2"]
  const tokens = s.split(/(?=[+-])/);
  for (const token of tokens) {
    if (!token) continue;
    const sign = token.startsWith("-") ? -1 : 1;
    const clean = token.replace(/^[+-]/, "");
    const diceMatch = clean.match(/^(\d+)d(\d+)$/i);
    if (diceMatch) {
      const count = parseInt(diceMatch[1], 10);
      const sides = parseInt(diceMatch[2], 10);
      if (sides >= 2 && count >= 1) terms.push({ count, sides });
    } else {
      const flat = parseInt(clean, 10);
      if (!isNaN(flat)) modifier += sign * flat;
    }
  }

  if (terms.length === 0 && modifier === 0) return null;
  return { terms, modifier };
}

/**
 * Scale a dice expression by adding `extraLevels × perLevel` dice.
 * e.g. scaleExpression("8d6", 2, "1d6") → "10d6"
 * Returns the base expression unchanged if either parse fails or extraLevels ≤ 0.
 */
export function scaleExpression(base: string, extraLevels: number, perLevel: string): string {
  if (extraLevels <= 0) return base;
  const baseParsed = parseExpression(base);
  const levelParsed = parseExpression(perLevel);
  if (!baseParsed || !levelParsed) return base;

  const terms = baseParsed.terms.map((t) => ({ ...t }));
  let modifier = baseParsed.modifier;

  for (const t of levelParsed.terms) {
    const existing = terms.find((x) => x.sides === t.sides);
    if (existing) existing.count += t.count * extraLevels;
    else terms.push({ count: t.count * extraLevels, sides: t.sides });
  }
  modifier += levelParsed.modifier * extraLevels;

  const parts: string[] = terms.filter((t) => t.count > 0).map((t) => `${t.count}d${t.sides}`);
  if (modifier > 0) parts.push(`+${modifier}`);
  else if (modifier < 0) parts.push(String(modifier));
  return parts.join("") || "0";
}

/**
 * Convert parsed expression terms to a die-size → count map for the physical dice roller.
 * Non-standard die sizes (d2, d3, etc.) are dropped — they'll fall through to rollParsed.
 */
export function parsedToCounts(terms: ExprTerm[]): Partial<Record<DieSize, number>> {
  const counts: Partial<Record<DieSize, number>> = {};
  for (const t of terms) {
    if ([4, 6, 8, 10, 12, 20, 100].includes(t.sides)) {
      const k = t.sides as DieSize;
      counts[k] = (counts[k] ?? 0) + t.count;
    }
  }
  return counts;
}

/** Floor of the statistical average. */
export function averageExpression(parsed: ParsedExpression): number {
  const avg = parsed.terms.reduce((s, t) => s + (t.count * (t.sides + 1)) / 2, 0);
  return Math.floor(avg + parsed.modifier);
}

/** Roll all dice in an expression and return the total. */
export function rollExpression(parsed: ParsedExpression): number {
  return parsed.terms.reduce((s, t) => {
    let r = 0;
    for (let i = 0; i < t.count; i++) r += rollDie(t.sides);
    return s + r;
  }, parsed.modifier);
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
