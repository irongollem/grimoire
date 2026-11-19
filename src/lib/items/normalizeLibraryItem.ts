import type { Item } from "../../types/item.types.ts";

/**
 * Reshapes a raw `library_items` row into the `Item` shape every consumer
 * (Vault, stores, crafting, factions, NPC inventory, ...) already expects.
 * `library_items` carries no `user_id`/`campaign_id`/`dm_notes`/`spell_ids`/
 * document-item columns: leaving those `undefined` reads as "has content" to
 * a `content !== null` check (feather badge on every SRD item), so every
 * reader of a library row must go through this rather than casting the raw
 * row directly. Used by the browser's readers and by the `encounter-command`
 * edge function (which works out a player's armour class from worn gear), so it
 * imports relatively, with extensions.
 */
export function normalizeLibraryItem(row: Record<string, unknown>): Item {
  return {
    ...row,
    user_id: "",
    campaign_id: null,
    dm_notes: null,
    spell_ids: [],
    content: null,
    content_player_writable: false,
    content_updated_at: null,
  } as unknown as Item;
}
