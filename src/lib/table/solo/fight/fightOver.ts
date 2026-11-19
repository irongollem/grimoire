import type { FactionDef, RunCombatant } from "@/types/encounter.types";
import { areHostile, isHostileTo, type FactionSides } from "@/rules/fight/sides";

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

/**
 * Whether anyone the creature would fight is still on their feet: an opponent by the fight's factions with hit points
 * left (the rule the server's own turns go by, `isHostileTo`). With nobody, the creature's turn is passed in silence.
 */
export function hasSomeoneToFight(mover: Pick<RunCombatant, "instance_id" | "faction_id">, combatants: readonly Pick<RunCombatant, "instance_id" | "faction_id" | "hp">[], factions: FactionSides): boolean {
  return combatants.some((c) => c.instance_id !== mover.instance_id && c.hp > 0 && isHostileTo(mover, c, factions));
}
