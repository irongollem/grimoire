import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Monster } from "@/types/monster.types";

const QUERY_KEY = "library-monster-art";
/** Exported alongside LIBRARY_MONSTER_ART_QUERY_KEY so a second query on the
 *  same key (useEntityEmbedData.ts) applies the same staleness window rather
 *  than immediately refetching under a shorter default. */
export const LIBRARY_MONSTER_ART_STALE_TIME = 1000 * 60 * 30; // 30 minutes — art changes rarely

export interface LibraryArtEntry {
  image_url: string | null;
  cutout_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

export interface LibraryArtMap {
  [entryId: string]: LibraryArtEntry;
}

interface LibraryArtRow {
  entry_id: string;
  image_url: string | null;
  cutout_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

const ART_COLUMNS = "entry_id, image_url, cutout_url, portrait_focal_point";

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

/** Exported so `useEntityEmbedData.ts` can run the identical query (same key,
 *  same fetcher) rather than re-deriving the merge — see
 *  LIBRARY_MONSTER_ART_QUERY_KEY's own doc. */
export async function fetchLibraryMonsterArt(): Promise<LibraryArtMap> {
  // library_monster_art_canonical: unowned, readable by any signed-in user.
  // library_monster_art: this user's own private overrides only (RLS).
  const [canonicalRes, ownRes] = await Promise.all([
    supabase.from("library_monster_art_canonical").select(ART_COLUMNS),
    supabase.from("library_monster_art").select(ART_COLUMNS),
  ]);
  if (canonicalRes.error) throw canonicalRes.error;
  if (ownRes.error) throw ownRes.error;

  return mergeLibraryMonsterArtLayers(canonicalRes.data, ownRes.data);
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

async function upsertLibraryMonsterArt(entry: {
  entry_id: string;
  image_url?: string | null;
  cutout_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
}): Promise<void> {
  const user = getCurrentUser();
  const { error } = await supabase
    .from("library_monster_art")
    .upsert({ ...entry, user_id: user!.id }, { onConflict: "user_id,entry_id" });
  if (error) throw error;
}

/**
 * Promotes the admin's own uploaded monster art to canonical: merges it onto
 * whatever canonical row already exists for the same entry_id (per field —
 * an own row that only ever set a cutout must not null out an existing
 * canonical picture), upserts the merged rows into
 * library_monster_art_canonical (admin-only via RLS), then drops the
 * now-redundant private copies. Only ever succeeds for an app admin —
 * private.is_app_admin() gates the canonical table's insert policy.
 */
async function bulkMarkLibraryMonsterArtAsCanonical(): Promise<number> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { data: ownRows, error: fetchErr } = await supabase
    .from("library_monster_art")
    .select(ART_COLUMNS)
    .eq("user_id", user.id);
  if (fetchErr) throw fetchErr;
  if (!ownRows.length) return 0;

  const entryIds = ownRows.map((row) => row.entry_id);
  const { data: existingCanonical, error: canonicalFetchErr } = await supabase
    .from("library_monster_art_canonical")
    .select(ART_COLUMNS)
    .in("entry_id", entryIds);
  if (canonicalFetchErr) throw canonicalFetchErr;

  const existingById = new Map(existingCanonical.map((row) => [row.entry_id, row]));
  const mergedRows = ownRows.map((own) => {
    const existing = existingById.get(own.entry_id);
    return {
      entry_id: own.entry_id,
      image_url: own.image_url ?? existing?.image_url ?? null,
      cutout_url: own.cutout_url ?? existing?.cutout_url ?? null,
      portrait_focal_point: own.portrait_focal_point ?? existing?.portrait_focal_point ?? null,
    };
  });

  const { error: upsertErr } = await supabase
    .from("library_monster_art_canonical")
    .upsert(mergedRows, { onConflict: "entry_id" });
  if (upsertErr) throw upsertErr;

  const { error: deleteErr } = await supabase.from("library_monster_art").delete().eq("user_id", user.id);
  if (deleteErr) throw deleteErr;

  return ownRows.length;
}

/** The exact query key `useLibraryMonsterArt` uses, so another composable can
 *  read the same merged art map via TanStack's cache instead of duplicating
 *  the fetch (`useEntityEmbedData.ts`'s embed lookup for shared monsters). */
export const LIBRARY_MONSTER_ART_QUERY_KEY = [QUERY_KEY] as const;

export function useLibraryMonsterArt() {
  return useQuery({
    queryKey: LIBRARY_MONSTER_ART_QUERY_KEY,
    queryFn: fetchLibraryMonsterArt,
    staleTime: LIBRARY_MONSTER_ART_STALE_TIME,
  });
}

export function useUpsertLibraryMonsterArt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertLibraryMonsterArt,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useBulkMarkLibraryMonsterArtAsCanonical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkMarkLibraryMonsterArtAsCanonical,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/** Copies canonical library_monster_art_canonical rows into library_monsters.image_url in one server-side call. */
export function useSyncLibraryMonsterArt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("sync_library_monster_art");
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["library-monsters"] }),
  });
}
