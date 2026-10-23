/**
 * Whether an entry may be in the Open Book, restated from SQL so the Settings tab can show the same answer the
 * release will give. The database is the authority: these mirror `private.open_book_whole_party` and
 * `private.open_book_takes` (migration 20261023230210) and must change with them.
 */

/** True when `visibleTo` holds every party member and the party is not empty. */
export function wholeParty(
  visibleTo: readonly string[] | null | undefined,
  partyIds: readonly string[],
): boolean {
  if (partyIds.length === 0) return false;
  const seen = new Set(visibleTo ?? []);
  return partyIds.every((id) => seen.has(id));
}

/** An eligible entry is in the book by the DM's choice for it, else by the default (`includeShared`). */
export function isInBook(eligible: boolean, entryChoice: boolean | undefined, includeShared: boolean): boolean {
  return eligible && (entryChoice ?? includeShared);
}

/** The slice of a place the NPC rule reads. */
export interface PlaceSharing {
  id: string;
  player_visible_to: readonly string[] | null | undefined;
  is_npcs_shared: boolean;
}

/** The slice of an NPC the rule reads. */
export interface NpcSharing {
  player_visible_to: readonly string[] | null | undefined;
  player_visible_fields: readonly string[] | null | undefined;
  location_id: string | null | undefined;
}

/** Ids of the places that share their residents with the party: whole-party visible and `is_npcs_shared`. */
export function npcSharingPlaceIds(places: readonly PlaceSharing[], partyIds: readonly string[]): Set<string> {
  return new Set(places.filter((p) => p.is_npcs_shared && wholeParty(p.player_visible_to, partyIds)).map((p) => p.id));
}

/** Why an NPC cannot go in the book: the book names everyone in it, and strangers read nothing the party has not seen. */
export type NpcBookBlock = "name" | "party" | null;

/**
 * Mirrors the `folk` section of `private.open_book_snapshot`: the NPC's name is shared, and either the whole
 * party can see them or the place they live in shares its residents with the whole party. Name is checked first,
 * so a hidden name is the reason given even when the party is also missing.
 */
export function npcBookBlock(
  npc: NpcSharing,
  partyIds: readonly string[],
  sharedPlaceIds: ReadonlySet<string>,
): NpcBookBlock {
  if (!(npc.player_visible_fields ?? []).includes("name")) return "name";
  if (partyIds.length === 0) return "party";
  if (wholeParty(npc.player_visible_to, partyIds)) return null;
  if (npc.location_id != null && sharedPlaceIds.has(npc.location_id)) return null;
  return "party";
}

export function npcEligible(
  npc: NpcSharing,
  partyIds: readonly string[],
  sharedPlaceIds: ReadonlySet<string>,
): boolean {
  return npcBookBlock(npc, partyIds, sharedPlaceIds) === null;
}
