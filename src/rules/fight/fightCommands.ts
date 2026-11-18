/**
 * One command applied to a whole fight. Every change to a fight is one of
 * these, whether the DM's browser or a server applies it: the turn reducer's
 * commands, then (when the reducer raised `check_events`) the event check, and
 * the fight's own commands below, which the reducer has no business knowing
 * (the roster's marks and growth, scripted events). The store's `dispatch`
 * and the `encounter-command` function call the same `applyFightCommand`.
 */
import type { RevealState, RunCombatant } from "../../types/encounter.types.ts";
import { applyAdoptedStats, type AdoptedStats } from "../encounterCombatLogic.ts";
import { reduceEncounterTurn, type EncounterTurnCommand } from "../encounterTurn.ts";
import { checkFightEvents, fireFightEvent, type FightDeps, type FightResult } from "./fightEvents.ts";
import type { ShownDefense } from "./tactics/shownDefenses.ts";
import { joinFight } from "./fightSpawn.ts";
import type { FightEffect, FightState } from "./fightState.ts";

/**
 * The fight's own commands. Initiative has none of its own: `set_initiative`
 * (the reducer's) does exactly what assigning one combatant's initiative does,
 * edit that one field and nothing else (no turn re-pointing, no events), and
 * takes null to blank it. The rolling stays with the caller; the command
 * carries the value that was rolled.
 */
export type FightOwnCommand =
  | { type: "add_curse"; instanceId: string; curse: string }
  | { type: "remove_curse"; instanceId: string; curse: string }
  | { type: "set_reveal_state"; instanceId: string; revealState: RevealState }
  /** Newcomers built by the caller (ids and rolled initiative included), so every applier ends with the same roster. */
  | { type: "add_combatants"; combatants: RunCombatant[] }
  /** The real numbers for a combatant that joined on stand-ins, worked out by whoever holds its stat block. */
  | { type: "adopt_stats"; instanceId: string; stats: AdoptedStats }
  | { type: "fire_event"; eventId: string }
  | { type: "check_events" }
  /** A defense a blow just showed (#1021): what the fight remembers a creature to resist, be immune to or be vulnerable to. */
  | { type: "show_defense"; instanceId: string; damageType: string; defense: ShownDefense };

export type FightCommand = EncounterTurnCommand | FightOwnCommand;

/** Every type of the fight's own commands; the edge handler holds its accepted list equal to this at compile time. */
export const FIGHT_OWN_COMMAND_TYPES = [
  "add_curse", "remove_curse", "set_reveal_state", "add_combatants", "adopt_stats", "fire_event", "check_events", "show_defense",
] as const satisfies readonly FightOwnCommand["type"][];

function isOwnCommand(command: FightCommand): command is FightOwnCommand {
  return (FIGHT_OWN_COMMAND_TYPES as readonly string[]).includes(command.type);
}

/** Replaces one combatant with `edit`'s copy; the input state and its combatant are never touched. No such combatant, or nothing to change: the state itself. */
function editOne(state: FightState, instanceId: string, edit: (c: RunCombatant) => RunCombatant): FightState {
  const at = state.combatants.findIndex((c) => c.instance_id === instanceId);
  if (at < 0) return state;
  const edited = edit(state.combatants[at]);
  if (edited === state.combatants[at]) return state;
  const combatants = [...state.combatants];
  combatants[at] = edited;
  return { ...state, combatants };
}

function applyOwn(state: FightState, command: FightOwnCommand, deps: FightDeps): FightResult {
  switch (command.type) {
    case "add_curse": {
      const curse = command.curse.trim();
      return {
        state: editOne(state, command.instanceId, (c) => (!curse || c.curses.includes(curse) ? c : { ...c, curses: [...c.curses, curse] })),
        effects: [],
      };
    }
    case "remove_curse":
      return {
        state: editOne(state, command.instanceId, (c) => ({ ...c, curses: c.curses.filter((cu) => cu !== command.curse) })),
        effects: [],
      };
    case "set_reveal_state":
      return { state: editOne(state, command.instanceId, (c) => ({ ...c, reveal_state: command.revealState })), effects: [] };
    case "add_combatants": {
      // A newcomer already in the fight (or listed twice) is refused: instance ids are what every
      // other command finds a combatant by, so a second one would be unreachable and unremovable.
      const present = new Set(state.combatants.map((c) => c.instance_id));
      const fresh = command.combatants.filter((c) => {
        if (present.has(c.instance_id)) return false;
        present.add(c.instance_id);
        return true;
      });
      if (fresh.length === 0) return { state, effects: [] };
      const joined = joinFight(state, fresh);
      return { state: { ...state, combatants: joined.combatants, activeIndex: joined.activeIndex }, effects: [] };
    }
    case "adopt_stats":
      return { state: editOne(state, command.instanceId, (c) => applyAdoptedStats(c, command.stats)), effects: [] };
    case "show_defense":
      return {
        state: editOne(state, command.instanceId, (c) =>
          c.shown_defenses?.[command.damageType] === command.defense
            ? c
            : { ...c, shown_defenses: { ...c.shown_defenses, [command.damageType]: command.defense } },
        ),
        effects: [],
      };
    case "fire_event":
      return fireFightEvent(state, command.eventId, deps);
    case "check_events":
      return checkFightEvents(state, deps);
  }
}

export function applyFightCommand(state: FightState, command: FightCommand, deps: FightDeps): FightResult {
  if (isOwnCommand(command)) return applyOwn(state, command, deps);
  const { state: turn, events: raised } = reduceEncounterTurn(state, command, deps);
  // The reducer owns the turn's fields; the events and what has fired are the fight's own and ride along.
  const next: FightState = { ...state, ...turn, events: state.events, eventsFired: state.eventsFired };
  if (!raised.some((e) => e.type === "check_events")) return { state: next, effects: raised };
  const checked = checkFightEvents(next, deps);
  const effects: FightEffect[] = [...raised, ...checked.effects];
  return { state: checked.state, effects };
}
