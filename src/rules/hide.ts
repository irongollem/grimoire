import type { RulesetKey } from "@/types/ruleset.types";

/** 2024: the Hide action is a Dexterity (Stealth) check against this DC. */
export const HIDE_DC_2024 = 15;

export interface HideOutcome {
  /** Whether the character takes the Hidden condition. */
  hidden: boolean;
  /** What to tell the player, in plain words. */
  message: string;
}

/**
 * What a Hide action's Stealth total does, by the book.
 *
 * 2024: Hide is a DC 15 Dexterity (Stealth) check and a success leaves the
 * character Invisible (the app's "Hidden" condition) until found; a failure
 * leaves them in sight. 2014: the check is contested by the DM against
 * Perception, so the character is marked Hidden and the total is shown for the
 * DM to compare; the DM decides, and can remove the mark.
 */
export function hideOutcome(total: number, ruleset: RulesetKey): HideOutcome {
  if (ruleset === "2024") {
    return total >= HIDE_DC_2024
      ? { hidden: true, message: `Stealth ${total}: you are hidden.` }
      : { hidden: false, message: `Stealth ${total}: not hidden (DC ${HIDE_DC_2024}).` };
  }
  return { hidden: true, message: `Stealth ${total}: hidden unless your DM says a creature notices you.` };
}
