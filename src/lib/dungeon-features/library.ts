// ── Dungeon Craft library references (#1060) ─────────────────────────────────
//
// Grimoire authors traps, dungeon features, puzzles and roll tables
// (`library_*` tables, text slug ids like `grimoire_hidden_pit`). How a DM
// uses one depends on the kind:
//
//  - Traps and features are REFERENCED, never copied: a placement, an
//    encounter, a door or a puzzle anchor stores the library id in a separate
//    `library_*` column beside the uuid one (each has its own real foreign
//    key). The helpers below pick the right column and read either back.
//  - Puzzles and roll tables are COPIED on use into the DM's own table.
//
// Shadowing: an own row hides the library row of the same kind whose name
// matches (trimmed, case-insensitive). This is deliberately NOT
// `mergeLibraryWithCustom` (lib/library/libraryShadow.ts), whose rule is that
// homebrew never shadows. Here every pre-epic "Populate Examples" copy and
// every Customize copy carries the library name, and a DM must see one
// Hidden Pit, theirs.
//
// A library id is never a uuid, so `isLibraryId` is simply `!isUuid`. The
// entry guards are two named functions (`isLibraryTrap`, `isLibraryFeature`)
// rather than overloads, so a call site says which kind it is narrowing.

import { isUuid } from "@/lib/library/contentIdentity";
import type { DungeonFeatureEntry, LibraryDungeonFeature } from "@/types/dungeonFeature.types";
import type { Encounter } from "@/types/encounter.types";
import type { LocationPlacement } from "@/types/locationPlacement.types";
import type { LibraryTrap, TrapEntry } from "@/types/trap.types";

export function isLibraryId(id: string): boolean {
  return !isUuid(id);
}

export function isLibraryTrap(entry: TrapEntry): entry is LibraryTrap {
  return isLibraryId(entry.id);
}

export function isLibraryFeature(entry: DungeonFeatureEntry): entry is LibraryDungeonFeature {
  return isLibraryId(entry.id);
}

const nameKey = (name: string): string => name.trim().toLowerCase();

/** Library rows whose name no own row carries, then every own row, by name. */
export function shadowByName<L extends { name: string }, O extends { name: string }>(
  library: readonly L[],
  own: readonly O[],
): Array<L | O> {
  const taken = new Set(own.map((o) => nameKey(o.name)));
  const visible: Array<L | O> = [...library.filter((l) => !taken.has(nameKey(l.name))), ...own];
  return visible.sort((a, b) => a.name.localeCompare(b.name));
}

export type PlacementTargetColumn =
  | "trap_id"
  | "library_trap_id"
  | "dungeon_feature_id"
  | "library_dungeon_feature_id";

/** Which placement column holds this trap or feature id. */
export function placementColumnFor(kind: "trap" | "dungeon_feature", id: string): PlacementTargetColumn {
  const library = isLibraryId(id);
  if (kind === "trap") return library ? "library_trap_id" : "trap_id";
  return library ? "library_dungeon_feature_id" : "dungeon_feature_id";
}

/** The trap or feature a placement points at, whichever column holds it.
 *  Null for roll-table and loot-table placements. */
export function placementTargetId(
  p: Pick<LocationPlacement, "trap_id" | "library_trap_id" | "dungeon_feature_id" | "library_dungeon_feature_id">,
): string | null {
  return p.trap_id ?? p.library_trap_id ?? p.dungeon_feature_id ?? p.library_dungeon_feature_id;
}

/** Split mixed trap ids into the two encounter columns. Order preserved
 *  within each, duplicates dropped. */
export function splitTrapRefs(ids: readonly string[]): { trap_ids: string[]; library_trap_ids: string[] } {
  const unique = [...new Set(ids)];
  return {
    trap_ids: unique.filter((id) => !isLibraryId(id)),
    library_trap_ids: unique.filter(isLibraryId),
  };
}

/** Every trap an encounter cites: own first, then library. */
export function encounterTrapRefs(e: Pick<Encounter, "trap_ids" | "library_trap_ids">): string[] {
  return [...e.trap_ids, ...e.library_trap_ids];
}

/** The two anchor columns for a door or puzzle: sets the right one, nulls the other. */
export function featureRefColumns(id: string | null): {
  dungeon_feature_id: string | null;
  library_dungeon_feature_id: string | null;
} {
  if (id === null) return { dungeon_feature_id: null, library_dungeon_feature_id: null };
  return isLibraryId(id)
    ? { dungeon_feature_id: null, library_dungeon_feature_id: id }
    : { dungeon_feature_id: id, library_dungeon_feature_id: null };
}

/** The feature a door or puzzle is anchored to, from whichever column holds it. */
export function featureRefOf(row: {
  dungeon_feature_id: string | null;
  library_dungeon_feature_id: string | null;
}): string | null {
  return row.dungeon_feature_id ?? row.library_dungeon_feature_id;
}
