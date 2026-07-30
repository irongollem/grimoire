import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";

const QUERY_KEY = "srd-spell-art";

export interface SrdSpellArtEntry {
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

export interface SrdSpellArtMap {
  [srdId: string]: SrdSpellArtEntry;
}

interface SrdSpellArtRow {
  srd_id: string;
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

/**
 * Canonical art (srd_spell_art_canonical — unowned, admin-managed) and a
 * user's private overrides (srd_spell_art) are fetched from separate tables.
 * This is the override-precedence resolution: a user's own art always wins
 * over canonical art for the same srd_id.
 */
export function mergeSrdSpellArtLayers(
  canonicalRows: readonly SrdSpellArtRow[],
  ownRows: readonly SrdSpellArtRow[],
): SrdSpellArtMap {
  const map: SrdSpellArtMap = {};
  for (const row of canonicalRows) {
    map[row.srd_id] = { image_url: row.image_url, portrait_focal_point: row.portrait_focal_point };
  }
  for (const row of ownRows) {
    map[row.srd_id] = { image_url: row.image_url, portrait_focal_point: row.portrait_focal_point };
  }
  return map;
}

async function fetchSrdSpellArt(): Promise<SrdSpellArtMap> {
  // srd_spell_art_canonical: unowned, readable by any signed-in user.
  // srd_spell_art: this user's own private overrides only (RLS).
  const [canonicalRes, ownRes] = await Promise.all([
    supabase.from("srd_spell_art_canonical").select("srd_id, image_url, portrait_focal_point"),
    supabase.from("srd_spell_art").select("srd_id, image_url, portrait_focal_point"),
  ]);
  if (canonicalRes.error) throw canonicalRes.error;
  if (ownRes.error) throw ownRes.error;

  return mergeSrdSpellArtLayers(canonicalRes.data, ownRes.data);
}

async function upsertSrdSpellArt(entry: {
  srd_id: string;
  image_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
}): Promise<void> {
  const user = getCurrentUser();
  const { error } = await supabase
    .from("srd_spell_art")
    .upsert({ ...entry, user_id: user!.id }, { onConflict: "user_id,srd_id" });
  if (error) throw error;
}

export function useSrdSpellArt() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchSrdSpellArt,
    staleTime: 1000 * 60 * 30,
  });
}

export function useUpsertSrdSpellArt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertSrdSpellArt,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/**
 * Promotes the admin's own uploaded spell art to canonical: copies it into
 * srd_spell_art_canonical (admin-only via RLS), then drops the now-redundant
 * private copy. Only ever succeeds for an app admin — private.is_app_admin()
 * gates the canonical table's insert policy.
 */
export function useBulkMarkSrdSpellArtAsCanonical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      const { data: ownRows, error: fetchErr } = await supabase
        .from("srd_spell_art")
        .select("srd_id, image_url, portrait_focal_point")
        .eq("user_id", user.id);
      if (fetchErr) throw fetchErr;
      if (!ownRows.length) return 0;

      const { error: upsertErr } = await supabase
        .from("srd_spell_art_canonical")
        .upsert(ownRows, { onConflict: "srd_id" });
      if (upsertErr) throw upsertErr;

      const { error: deleteErr } = await supabase.from("srd_spell_art").delete().eq("user_id", user.id);
      if (deleteErr) throw deleteErr;

      return ownRows.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
