import type { Npc } from "../types/npc.types.ts";

/**
 * What PLAYERS may see of an NPC: the name and the portrait, as the player projection hands them out (#1270 review).
 *
 * This is `get_player_visible_npcs` (migration `20261026214440_open_book_ties.sql`, the open-book copy of the projection
 * and `20260804000010` for the live one), reproduced:
 *
 *   name     → null unless 'name' is in player_visible_fields; the cover name while `concealed`, else the true name
 *   portrait → null unless 'portrait' is in player_visible_fields; the cover portrait while `concealed` and one
 *              exists, else the true portrait (the focal point follows the picture chosen)
 *   concealed = (disguise_name or disguise_portrait_url is set) and not is_revealed
 *
 * `getNpcDisplayName` / `getNpcDisplayPortrait` are the DM's view; anything stored in a shared chat message (a line
 * the whole campaign reads forever) must come from here instead.
 */
export function getNpcPlayerFace(npc: Pick<Npc, "name" | "portrait_url" | "portrait_focal_point" | "disguise_name" | "disguise_portrait_url" | "disguise_portrait_focal_point" | "is_revealed"> & { player_visible_fields: readonly string[] }): {
  name: string | null;
  portrait: string | null;
  focal: { x: number; y: number } | null;
} {
  const concealed = !!(npc.disguise_name || npc.disguise_portrait_url) && !npc.is_revealed;
  const name = !npc.player_visible_fields.includes("name") ? null : concealed && npc.disguise_name ? npc.disguise_name : npc.name;
  if (!npc.player_visible_fields.includes("portrait")) return { name, portrait: null, focal: null };
  const cover = concealed && !!npc.disguise_portrait_url;
  return {
    name,
    portrait: cover ? npc.disguise_portrait_url : npc.portrait_url,
    focal: (cover ? npc.disguise_portrait_focal_point : npc.portrait_focal_point) ?? null,
  };
}
