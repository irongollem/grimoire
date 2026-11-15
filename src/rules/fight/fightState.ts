import type { EncounterEvent, RunCombatant } from "@/types/encounter.types";
import type { EncounterTurnEvent, EncounterTurnState } from "../encounterTurn.ts";

/**
 * Everything a fight holds that a server must also hold to advance it: the
 * turn reducer's own state, plus the scripted events and which of them have
 * fired. Plain JSON-serialisable data, like `EncounterTurnState`.
 *
 * What stays out on purpose: the monsters and NPCs a spawn is built from
 * (they are a source the caller supplies through `FightDeps`, not part of the
 * fight), and everything that is the browser's own (pending broadcasts, the
 * concentration-check queue, move history, the runner's roster of stat blocks).
 */
export interface FightState extends EncounterTurnState {
  events: EncounterEvent[];
  /** Ids of the events that have fired. Fire-once events are skipped while listed. */
  eventsFired: string[];
}

/**
 * What applying something to a fight asks the outside world to do, as data.
 * The reducer's own events pass through unchanged (a player change to persist,
 * a concentration save owed, a condition ended ...); the two below are what an
 * event's actions add.
 */
export type FightEffect =
  | EncounterTurnEvent
  /** A line for the table: the store puts it on `pendingBroadcasts`, a server posts it to the chat. */
  | { type: "broadcast"; message: string }
  /** Combatants an event brought into the fight. They are already in the returned state; this says it happened. */
  | { type: "spawned"; combatants: RunCombatant[] };

/** The reducer's events, told apart from the two effects a fight adds. */
export function isTurnEvent(effect: FightEffect): effect is EncounterTurnEvent {
  return effect.type !== "broadcast" && effect.type !== "spawned";
}

/** A fight is under way once its round counter has left the lobby's 0 (the live row stores no separate flag). */
export function startedFromRound(currentRound: number): boolean {
  return currentRound > 0;
}
