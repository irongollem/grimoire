// Who is still in the fight, and who still takes turns. Pure and edge-importable (relative `.ts` imports only).
import type { RunCombatant } from "../../types/encounter.types.ts";

/** How many failed death saves kill a character (PHB 2014 ch. 9 "Death Saving Throws"; SRD 5.2 "Death Saving Throws"). */
export const DEATH_SAVE_FAILURES_TO_DIE = 3;

type StandingFacts = Pick<RunCombatant, "hp" | "type"> & Partial<Pick<RunCombatant, "death_saves" | "party_member_id">>;

/**
 * On the board: above 0 hit points, or a player at 0 who lies where they fell (monsters at 0 are dead). App convention.
 * This is the "can still be targeted, can still be seen on the map" test: a dead character stays on it so the table can
 * revive them. Who gets a turn is `takesTurnsInFight`, which is stricter.
 */
export function isStanding(c: Pick<RunCombatant, "hp" | "type">): boolean {
  return c.hp > 0 || c.type === "player";
}

/**
 * Whether a combatant is out of the fight's turn order. Book: a dead creature takes no turns, while a dying or stable
 * character at 0 hp is unconscious but keeps its place, since its death saves are rolled on its turn.
 *
 * - A monster or NPC at 0 hp is dead (app convention, as `isStanding` has always said).
 * - A party member at 0 hp with three failed death saves is dead (PHB 2014 ch. 9 "Death Saving Throws").
 * - A companion (a player-type combatant with no `party_member_id`) has no death saves here, so at 0 hp it drops like
 *   a monster (app convention).
 */
export function isOutOfTurns(c: StandingFacts): boolean {
  if (c.hp > 0) return false;
  if (c.type !== "player") return true;
  if (!c.party_member_id) return true;
  return c.death_saves !== undefined && c.death_saves.failures >= DEATH_SAVE_FAILURES_TO_DIE;
}

/** Whether a combatant still gets turns: the opposite of `isOutOfTurns`. The turn order and the condition clocks use this. */
export function takesTurnsInFight(c: StandingFacts): boolean {
  return !isOutOfTurns(c);
}
