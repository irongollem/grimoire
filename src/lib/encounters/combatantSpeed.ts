import { walkingSpeed } from "../movement.ts";
import type { RunCombatant } from "../../types/encounter.types.ts";
import type { Monster } from "../../types/monster.types.ts";
import type { NpcListRow } from "../../types/npc.types.ts";
import type { PartyMember } from "../../types/party.types.ts";

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
