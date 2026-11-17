import type { FactionDef, RunCombatant } from "@/types/encounter.types";
import { areHostile } from "./foeView";

export type FightStanding = "ongoing" | "foes_out" | "you_are_down";

/**
 * Whether the fight has ended by itself. A foe that left the fight is absent from the list, so it counts as out.
 */
export function fightStanding(
  combatants: readonly RunCombatant[],
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[],
  playedInstanceId: string,
): FightStanding {
  const played = combatants.find((c) => c.instance_id === playedInstanceId);
  // Before the fight has been read the roster can be empty; "no foes left" would then end it on arrival.
  if (played === undefined) return "ongoing";
  if (played.hp <= 0) return "you_are_down";
  const foeStands = combatants.some((c) => areHostile(factions, played.faction_id, c.faction_id) && c.hp > 0);
  return foeStands ? "ongoing" : "foes_out";
}
