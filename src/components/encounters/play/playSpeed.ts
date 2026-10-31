import { walkingSpeed } from "@/lib/movement";
import type { RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { NpcListRow } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";

/**
 * A combatant's walking speed in feet, or null when nothing on the board says. A wild-shaped druid walks at the
 * beast's speed (as the party tracker does); a character at the sheet's; a monster or NPC at its stat block's.
 * Null means the move counter shows feet only, with no Dash colouring: it never guesses a speed.
 */
export function combatantSpeed(
  c: RunCombatant,
  sources: {
    monsters: readonly Pick<Monster, "id" | "stat_block">[];
    npcs: readonly Pick<NpcListRow, "id" | "stat_block">[];
    members: readonly Pick<PartyMember, "id" | "speed">[];
  },
): number | null {
  if (c.wildshape) {
    const beast = walkingSpeed(sources.monsters.find((m) => m.id === c.wildshape?.monster_id)?.stat_block?.speed);
    if (beast !== null) return beast;
  }
  if (c.party_member_id) return sources.members.find((m) => m.id === c.party_member_id)?.speed ?? null;
  if (c.monster_id) return walkingSpeed(sources.monsters.find((m) => m.id === c.monster_id)?.stat_block?.speed);
  if (c.npc_id) return walkingSpeed(sources.npcs.find((n) => n.id === c.npc_id)?.stat_block?.speed);
  return null;
}

/**
 * The turn card's movement bar is two speeds long: the first half is the speed, the second a Dash. Returns the
 * share of the bar (0 to 1) the moved feet fill, and where the Dash half begins. Past twice the speed it just fills.
 */
export function moveBarShares(used: number, speed: number): { moved: number; dashFrom: number } {
  if (speed <= 0) return { moved: used > 0 ? 1 : 0, dashFrom: 0.5 };
  return { moved: Math.min(1, used / (speed * 2)), dashFrom: 0.5 };
}
