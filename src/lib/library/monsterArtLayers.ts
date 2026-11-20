// Pure art-layer rules for library monsters, in a module the edge functions can import (relative `.ts` imports only, see
// `src/rules/edgeImportable.test.ts`): the browser's reads (`useLibraryMonsterArt.ts`) and the server's fight roster
// (`supabase/functions/_shared/fightRoster.ts`) apply the same merge, so it lives once.
import type { Monster } from "../../types/monster.types.ts";

export interface LibraryArtEntry {
  image_url: string | null;
  cutout_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

export interface LibraryArtMap {
  [entryId: string]: LibraryArtEntry;
}

export interface LibraryArtRow {
  entry_id: string;
  image_url: string | null;
  cutout_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

export const ART_COLUMNS = "entry_id, image_url, cutout_url, portrait_focal_point";

function toEntry(row: LibraryArtRow): LibraryArtEntry {
  return { image_url: row.image_url, cutout_url: row.cutout_url, portrait_focal_point: row.portrait_focal_point };
}

/**
 * Canonical art (library_monster_art_canonical — unowned, admin-managed) and a
 * user's private overrides (library_monster_art) are fetched from separate
 * tables. This is the override-precedence resolution — but PER FIELD rather
 * than per whole row (#917 story 1): a DM who overrides only the cutout
 * (leaving image_url null on their own row) still gets the canonical picture
 * for the fields they didn't touch, rather than losing it because *an*
 * override row exists. A null on the own row means "no override for this
 * field", never "clear this field" — there is no way to blank a canonical
 * field from a private override today.
 */
export function mergeLibraryMonsterArtLayers(
  canonicalRows: readonly LibraryArtRow[],
  ownRows: readonly LibraryArtRow[],
): LibraryArtMap {
  const map: LibraryArtMap = {};
  for (const row of canonicalRows) {
    map[row.entry_id] = toEntry(row);
  }
  for (const row of ownRows) {
    const canonical = map[row.entry_id];
    map[row.entry_id] = {
      image_url: row.image_url ?? canonical?.image_url ?? null,
      cutout_url: row.cutout_url ?? canonical?.cutout_url ?? null,
      portrait_focal_point: row.portrait_focal_point ?? canonical?.portrait_focal_point ?? null,
    };
  }
  return map;
}

/**
 * Applies a merged art-layer entry onto a shared (library) monster row, per
 * field — an art field the entry leaves null falls back to the row's own
 * value rather than blanking it. Pure so it's usable both by
 * `useMonsterWithArt` (a live shared row) and by the Scriptorium embed
 * fetcher (`useEntityEmbedData.ts`), which needs the exact same merge without
 * paying for a second copy of it.
 */
export function withLibraryArt<T extends Pick<Monster, "image_url" | "cutout_url" | "portrait_focal_point">>(
  row: T,
  art: LibraryArtEntry | undefined,
): T {
  if (!art) return row;
  return {
    ...row,
    image_url: art.image_url ?? row.image_url,
    cutout_url: art.cutout_url ?? row.cutout_url,
    portrait_focal_point: art.portrait_focal_point ?? row.portrait_focal_point,
  };
}

/**
 * `withLibraryArt` over a list of library rows, keyed by row id. The monster
 * grids render portraits too, so they merge the same layers the detail view
 * does: without this a DM's focal point or private picture showed in the
 * modal and not on the card (#955). Rows without an entry, or a map that has
 * not loaded yet, come back unchanged.
 */
export function withLibraryArtAll<T extends Pick<Monster, "id" | "image_url" | "cutout_url" | "portrait_focal_point">>(
  rows: readonly T[],
  artMap: LibraryArtMap | undefined,
): T[] {
  if (!artMap) return [...rows];
  return rows.map((row) => withLibraryArt(row, artMap[row.id]));
}
