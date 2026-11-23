// Where each record kind Ask names lives, and which column holds its name (#1253). Read as the caller, with the
// campaign in the query, to check an id the browser or the model gave before it is named, read or targeted.
//
// A `room` is a place inside a site, and a site's places are `locations` rows (the map's regions point at them), so it
// reads there; a `canon` entry's name is its title.

import type { AskRecordType } from "../_shared/agent/askContract.ts";

export const ASK_RECORD_TABLES: Record<AskRecordType, { table: string; nameColumn: string }> = {
  npc: { table: "npcs", nameColumn: "name" },
  monster: { table: "monsters", nameColumn: "name" },
  item: { table: "items", nameColumn: "name" },
  spell: { table: "spells", nameColumn: "name" },
  location: { table: "locations", nameColumn: "name" },
  faction: { table: "factions", nameColumn: "name" },
  quest: { table: "quests", nameColumn: "title" },
  quest_beat: { table: "quest_beats", nameColumn: "title" },
  encounter: { table: "encounters", nameColumn: "name" },
  deity: { table: "deities", nameColumn: "name" },
  party_member: { table: "party_members", nameColumn: "name" },
  note: { table: "notes", nameColumn: "title" },
  canon: { table: "canon_entries", nameColumn: "title" },
  room: { table: "locations", nameColumn: "name" },
};
