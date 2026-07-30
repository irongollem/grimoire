import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";

const QUERY_KEY = "srd-monster-art";
const STALE_TIME = 1000 * 60 * 30; // 30 minutes — art changes rarely

export interface SrdArtEntry {
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

export interface SrdArtMap {
  [srdId: string]: SrdArtEntry;
}

interface SrdArtRow {
  srd_id: string;
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

/**
 * Canonical art (srd_monster_art_canonical — unowned, admin-managed) and a
 * user's private overrides (srd_monster_art) are fetched from separate
 * tables. This is the override-precedence resolution: a user's own art
 * always wins over canonical art for the same srd_id.
 */
export function mergeSrdMonsterArtLayers(
  canonicalRows: readonly SrdArtRow[],
  ownRows: readonly SrdArtRow[],
): SrdArtMap {
  const map: SrdArtMap = {};
  for (const row of canonicalRows) {
    map[row.srd_id] = { image_url: row.image_url, portrait_focal_point: row.portrait_focal_point };
  }
  for (const row of ownRows) {
    map[row.srd_id] = { image_url: row.image_url, portrait_focal_point: row.portrait_focal_point };
  }
  return map;
}

async function fetchSrdMonsterArt(): Promise<SrdArtMap> {
  // srd_monster_art_canonical: unowned, readable by any signed-in user.
  // srd_monster_art: this user's own private overrides only (RLS).
  const [canonicalRes, ownRes] = await Promise.all([
    supabase.from("srd_monster_art_canonical").select("srd_id, image_url, portrait_focal_point"),
    supabase.from("srd_monster_art").select("srd_id, image_url, portrait_focal_point"),
  ]);
  if (canonicalRes.error) throw canonicalRes.error;
  if (ownRes.error) throw ownRes.error;

  return mergeSrdMonsterArtLayers(canonicalRes.data, ownRes.data);
}

async function upsertSrdMonsterArt(entry: {
  srd_id: string;
  image_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
}): Promise<void> {
  const user = getCurrentUser();
  const { error } = await supabase
    .from("srd_monster_art")
    .upsert({ ...entry, user_id: user!.id }, { onConflict: "user_id,srd_id" });
  if (error) throw error;
}

/**
 * Promotes the admin's own uploaded monster art to canonical: copies it into
 * srd_monster_art_canonical (admin-only via RLS), then drops the now-redundant
 * private copy. Only ever succeeds for an app admin — private.is_app_admin()
 * gates the canonical table's insert policy.
 */
async function bulkMarkSrdMonsterArtAsCanonical(): Promise<number> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const { data: ownRows, error: fetchErr } = await supabase
    .from("srd_monster_art")
    .select("srd_id, image_url, portrait_focal_point")
    .eq("user_id", user.id);
  if (fetchErr) throw fetchErr;
  if (!ownRows.length) return 0;

  const { error: upsertErr } = await supabase
    .from("srd_monster_art_canonical")
    .upsert(ownRows, { onConflict: "srd_id" });
  if (upsertErr) throw upsertErr;

  const { error: deleteErr } = await supabase.from("srd_monster_art").delete().eq("user_id", user.id);
  if (deleteErr) throw deleteErr;

  return ownRows.length;
}

export function useSrdMonsterArt() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchSrdMonsterArt,
    staleTime: STALE_TIME,
  });
}

export function useUpsertSrdMonsterArt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertSrdMonsterArt,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useBulkMarkSrdMonsterArtAsCanonical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkMarkSrdMonsterArtAsCanonical,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/** Copies canonical srd_monster_art_canonical rows into srd_monsters.image_url in one server-side call. */
export function useSyncSrdArtToSharedTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("sync_srd_monster_art_to_shared_table");
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["srd-monsters"] }),
  });
}
