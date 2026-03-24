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
  const { data, error } = await supabase
    .from("srd_monster_art")
    .select("srd_id, image_url, card_art_url, portrait_focal_point, card_art_focal_point");
  if (error) throw error;
  const map: SrdArtMap = {};
  for (const row of data) {
    map[row.srd_id] = {
      image_url: row.image_url,
      card_art_url: row.card_art_url,
      portrait_focal_point: row.portrait_focal_point ?? null,
      card_art_focal_point: row.card_art_focal_point ?? null,
    };
  }
  return map;
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
