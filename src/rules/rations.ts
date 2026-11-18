/**
 * Food on the road, by the book (#1222, story 5). Used only where a campaign has switched the optional rule
 * `rations` on: most tables do not count meals, and a table that does wants the book's numbers, not ours.
 *
 * - 2014: PHB ch. 8 "Food and Water". A character needs one pound of food a day, can go without for 3 + their
 *   Constitution modifier days (minimum 1), and at the end of each day beyond that takes one level of exhaustion.
 *   A normal day of eating resets the count.
 * - 2024: PHB Rules Glossary "Malnutrition". A Medium creature needs one pound of food a day. Eating nothing for
 *   five days gives one Exhaustion level at the end of the fifth day and one more at the end of each day after.
 *   (Eating less than half a day's food calls for a DC 10 Constitution save at the day's end; that is a roll for
 *   the table to make, not a sum, so it is not worked out here.)
 *
 * Imported by the edge functions too, so its imports are relative and carry the extension.
 */
import type { RulesetKey } from "../types/ruleset.types.ts";

/** A day's food for one Medium or Small traveller is one ration (one pound) in both editions. */
export const RATIONS_PER_DAY = 1;

/** The rations a group needs for a journey: one each for every day it occupies on the calendar. */
export function rationsNeeded(days: number, travellers: number): number {
  if (!Number.isFinite(days) || !Number.isFinite(travellers) || days <= 0 || travellers <= 0) return 0;
  return Math.ceil(days) * Math.floor(travellers) * RATIONS_PER_DAY;
}

/** How many days in a row a character can eat nothing before hunger costs them, by edition. */
export function daysWithoutFoodAllowed(constitutionModifier: number, ruleset: RulesetKey): number {
  // 2024: the fifth day is the first that costs, so four are free, whatever the Constitution.
  if (ruleset === "2024") return 4;
  return Math.max(1, 3 + constitutionModifier);
}

/** The exhaustion levels a run of days without food has cost, one for each day past what is allowed. */
export function hungerExhaustion(daysWithoutFood: number, constitutionModifier: number, ruleset: RulesetKey): number {
  if (!Number.isFinite(daysWithoutFood) || daysWithoutFood <= 0) return 0;
  return Math.max(0, Math.floor(daysWithoutFood) - daysWithoutFoodAllowed(constitutionModifier, ruleset));
}
