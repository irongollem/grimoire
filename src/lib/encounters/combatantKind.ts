import type { RunCombatant } from "@/types/encounter.types";

/**
 * The badge beside a combatant's name on the player's combat list. An NPC in
 * the fight is a "monster" combatant carrying an `npc_id`, so the type alone
 * cannot tell an NPC from a monster; it used to label every non-player "NPC".
 */
export function combatantKindLabel(c: Pick<RunCombatant, "type" | "npc_id">): "PC" | "NPC" | "Monster" {
  if (c.type === "player") return "PC";
  return c.npc_id ? "NPC" : "Monster";
}
