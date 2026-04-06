import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";

const QUERY_KEY = "srd-monster-art";
const STALE_TIME = 1000 * 60 * 30; // 30 minutes — art changes rarely

export interface SrdArtEntry {
  image_url: string | null;
  card_art_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
  card_art_focal_point: { x: number; y: number } | null;
}

export interface SrdArtMap {
  [srdId: string]: SrdArtEntry;
}

async function fetchSrdMonsterArt(): Promise<SrdArtMap> {
  // RLS now returns: own rows + canonical rows (is_canonical = true).
  // Build separate maps so user's own art always wins over canonical.
  const { data, error } = await supabase
    .from("srd_monster_art")
    .select("srd_id, image_url, card_art_url, portrait_focal_point, card_art_focal_point, is_canonical");
  if (error) throw error;

  const canonical: SrdArtMap = {};
  const own: SrdArtMap = {};
  for (const row of data) {
    const entry: SrdArtEntry = {
      image_url: row.image_url,
      card_art_url: row.card_art_url,
      portrait_focal_point: row.portrait_focal_point ?? null,
      card_art_focal_point: row.card_art_focal_point ?? null,
    };
    if (row.is_canonical) {
      canonical[row.srd_id] = entry;
    } else {
      own[row.srd_id] = entry;
    }
  }
  // Own art overrides canonical for the same srd_id
  return { ...canonical, ...own };
}

async function upsertSrdMonsterArt(entry: {
  srd_id: string;
  image_url?: string | null;
  card_art_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
  card_art_focal_point?: { x: number; y: number } | null;
}): Promise<void> {
  const user = getCurrentUser();
  const { error } = await supabase
    .from("srd_monster_art")
    .upsert({ ...entry, user_id: user!.id }, { onConflict: "user_id,srd_id" });
  if (error) throw error;
}

async function bulkMarkSrdMonsterArtAsCanonical(): Promise<number> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("srd_monster_art")
    .update({ is_canonical: true })
    .eq("user_id", user.id)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
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
