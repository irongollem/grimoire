/**
 * One command applied to a whole fight: the turn reducer, then, when the
 * reducer raised `check_events`, the event check, in that order. This is the
 * function a server calls per command; the store's `dispatch` calls the same.
 */
import { reduceEncounterTurn, type EncounterTurnCommand } from "../encounterTurn.ts";
import { checkFightEvents, type FightDeps, type FightResult } from "./fightEvents.ts";
import type { FightEffect, FightState } from "./fightState.ts";

export function applyFightCommand(state: FightState, command: EncounterTurnCommand, deps: FightDeps): FightResult {
  const { state: turn, events: raised } = reduceEncounterTurn(state, command, deps);
  // The reducer owns the turn's fields; the events and what has fired are the fight's own and ride along.
  const next: FightState = { ...state, ...turn, events: state.events, eventsFired: state.eventsFired };
  if (!raised.some((e) => e.type === "check_events")) return { state: next, effects: raised };
  const checked = checkFightEvents(next, deps);
  const effects: FightEffect[] = [...raised, ...checked.effects];
  return { state: checked.state, effects };
}
