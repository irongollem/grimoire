/**
 * Turn order: who gets a turn and how the active-turn cursor steps. Kept apart
 * from `encounterCombatLogic` because the dashboard's initiative widget needs
 * only this: small enough to be copied into the dashboard's chunk, where the
 * full combat module would be fetched as a file of its own (the 8 kB rule in
 * vite.config.ts `codeSplitting`).
 */
import type { RunCombatant } from "@/types/encounter.types";

type TurnCombatant = Pick<RunCombatant, "instance_id" | "hp" | "type">;
type AliveCombatant = Pick<RunCombatant, "hp" | "type">;

/** Whether a combatant gets turns: alive monsters, or any player (down players
 *  still get a turn for death saves). A downed monster's turns are skipped. */
export function takesTurns(c: AliveCombatant): boolean {
  return c.hp > 0 || c.type === "player";
}

/** Index (into a sorted list) of the first combatant able to act this round (`takesTurns`). */
export function findFirstActiveIndex(sorted: readonly AliveCombatant[]): number {
  const firstAlive = sorted.findIndex(takesTurns);
  return firstAlive >= 0 ? firstAlive : 0;
}

/** Steps the active-turn cursor forward/backward through the alive subset of a
 *  sorted combatant list, wrapping around. Returns the new index into `sorted`
 *  (not into the alive subset) plus whether the step crossed a round boundary
 *  (wrapped past the end going forward, or past the start going backward).
 *  Null when nobody is alive to act. */
export function stepTurnIndex(
  sorted: readonly TurnCombatant[],
  currentIndex: number,
  direction: 1 | -1,
): { sortedIndex: number; wrapped: boolean } | null {
  const aliveSorted = sorted.filter(takesTurns);
  if (!aliveSorted.length) return null;

  const currentId = sorted[currentIndex]?.instance_id;
  const currentPosInAlive = aliveSorted.findIndex((c) => c.instance_id === currentId);
  const nextInAlive = (((currentPosInAlive + direction) % aliveSorted.length) + aliveSorted.length) % aliveSorted.length;
  const wrapped = direction === 1 ? nextInAlive === 0 : currentPosInAlive === 0;
  const targetId = aliveSorted[nextInAlive].instance_id;
  const sortedIndex = sorted.findIndex((c) => c.instance_id === targetId);
  return { sortedIndex, wrapped };
}
