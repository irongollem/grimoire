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

function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** A short sentence for the composer about what is left; it says nothing about movement. */
export function whatIsLeft(b: TurnBudget): string {
  const left: string[] = [];
  if (b.action) left.push("your Action");
  if (b.bonus) left.push("your Bonus Action");
  if (b.reaction) left.push("your Reaction");
  if (b.smallThing) left.push("one small thing");
  if (b.words) left.push("a few words");
  if (left.length === 0) return "You have nothing left this turn.";
  return `You still have ${joinList(left)}.`;
}

/**
 * Whether the character has a Reaction to give right now: it is unused, and they are on their feet and able to act
 * (PHB 2014 Appendix A "Incapacitated": no actions or reactions).
 */
export function canReact(c: Pick<RunCombatant, "reactionUsed" | "hp" | "conditions">): boolean {
  return c.reactionUsed !== true && c.hp > 0 && !isIncapacitated(c.conditions);
}
