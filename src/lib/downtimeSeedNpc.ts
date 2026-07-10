import type { NpcInsert } from "@/types/npc.types";
import type { DowntimeSeed } from "@/types/downtime.types";

/**
 * Turn a system seed contact into a real, private, editable NPC row.
 *
 * The seed contributes character; everything else takes the campaign default.
 * The clone is an ordinary NPC the DM owns outright — rename it, rewrite it, or
 * delete it. Nothing marks it as seeded, because after this moment it isn't.
 *
 * Deliberately hidden from players (`player_visible_to: []`): the DM decides
 * when a new contact becomes known to the table.
 */
export function npcInsertFromSeed(seed: DowntimeSeed): Omit<NpcInsert, "campaign_id"> {
  return {
    name: seed.npc.name,
    race: seed.npc.race,
    alignment: seed.npc.alignment,
    age: null,
    occupation: seed.npc.occupation,
    appearance: seed.npc.appearance,
    personality: seed.npc.personality,
    backstory: seed.npc.backstory,
    notes: null,
    status: "alive",
    relationship: seed.npc.relationship,
    portrait_url: null,
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: true,
    tags: [...seed.npc.tags],
    stat_block: null,
    scriptorium_doc_id: null,
    player_visible_to: [],
    player_visible_fields: [],
  };
}
