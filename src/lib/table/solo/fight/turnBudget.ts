import { isIncapacitated } from "@/rules/fight/stances";
import type { RunCombatant } from "@/types/encounter.types";

/** "A few words": one short line aloud in a turn, about this long. */
export const SPOKEN_WORDS_PER_TURN = 20;

/** Whitespace-separated words; a token with no letter or digit in it (a dash, a lone mark) is not a word. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export interface TurnBudget {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  words: boolean;
  smallThing: boolean;
}

/** What a turn still holds: true means still available. "Words" and "one small thing" are tracked by the caller. */
export function turnBudgetOf(
  c: Pick<RunCombatant, "action_used" | "bonus_used" | "reactionUsed">,
  spent: { words: boolean; smallThing: boolean },
): TurnBudget {
  return {
    action: c.action_used !== true,
    bonus: c.bonus_used !== true,
    reaction: c.reactionUsed !== true,
    words: !spent.words,
    smallThing: !spent.smallThing,
  };
}

/**
 * Whether the character has a Reaction to give right now: it is unused, and they are on their feet and able to act
 * (PHB 2014 Appendix A "Incapacitated": no actions or reactions).
 */
export function canReact(c: Pick<RunCombatant, "reactionUsed" | "hp" | "conditions">): boolean {
  return c.reactionUsed !== true && c.hp > 0 && !isIncapacitated(c.conditions);
}
