import type { NpcInsert } from "@/types/npc.types";
import type { ItemInsert } from "@/types/item.types";
import type { NoteInsert } from "@/types/notes.types";
import type {
  DowntimeSeedItem,
  DowntimeSeedNote,
  DowntimeSeedNpc,
} from "@/types/downtime.types";
import { markdownToTiptapJson } from "@/lib/markdownToTiptap";

/**
 * Turn a system seed into a real, private, editable campaign row (#486, Phase 2).
 *
 * Each builder returns the insert payload *minus* `campaign_id` — the resolve
 * mutation stamps that. The clone is an ordinary entity the DM owns outright:
 * rename it, rewrite it, delete it. Nothing marks it as seeded, because after
 * this moment it isn't.
 *
 * A resolved draw mints campaign *content* (an NPC, an item, a note); it never
 * mutates a character. Anything that touches a player's sheet — coin, HP, a
 * condition — travels as a `proposed_effect` the DM ticks, not as a side effect
 * of cloning the reward.
 */

/**
 * Seed contacts are hidden from players by default (`player_visible_to: []`):
 * the DM decides when a new face becomes known to the table.
 */
export function npcInsertFromSeed(npc: DowntimeSeedNpc): Omit<NpcInsert, "campaign_id"> {
  return {
    name: npc.name,
    race: npc.race,
    alignment: npc.alignment,
    age: null,
    occupation: npc.occupation,
    appearance: npc.appearance,
    personality: npc.personality,
    backstory: npc.backstory,
    notes: null,
    status: "alive",
    relationship: npc.relationship,
    portrait_url: null,
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: true,
    tags: [...npc.tags],
    stat_block: null,
    scriptorium_doc_id: null,
    player_visible_to: [],
    player_visible_fields: [],
  };
}

/**
 * A minted item is a private campaign entry, not a canonical/SRD row, so it is
 * never marked `is_canonical` and never lands under the `srd/` prefix. The seed
 * supplies flavour; everything else takes a mundane, un-magical default the DM
 * can dress up.
 */
export function itemInsertFromSeed(item: DowntimeSeedItem): Omit<ItemInsert, "campaign_id"> {
  return {
    name: item.name,
    item_type: item.item_type,
    subtype: item.subtype,
    rarity: item.rarity,
    requires_attunement: item.requires_attunement,
    attunement_requirements: null,
    weight: item.weight,
    cost: item.cost,
    damage_rolls: null,
    armor_class: null,
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    description: item.description,
    source: null,
    tags: [...item.tags],
    image_url: null,
    is_arcane_focus: false,
    curse_description: null,
  };
}

/**
 * A minted note. The seed authors Markdown; `notes.content` wants Tiptap JSON,
 * so we convert here — a seed never hand-writes the editor's document shape.
 * Hidden from players by default; the DM shares it when the fiction earns it.
 */
export function noteInsertFromSeed(note: DowntimeSeedNote): Omit<NoteInsert, "campaign_id"> {
  return {
    title: note.title,
    content: markdownToTiptapJson(note.body),
    category: note.category,
    tags: [...note.tags],
    session_num: null,
    is_pinned: false,
    player_visible_to: [],
    session_start_year: null,
    session_start_month: null,
    session_start_day: null,
    session_end_year: null,
    session_end_month: null,
    session_end_day: null,
    session_real_date: null,
    linked_calendar_event_id: null,
  };
}
