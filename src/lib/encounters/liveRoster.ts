import { deepEqual } from "@/lib/utils";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";

/** What the runner pushes into the live row: the round, the turn, the combatants and the fired events. */
export interface RunnerRoster {
  round: number;
  activeIndex: number;
  combatants: readonly RunCombatant[];
  eventsFired: readonly string[];
}

/**
 * Whether the live row holds the roster the runner already has, so that a read
 * of it changes nothing. Positions are left out: the battle maps write them
 * into the row and the runner never holds them, so they always differ and say
 * nothing about the fight. The comparison is by value as the row stores it, so
 * a key the runner left `undefined` matches one the row never had.
 */
export function sameLiveRoster(
  runner: RunnerRoster,
  live: Pick<EncounterState, "current_round" | "active_combatant_index" | "combatants_live" | "events_fired">,
): boolean {
  return (
    runner.round === live.current_round &&
    runner.activeIndex === live.active_combatant_index &&
    deepEqual([...runner.eventsFired], live.events_fired ?? []) &&
    deepEqual(asStored(runner.combatants), asStored(live.combatants_live))
  );
}

function asStored(combatants: readonly RunCombatant[]): unknown {
  return JSON.parse(JSON.stringify(combatants.map((c) => ({ ...c, position: null }))));
}
