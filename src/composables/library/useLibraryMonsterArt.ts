import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";

const QUERY_KEY = "library-monster-art";
const STALE_TIME = 1000 * 60 * 30; // 30 minutes — art changes rarely

export interface LibraryArtEntry {
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

export interface LibraryArtMap {
  [entryId: string]: LibraryArtEntry;
}

interface LibraryArtRow {
  entry_id: string;
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

/**
 * Canonical art (library_monster_art_canonical — unowned, admin-managed) and a
 * user's private overrides (library_monster_art) are fetched from separate
 * tables. This is the override-precedence resolution: a user's own art
 * always wins over canonical art for the same entry_id.
 */
export function mergeLibraryMonsterArtLayers(
  canonicalRows: readonly LibraryArtRow[],
  ownRows: readonly LibraryArtRow[],
): LibraryArtMap {
  const map: LibraryArtMap = {};
  for (const row of canonicalRows) {
    map[row.entry_id] = { image_url: row.image_url, portrait_focal_point: row.portrait_focal_point };
  }
  for (const row of ownRows) {
    map[row.entry_id] = { image_url: row.image_url, portrait_focal_point: row.portrait_focal_point };
  }
  return map;
}

async function fetchLibraryMonsterArt(): Promise<LibraryArtMap> {
  // library_monster_art_canonical: unowned, readable by any signed-in user.
  // library_monster_art: this user's own private overrides only (RLS).
  const [canonicalRes, ownRes] = await Promise.all([
    supabase.from("library_monster_art_canonical").select("entry_id, image_url, portrait_focal_point"),
    supabase.from("library_monster_art").select("entry_id, image_url, portrait_focal_point"),
  ]);
  if (canonicalRes.error) throw canonicalRes.error;
  if (ownRes.error) throw ownRes.error;

  return mergeLibraryMonsterArtLayers(canonicalRes.data, ownRes.data);
}

async function upsertLibraryMonsterArt(entry: {
  entry_id: string;
  image_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
}): Promise<void> {
  const user = getCurrentUser();
  const { error } = await supabase
    .from("library_monster_art")
    .upsert({ ...entry, user_id: user!.id }, { onConflict: "user_id,entry_id" });
  if (error) throw error;
}

/**
 * Promotes the admin's own uploaded monster art to canonical: copies it into
 * library_monster_art_canonical (admin-only via RLS), then drops the now-redundant
 * private copy. Only ever succeeds for an app admin — private.is_app_admin()
 * gates the canonical table's insert policy.
 */
async function bulkMarkLibraryMonsterArtAsCanonical(): Promise<number> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { data: ownRows, error: fetchErr } = await supabase
    .from("library_monster_art")
    .select("entry_id, image_url, portrait_focal_point")
    .eq("user_id", user.id);
  if (fetchErr) throw fetchErr;
  if (!ownRows.length) return 0;

  const { error: upsertErr } = await supabase
    .from("library_monster_art_canonical")
    .upsert(ownRows, { onConflict: "entry_id" });
  if (upsertErr) throw upsertErr;

  const { error: deleteErr } = await supabase.from("library_monster_art").delete().eq("user_id", user.id);
  if (deleteErr) throw deleteErr;

  return ownRows.length;
}

export function useLibraryMonsterArt() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchLibraryMonsterArt,
    staleTime: STALE_TIME,
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
