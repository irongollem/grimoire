// ── Prep material anchored to a room (#788, epic #780) ───────────────────────
//
// A row places one piece of reusable prep material — a trap, a dungeon
// feature, a roll table or a loot table — inside a location. It is a
// many-to-many join, not a `location_id` column on each of those tables:
// a trap template may sit in several rooms, and `dungeon_features` in
// particular carries no `campaign_id` at all (it's a user-scoped catalogue),
// so a single-location column would make a reusable fixture single-use.
//
// Exactly one of the four `*_id` columns is set — a real FK each, not a
// polymorphic (kind, ref_id) pair — enforced by the
// `location_placements_one_target` check constraint. There is deliberately
// no `kind` column in the database; `placementKind` below derives it for
// display so the two shapes can never drift apart.

export interface LocationPlacement {
  id: string;
  user_id: string;
  location_id: string;
  trap_id: string | null;
  dungeon_feature_id: string | null;
  roll_table_id: string | null;
  loot_table_id: string | null;
  /** DM note on what this entry is doing in this room, e.g. "triggers the
   *  portcullis at the far end" — the catalogue entry says what it is, this
   *  says what it's for here. */
  note: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface LocationPlacementInsert {
  location_id: string;
  trap_id?: string | null;
  dungeon_feature_id?: string | null;
  roll_table_id?: string | null;
  loot_table_id?: string | null;
  note?: string | null;
  sort_order?: number | null;
}

export interface LocationPlacementUpdate {
  note?: string | null;
  sort_order?: number | null;
}

export const LOCATION_PLACEMENT_KINDS = [
  "trap",
  "dungeon_feature",
  "roll_table",
  "loot_table",
] as const;
export type LocationPlacementKind = (typeof LOCATION_PLACEMENT_KINDS)[number];

export const LOCATION_PLACEMENT_KIND_LABELS: Record<LocationPlacementKind, string> = {
  trap: "Trap",
  dungeon_feature: "Feature",
  roll_table: "Roll Table",
  loot_table: "Loot Table",
};

/**
 * Which of the four exclusive-arc FK columns is set on a row. The database
 * enforces exactly one via `location_placements_one_target`
 * (`num_nonnulls(...) = 1`), so this always resolves for a row that actually
 * came from the table — the thrown branch only fires for a malformed literal
 * assembled by a bug in this codebase, never for anything the database
 * could actually return.
 */
export function placementKind(
  row: Pick<LocationPlacement, "trap_id" | "dungeon_feature_id" | "roll_table_id" | "loot_table_id">,
): LocationPlacementKind {
  if (row.trap_id) return "trap";
  if (row.dungeon_feature_id) return "dungeon_feature";
  if (row.roll_table_id) return "roll_table";
  if (row.loot_table_id) return "loot_table";
  throw new Error("location_placements row has no target set (violates location_placements_one_target)");
}
