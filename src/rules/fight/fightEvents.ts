/**
 * A fight's scripted events (#604), as pure functions of the fight: which ones
 * the state calls for, and what firing one does. Moved out of the encounterRun
 * store so a server can fire the same events the DM's browser does.
 */
import type { EncounterEvent, RunCombatant } from "../../types/encounter.types.ts";
import { evaluateTrigger } from "../encounterCombatLogic.ts";
import type { EncounterTurnDeps } from "../encounterTurn.ts";
import type { FightEffect, FightState } from "./fightState.ts";
import { joinFight, spawnFromDef, type SpawnSources } from "./fightSpawn.ts";

/** What a fight needs from outside itself: the dice the reducer may roll, and the sources a spawn is built from. */
export interface FightDeps extends EncounterTurnDeps, SpawnSources {}

export interface FightResult {
  state: FightState;
  effects: FightEffect[];
}

function executeEvent(state: FightState, event: EncounterEvent, deps: FightDeps): FightResult {
  const effects: FightEffect[] = [];
  const eventsFired = state.eventsFired.includes(event.id) ? state.eventsFired : [...state.eventsFired, event.id];
  let roster = { combatants: state.combatants as readonly RunCombatant[], activeIndex: state.activeIndex };
  for (const action of event.actions) {
    if (action.type === "spawn_combatants") {
      for (const spawn of action.spawns) {
        const built = spawnFromDef(deps, state.started, spawn);
        if (built.length === 0) continue;
        roster = joinFight({ ...roster, started: state.started }, built);
        effects.push({ type: "spawned", combatants: built });
      }
    } else if (action.type === "broadcast_message") {
      effects.push({ type: "broadcast", message: action.message });
    } else if (action.type === "environment_effect") {
      // Broadcast the same way a message action does — the table hears about
      // the collapsing floor — and that is the whole of it. The hazard's
      // continuing presence is DERIVED from `eventsFired`, not stored, so
      // there is no third piece of state to sync, persist or get out of step
      // with the fired list (see activeEnvironmentEffects).
      effects.push({ type: "broadcast", message: `${action.label}: ${action.description}` });
    }
  }
  return { state: { ...state, combatants: [...roster.combatants], activeIndex: roster.activeIndex, eventsFired }, effects };
}

/**
 * Fires every event whose trigger now holds and that has not already fired
 * (when it is fire-once). A `manual` trigger never fires here: it waits for the
 * DM's press, which is `fireFightEvent`. Nothing fires before combat starts.
 *
 * Each trigger is judged against the state as the earlier events in this same
 * pass left it, so a spawn can bring a later event's trigger true.
 */
export function checkFightEvents(state: FightState, deps: FightDeps): FightResult {
  if (!state.started) return { state, effects: [] };
  let current = state;
  const effects: FightEffect[] = [];
  for (const event of state.events) {
    if (event.fire_once && current.eventsFired.includes(event.id)) continue;
    if (event.trigger.type !== "manual" && evaluateTrigger(event.trigger, current.combatants, current.round)) {
      const fired = executeEvent(current, event, deps);
      current = fired.state;
      effects.push(...fired.effects);
    }
  }
  return { state: current, effects };
}

/** The DM's press on one event: fires it whatever its trigger says, and whether or not it has fired. Unknown ids do nothing. */
export function fireFightEvent(state: FightState, eventId: string, deps: FightDeps): FightResult {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return { state, effects: [] };
  return executeEvent(state, event, deps);
}
