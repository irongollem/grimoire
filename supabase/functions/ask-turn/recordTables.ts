// Where each record kind Ask names lives, and which column holds its name (#1253). Read as the caller, with the
// campaign in the query, to check an id the browser or the model gave before it is named, read or targeted.
//
// A `room` is a place inside a site, and a site's places are `locations` rows (the map's regions point at them), so it
// reads there; a `canon` entry's name is its title.

import type { AskRecordType } from "../_shared/agent/askContract.ts";

// `library` marks a kind a DM can widen to all their campaigns (`campaign_id` null), as the app's own lists of it read
// it (`campaignScopeFilter`): such a row belongs to this campaign too, so Ask may name it and paint it.
export const ASK_RECORD_TABLES: Record<AskRecordType, { table: string; nameColumn: string; library?: true }> = {
  npc: { table: "npcs", nameColumn: "name" },
  monster: { table: "monsters", nameColumn: "name", library: true },
  item: { table: "items", nameColumn: "name", library: true },
  spell: { table: "spells", nameColumn: "name", library: true },
  location: { table: "locations", nameColumn: "name", library: true },
  faction: { table: "factions", nameColumn: "name" },
  quest: { table: "quests", nameColumn: "title", library: true },
  quest_beat: { table: "quest_beats", nameColumn: "title" },
  encounter: { table: "encounters", nameColumn: "name" },
  deity: { table: "deities", nameColumn: "name" },
  party_member: { table: "party_members", nameColumn: "name" },
  note: { table: "notes", nameColumn: "title" },
  canon: { table: "canon_entries", nameColumn: "title" },
  room: { table: "locations", nameColumn: "name", library: true },
};

/**
 * The PostgREST `.or()` filter that keeps a record lookup to what this campaign sees: its own rows, plus for a
 * `library` kind the caller's and the campaign owner's rows set to all campaigns (the app's `campaignScopeFilter`).
 */
export function askRecordScope(type: AskRecordType, campaign: { id: string; user_id: string }, callerId: string): string {
  if (!ASK_RECORD_TABLES[type].library) return `campaign_id.eq.${campaign.id}`;
  const authors = [...new Set([callerId, campaign.user_id])].join(",");
  return `campaign_id.eq.${campaign.id},and(campaign_id.is.null,user_id.in.(${authors}))`;
}
