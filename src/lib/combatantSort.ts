import type { RunCombatant } from "@/types/encounter.types";

// Canonical initiative order for a live encounter: initiative desc (unrolled = last),
// players before monsters/NPCs on a tie, then higher initiative modifier first —
// the same modifier (declared initiative_bonus, falling back to dex_mod) used
// when rolling, via `initiativeModifier`, so the tie-break matches what actually
// broke the tie on the roll. `active_combatant_index` in encounter_state indexes
// THIS order, so every consumer (the DM runner, the player stats panel, and the
// player battle map) must sort with this exact comparator before indexing —
// otherwise the "active turn" highlight lands on the wrong combatant.
export function compareCombatantsByInitiative(a: RunCombatant, b: RunCombatant): number {
  const ia = a.initiative ?? -999;
  const ib = b.initiative ?? -999;
  if (ib !== ia) return ib - ia;
  if (a.type !== b.type) return a.type === "player" ? -1 : 1;
  return initiativeModifier(b) - initiativeModifier(a);
}

/** Returns a new array of combatants in canonical initiative order. */
export function sortCombatantsByInitiative(combatants: readonly RunCombatant[]): RunCombatant[] {
  return [...combatants].sort(compareCombatantsByInitiative);
}

/**
 * The d20 modifier used when (re)rolling this combatant's initiative.
 * Monsters whose stat block declares a 2024 `initiative_bonus` use that value
 * outright (it already accounts for proficiency etc.); everyone else — 2014
 * monsters, NPCs, and players — falls back to the plain DEX modifier.
 */
export function initiativeModifier(c: Pick<RunCombatant, "dex_mod" | "initiative_bonus">): number {
  return c.initiative_bonus ?? c.dex_mod;
}
