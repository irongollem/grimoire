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

async function fetchSrdSpellArt(): Promise<SrdSpellArtMap> {
  const { data, error } = await supabase
    .from("srd_spell_art")
    .select("srd_id, image_url, portrait_focal_point, is_canonical");
  if (error) throw error;

  const canonical: SrdSpellArtMap = {};
  const own: SrdSpellArtMap = {};
  for (const row of data) {
    const entry: SrdSpellArtEntry = {
      image_url: row.image_url,
      portrait_focal_point: row.portrait_focal_point ?? null,
    };
    if (row.is_canonical) canonical[row.srd_id] = entry;
    else own[row.srd_id] = entry;
  }
  return { ...canonical, ...own };
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

export function useBulkMarkSrdSpellArtAsCanonical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("srd_spell_art")
        .update({ is_canonical: true })
        .eq("user_id", user.id)
        .select("id");
      if (error) throw error;
      return (data ?? []).length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
