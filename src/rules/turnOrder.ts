/**
 * Turn order: who gets a turn and how the active-turn cursor steps. Kept apart
 * from `encounterCombatLogic` because the dashboard's initiative widget needs
 * only this: small enough to be copied into the dashboard's chunk, where the
 * full combat module would be fetched as a file of its own (the 8 kB rule in
 * vite.config.ts `codeSplitting`).
 */
import type { RunCombatant } from "../types/encounter.types.ts";
import { takesTurnsInFight } from "./fight/standing.ts";

type TurnFacts = Pick<RunCombatant, "hp" | "type"> & Partial<Pick<RunCombatant, "death_saves" | "party_member_id">>;
type TurnCombatant = TurnFacts & Pick<RunCombatant, "instance_id">;

/** Whether a combatant gets turns: alive monsters, and players who are down but not dead (a down player still gets a
 *  turn for death saves). A downed monster's, a dead character's and a downed companion's turns are skipped. */
export function takesTurns(c: TurnFacts): boolean {
  return takesTurnsInFight(c);
}

/** Index (into a sorted list) of the first combatant able to act this round (`takesTurns`). */
export function findFirstActiveIndex(sorted: readonly TurnFacts[]): number {
  const firstAlive = sorted.findIndex(takesTurns);
  return firstAlive >= 0 ? firstAlive : 0;
}

/** Steps the active-turn cursor forward/backward through a sorted combatant list to the next combatant that takes
 *  turns, wrapping around. Returns the new index into `sorted` plus whether the step crossed a round boundary
 *  (passed the end going forward, or the start going backward). Null when nobody is left to act.
 *
 *  The step starts from the current creature's own place in the full order, so a creature that stopped taking turns
 *  during its own turn (it died) hands over to the one after it, not to the top of the round. */
export function stepTurnIndex(
  sorted: readonly TurnCombatant[],
  currentIndex: number,
  direction: 1 | -1,
): { sortedIndex: number; wrapped: boolean } | null {
  const count = sorted.length;
  if (!sorted.some(takesTurns)) return null;
  // `count` steps reach every place once and end back on the current one, which matters when it is the only taker.
  for (let k = 1; k <= count; k++) {
    const at = currentIndex + direction * k;
    const sortedIndex = ((at % count) + count) % count;
    if (takesTurns(sorted[sortedIndex])) return { sortedIndex, wrapped: at < 0 || at >= count };
  }
  return null;
}
