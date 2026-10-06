import type { RouteLocationRaw } from "vue-router";
import { placeRoute } from "@/lib/locations/placeRoute";

/**
 * Where each entity type keeps its one DM note (#983).
 *
 * Nine types keep it in a column on their own table, which is DM-only by RLS.
 * The rest keep it as the DM's own private `entity_notes` row, and that is not
 * a style choice: players can select deity and species rows and every member
 * can select companions, so a notes column there would travel to players with
 * the row. Factions, quests, encounters and party members have no DM-notes
 * column at all. A DM note is never shared with players in any form, so the
 * private row (`is_private`, not `shared_with_dm`) is the only safe home.
 * The test holds deity, species and companion off the column list.
 */
export type DmNoteEntityType =
  | "npc" | "monster" | "item" | "trap" | "puzzle" | "dungeon_feature" | "loot_table" | "roll_table"
  | "location" | "deity" | "species" | "faction" | "companion" | "quest" | "encounter" | "party_member";

export type DmNoteStore =
  | { kind: "column"; table: string; column: "notes" | "dm_notes" }
  | { kind: "entity_note" };

export interface DmNoteEntry {
  type: DmNoteEntityType;
  label: string;
  store: DmNoteStore;
  route: (id: string) => RouteLocationRaw | null;
}

function column(table: string, col: "notes" | "dm_notes"): DmNoteStore {
  return { kind: "column", table, column: col };
}

const ENTITY_NOTE: DmNoteStore = { kind: "entity_note" };

export const DM_NOTE_ENTITIES: Readonly<Record<DmNoteEntityType, DmNoteEntry>> = {
  npc: { type: "npc", label: "NPC", store: column("npcs", "notes"), route: (id) => `/npcs/${id}` },
  monster: { type: "monster", label: "Monster", store: column("monsters", "notes"), route: (id) => `/monsters/${id}` },
  item: { type: "item", label: "Item", store: column("items", "dm_notes"), route: (id) => `/vault/${id}` },
  trap: { type: "trap", label: "Trap", store: column("traps", "notes"), route: (id) => `/traps/${id}` },
  puzzle: { type: "puzzle", label: "Puzzle", store: column("puzzle_rooms", "notes"), route: (id) => `/puzzles/${id}` },
  dungeon_feature: {
    type: "dungeon_feature",
    label: "Dungeon feature",
    store: column("dungeon_features", "notes"),
    route: (id) => `/dungeon-features/${id}`,
  },
  loot_table: { type: "loot_table", label: "Loot table", store: column("loot_tables", "notes"), route: (id) => `/loot-tables/${id}` },
  roll_table: {
    type: "roll_table",
    label: "Roll table",
    store: column("roll_tables", "notes"),
    route: () => ({ path: "/dungeon-craft", query: { tab: "roll-tables" } }),
  },
  location: { type: "location", label: "Location", store: column("locations", "notes"), route: (id) => placeRoute(id) },
  deity: { type: "deity", label: "Deity", store: ENTITY_NOTE, route: (id) => `/deities/${id}` },
  species: { type: "species", label: "Species", store: ENTITY_NOTE, route: (id) => `/species/${id}` },
  faction: { type: "faction", label: "Faction", store: ENTITY_NOTE, route: (id) => `/factions/${id}` },
  companion: { type: "companion", label: "Companion", store: ENTITY_NOTE, route: () => "/party" },
  quest: { type: "quest", label: "Quest", store: ENTITY_NOTE, route: (id) => `/quests/${id}` },
  encounter: { type: "encounter", label: "Encounter", store: ENTITY_NOTE, route: (id) => `/encounters/${id}` },
  party_member: { type: "party_member", label: "Party member", store: ENTITY_NOTE, route: (id) => `/party/${id}` },
};

export function dmNoteEntry(type: DmNoteEntityType): DmNoteEntry {
  return DM_NOTE_ENTITIES[type];
}

/** Tables whose rows carry a DM note column; a change to one refreshes its `["dm-note", table, id]` read. */
export const DM_NOTE_COLUMN_TABLES: ReadonlySet<string> = new Set(
  Object.values(DM_NOTE_ENTITIES).flatMap((e) => (e.store.kind === "column" ? [e.store.table] : [])),
);
