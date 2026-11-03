/**
 * Game-system-neutral dice core: notation parsing, plain rolls, keep-one.
 *
 * Rules of a particular game (5e advantage, crit on a natural 20, damage-type
 * vocabulary) live under `src/systems/<system>/dice/` and are built from the
 * primitives here. Nothing in this folder may import from `@/systems/`
 * (held by `src/systems/systemBoundary.test.ts`).
 */

/** A whole word of letters only; dice tokens like "2d6" contain digits so never match. */
const LABEL_WORD = /\b[a-z]+\b/gi;

/**
 * Parses a dice expression into its average value.
 *
 * Supports:
 *   - Simple:    "3d6", "2d8+4", "10d6+40"
 *   - Spaced:    "2d6 + 12"
 *   - Compound:  "2d6 force + 1d6 fire", "3d8 + 2d6 + 5"
 *
 * Any whole word made only of letters ("fire", "radiant", "holy") is stripped
 * before parsing. This is deliberate: a label is never part of dice notation
 * in any game system, so the core needs no list of them.
 */
export function parseDiceAvg(expr: string): number {
  if (!expr.trim()) return 0;

  const cleaned = expr.toLowerCase().replace(LABEL_WORD, "");

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

export interface DieResult { val: number; dropped: boolean }
export interface RollResult {
  total: number;
  label: string;
  modifier: number;
  breakdown: DieResult[];
  /** Set by the game system's rules; the neutral roller never sets it true. */
  isCrit: boolean;
  /** Set by the game system's rules; the neutral roller never sets it true. */
  isFumble: boolean;
  manual?: boolean;
  /** True for spell/weapon damage rolls — suppresses d20-centric display in chat. */
  isDamage?: boolean;
}

export const ALL_DICE: DieSize[] = [4, 6, 8, 10, 12, 20, 100];

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Keeps the highest or lowest of already-rolled faces and marks the rest
 * dropped, kept face first. The primitive game-system "roll twice, keep one"
 * rules are built from; it takes faces rather than rolling them so a physical
 * roll typed in by a player is scored exactly like a digital one.
 */
export function keepOne(values: number[], keep: "highest" | "lowest"): DieResult[] {
  const keptIndex = values.reduce(
    (best, v, i) => (keep === "highest" ? (v > values[best] ? i : best) : v < values[best] ? i : best),
    0,
  );
  const kept = { val: values[keptIndex], dropped: false };
  const rest = values.filter((_, i) => i !== keptIndex).map((val) => ({ val, dropped: true }));
  return [kept, ...rest];
}

/**
 * The label of a pool, e.g. "1d20+5", "2d6-1", "1d6+1d8". The modifier carries
 * its own sign, so it is appended, not joined with "+".
 */
export function formatCounts(counts: Partial<Record<DieSize, number>>, modifier: number): string {
  const parts: string[] = [];
  for (const sides of ALL_DICE) {
    const n = counts[sides] ?? 0;
    if (n > 0) parts.push(`${n}d${sides}`);
  }
  const modifierLabel = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : "";
  return parts.join("+") + modifierLabel;
}

/** Plain roll of a pool: every die in ALL_DICE order, summed with the modifier. No game rules. */
export function rollDice(counts: Partial<Record<DieSize, number>>, modifier: number): RollResult {
  const breakdown: DieResult[] = [];
  let sum = 0;
  for (const sides of ALL_DICE) {
    const n = counts[sides] ?? 0;
    for (let i = 0; i < n; i++) {
      const r = rollDie(sides);
      breakdown.push({ val: r, dropped: false });
      sum += r;
    }
  }
  return {
    total: sum + modifier,
    label: formatCounts(counts, modifier),
    modifier,
    breakdown,
    isCrit: false,
    isFumble: false,
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
 *   "2d6 fire" — strips label words (any letters-only word) before parsing
 *
 * Returns null if unparseable.
 */
export function parseExpression(expr: string | null | undefined): ParsedExpression | null {
  if (!expr?.trim()) return null;

  let s = expr.trim();

  // Handle "N (expression)" format, e.g. "22 (3d8+9)"
  const parenMatch = s.match(/\(([^)]+)\)/);
  if (parenMatch) s = parenMatch[1].trim();

  // Strip label words so "2d6 fire" parses cleanly (see LABEL_WORD)
  s = s.replace(LABEL_WORD, "");
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
      if (sides < 2 || count < 1) return null;
      terms.push({ count, sides });
    } else {
      if (!/^\d+$/.test(clean)) return null;
      modifier += sign * parseInt(clean, 10);
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

/** Highest possible total (every die shows its max face). */
export function maxExpression(parsed: ParsedExpression): number {
  return parsed.terms.reduce((s, t) => s + t.count * t.sides, 0) + parsed.modifier;
}

/**
 * Compute a concrete max-HP number from a `hit_points` stat-block field, which
 * may be a pure dice expression ("2d8+2"), the "N (dice)" form ("11 (2d8+2)"),
 * or a flat number. Returns the statistical average (11 for "2d8+2"), falling
 * back to `fallback` when the field is missing or unparseable.
 *
 * Replaces the old `parseInt(hp.split(" ")[0])` idiom, which read only the
 * leading integer and so returned 2 for "2d8+2".
 */
export function hitPointsToMax(hitPoints: string | null | undefined, fallback: number): number {
  const parsed = parseExpression(hitPoints);
  if (!parsed) return fallback;
  const avg = averageExpression(parsed);
  return avg > 0 ? avg : fallback;
}

/** Roll all dice in an expression and return the total. */
export function rollExpression(parsed: ParsedExpression): number {
  return parsed.terms.reduce((s, t) => {
    let r = 0;
    for (let i = 0; i < t.count; i++) r += rollDie(t.sides);
    return s + r;
  }, parsed.modifier);
}
