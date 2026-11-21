/**
 * The encounter tables that hold for the places of a journey (#1222, story 7). One rule for the DM's journey line
 * and the AI table's narrator, so both offer the same tables for the same road.
 *
 * A DM places a roll table on a place in the Atlas ("Coast road encounters" on the Sword Coast). A place's tables
 * hold for every place inside it, unless that place has tables of its own: the Mere of Dead Men has its own, the
 * towns of the coast take the coast's.
 *
 * Imported by the edge functions too, so its imports are relative and carry the extension.
 */

/** A table put on a place: its id and the place it was put on. */
export interface TableOnPlace {
  id: string;
  placeId: string;
}

/**
 * The tables that hold for `placeIds`, in their order, each table once (at the first place it holds for), with the
 * place of the way it was found for. A place's own tables win; a place with none takes those of the nearest place
 * it lies inside that has any.
 */
export function tablesForPlaces<T extends TableOnPlace>(
  placeIds: readonly string[],
  parentOf: (id: string) => string | null,
  tables: readonly T[],
): { table: T; placeId: string }[] {
  const byPlace = new Map<string, T[]>();
  for (const table of tables) {
    const list = byPlace.get(table.placeId);
    if (list === undefined) byPlace.set(table.placeId, [table]);
    else list.push(table);
  }
  const out: { table: T; placeId: string }[] = [];
  const listed = new Set<string>();
  for (const placeId of placeIds) {
    const seen = new Set<string>();
    for (let at: string | null = placeId; at !== null && !seen.has(at); at = parentOf(at)) {
      seen.add(at);
      const here = byPlace.get(at);
      if (here === undefined) continue;
      for (const table of here) {
        if (listed.has(table.id)) continue;
        listed.add(table.id);
        out.push({ table, placeId });
      }
      break;
    }
  }
  return out;
}
