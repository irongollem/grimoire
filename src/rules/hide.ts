// Hiding and finding (#1021 row 13). Pure and edge-importable (relative `.ts` imports only): the server's turns and the
// players' screens use the same rule.
//
// RULE hide-2024 (SRD 5.2 "Hide [Action]"): a DC 15 Dexterity (Stealth) check; on a success you have the Invisible
// condition's benefits until found, and "make note of your check's total, which is the DC for a creature to find you with
// a Wisdom (Perception) check".
// RULE hide-2014 (PHB 2014 ch. 7 "Hiding"): the Stealth check is contested by the Wisdom (Perception) of any creature that
// actively searches; and ch. 7 "Passive Perception": when you hide, a creature that is not searching notices you if its
// passive Perception is at least your Stealth total (the DM compares the two). A contest that ties leaves the situation as
// it was (ch. 7 "Contests"), so a search must beat the total to find you.

import type { AppliedCondition } from "../types/condition.types.ts";
import type { RulesetKey } from "../types/ruleset.types.ts";

/** 2024: the Hide action is a Dexterity (Stealth) check against this DC. */
export const HIDE_DC_2024 = 15;

export interface HideOutcome {
  /** Whether the character takes the Hidden condition. */
  hidden: boolean;
  /** What to tell the player, in plain words. */
  message: string;
}

/**
 * What a Hide action's Stealth total does, by the book. `watchers` are the passive Perception scores of the foes who could
 * see the hider, when the caller knows them (the server and the AI table do; a human DM's table may not): in 2014 one at or
 * above the total notices at once. With none given in 2014 the hider is marked Hidden and the DM compares, as before.
 */
export function hideOutcome(total: number, ruleset: RulesetKey, watchers: readonly number[] | null = null): HideOutcome {
  if (ruleset === "2024") {
    return total >= HIDE_DC_2024
      ? { hidden: true, message: `Stealth ${total}: you are hidden.` }
      : { hidden: false, message: `Stealth ${total}: not hidden (DC ${HIDE_DC_2024}).` };
  }
  if (watchers === null) return { hidden: true, message: `Stealth ${total}: hidden unless your DM says a creature notices you.` };
  const sharpest = watchers.reduce((best, p) => Math.max(best, p), Number.NEGATIVE_INFINITY);
  return sharpest >= total
    ? { hidden: false, message: `Stealth ${total}: a watching foe notices you (passive Perception ${sharpest}).` }
    : { hidden: true, message: `Stealth ${total}: you are hidden.` };
}

/**
 * Whether a search with this Wisdom (Perception) total finds a creature holding this Hidden condition. 2024: the hider's
 * Stealth total is the DC, so a total that meets it finds them. 2014: a contest, so a tie leaves them hidden.
 * APP CONVENTION: a Hidden with no total recorded (put on by hand) is found as if its total were the 2024 DC, 15.
 */
export function searchFinds(perceptionTotal: number, hidden: AppliedCondition, ruleset: RulesetKey): boolean {
  const stealth = typeof hidden.stealth === "number" ? hidden.stealth : HIDE_DC_2024;
  return ruleset === "2024" ? perceptionTotal >= stealth : perceptionTotal > stealth;
}
