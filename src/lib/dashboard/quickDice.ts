import { ALL_DICE, parseExpression } from "@/lib/dice/dice";
import type { DieResult, DieSize, ParsedExpression, RollMode, RollResult } from "@/lib/dice/dice";

/**
 * Pure logic behind the dashboard's quick dice roller (#764).
 *
 * The widget's own job is layout and click handling; every actual roll must
 * go through `@/lib/dice/roller` (see that module's docstring — sound and the
 * future roll-history hook live there, and nothing here is allowed to bypass
 * it). So this module only decides *what* to roll and reshapes *what came
 * back* for display. Kept apart from the .vue for the usual reason: parsing
 * edge cases and display formatting are cheap to test here and expensive to
 * test through a mounted card.
 */

export interface QuickDieButton {
  sides: DieSize;
  label: string;
  /** Whether Advantage/Disadvantage applies to a single click of this die. */
  supportsAdvantage: boolean;
}

/**
 * 5e ties Advantage/Disadvantage specifically to the d20: it is how ability
 * checks, saving throws and attack rolls resolve, and no other die is
 * described that way in the rules. "Roll two d6 and keep the higher" for a
 * damage die is a house rule, not RAW — offering the toggle on every die in
 * this row would imply a mechanic the game doesn't have. So only d20 gets it.
 */
export function advantageAppliesTo(sides: DieSize): boolean {
  return sides === 20;
}

/** The quick-roll row: every standard die, in the order a physical set racks. */
export const QUICK_DICE_BUTTONS: readonly QuickDieButton[] = ALL_DICE.map((sides) => ({
  sides,
  label: `d${sides}`,
  supportsAdvantage: advantageAppliesTo(sides),
}));

/**
 * The mode actually sent to the roller for a given die click. A DM can leave
 * the Advantage/Disadvantage toggle set and then click d6 — `rollDice` itself
 * would silently ignore the mode for anything but a single d20 (see
 * `@/lib/dice/dice`), but resolving it here means the roll this module hands
 * back never claims a mode that did nothing.
 */
export function effectiveMode(sides: DieSize, mode: RollMode): RollMode {
  return advantageAppliesTo(sides) ? mode : "normal";
}

export type QuickExpressionCheck =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "ready"; parsed: ParsedExpression };

/**
 * What the free-expression field can currently do, checked in one place so the
 * widget's disabled-state, its error copy and the actual roll call all agree.
 *
 * Empty text is deliberately its own state rather than folded into "invalid":
 * it is the field's resting state, not a mistake the DM made, so the widget
 * can grey the roll button out without accusing an empty box of being wrong.
 */
export function checkQuickExpression(raw: string): QuickExpressionCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { status: "empty" };
  const parsed = parseExpression(trimmed);
  return parsed ? { status: "ready", parsed } : { status: "invalid" };
}

/** What the widget renders after any roll — a standard die or an expression. */
export interface QuickRollDisplay {
  /** "1d20 (Adv)" for a standard-die click, or the typed text for an expression. */
  label: string;
  total: number;
  dice: readonly DieResult[];
  isCrit: boolean;
  isFumble: boolean;
}

/** Reshape a standard-die click's `RollResult` for display. */
export function displayStandardRoll(result: RollResult): QuickRollDisplay {
  return {
    label: result.label,
    total: result.total,
    dice: result.breakdown,
    isCrit: result.isCrit,
    isFumble: result.isFumble,
  };
}

/**
 * Reshape a free-expression roll for display. `rollParsed` never reports
 * crit/fumble (its own docstring: "damage rolls don't produce those"), so
 * this always reads false rather than inventing a value it has no source for.
 */
export function displayExpressionRoll(
  expression: string,
  result: { total: number; breakdown: readonly DieResult[] },
): QuickRollDisplay {
  return {
    label: expression,
    total: result.total,
    dice: result.breakdown,
    isCrit: false,
    isFumble: false,
  };
}
