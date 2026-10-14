// "Customize" (#1060): the one deliberate way a library trap or feature becomes
// the DM's own row. Using one anywhere else stores a reference instead.
//
// The name is kept on purpose: an own row hides the library row of the same
// name (see `shadowByName`), so the copy replaces its original in every pick
// list. The image is shared canonical art, copied by URL; deleting the copy is
// safe because `deleteUnreferencedByPublicUrl` sees the library column.

import type { DungeonFeatureInsert, LibraryDungeonFeature } from "@/types/dungeonFeature.types";
import type { LibraryTrap, TrapInsert } from "@/types/trap.types";
import type { LibraryPuzzle, PuzzleInsert } from "@/types/puzzle.types";
import type { LibraryRollTable, RollTableEntry, RollTableInsert } from "@/types/rollTable.types";

/** Every content column of the library trap, scoped to `campaignId`. */
export function libraryTrapToInsert(trap: LibraryTrap, campaignId: string | null): TrapInsert {
  const { id: _id, source: _source, created_at: _c, updated_at: _u, ...content } = trap;
  return { ...content, campaign_id: campaignId };
}

/** Every content column of the library feature, scoped to `campaignId`. */
export function libraryFeatureToInsert(
  feature: LibraryDungeonFeature,
  campaignId: string | null,
): DungeonFeatureInsert {
  const { id: _id, source: _source, created_at: _c, updated_at: _u, ...content } = feature;
  return { ...content, campaign_id: campaignId };
}

/**
 * "Use in campaign" for a puzzle (#1060). Puzzles are copied on use, so the copy
 * starts exactly as a freshly made one: not shared, no hints given, no audience,
 * no room or feature anchor. The name is unchanged so it shadows its original.
 */
export function libraryPuzzleToInsert(puzzle: LibraryPuzzle, campaignId: string): PuzzleInsert {
  const { id: _id, source: _source, created_at: _c, updated_at: _u, ...content } = puzzle;
  return {
    ...content,
    campaign_id: campaignId,
    is_shared: false,
    shared_hints: [],
    player_visible_to: [],
    location_id: null,
    dungeon_feature_id: null,
    library_dungeon_feature_id: null,
  };
}

/** "Use in campaign" for a roll table (#1060): entries gain the ids the editor keys on. */
export function libraryRollTableToInsert(table: LibraryRollTable, campaignId: string): RollTableInsert {
  const { id: _id, source: _source, created_at: _c, updated_at: _u, entries, ...content } = table;
  return {
    ...content,
    campaign_id: campaignId,
    entries: entries.map(
      (e): RollTableEntry => ({
        id: crypto.randomUUID(),
        min: e.min,
        max: e.max,
        label: e.label,
        encounter_id: null,
        notes: e.notes,
      }),
    ),
  };
}
