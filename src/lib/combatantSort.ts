import type { RunCombatant } from "@/types/encounter.types";

// Canonical initiative order for a live encounter: initiative desc (unrolled = last),
// players before monsters/NPCs on a tie, then higher dex_mod first. `active_combatant_index`
// in encounter_state indexes THIS order, so every consumer (the DM runner, the player
// stats panel, and the player battle map) must sort with this exact comparator before
// indexing — otherwise the "active turn" highlight lands on the wrong combatant.
export function compareCombatantsByInitiative(a: RunCombatant, b: RunCombatant): number {
  const ia = a.initiative ?? -999;
  const ib = b.initiative ?? -999;
  if (ib !== ia) return ib - ia;
  if (a.type !== b.type) return a.type === "player" ? -1 : 1;
  return b.dex_mod - a.dex_mod;
}

/** Returns a new array of combatants in canonical initiative order. */
export function sortCombatantsByInitiative(combatants: readonly RunCombatant[]): RunCombatant[] {
  return [...combatants].sort(compareCombatantsByInitiative);
}
