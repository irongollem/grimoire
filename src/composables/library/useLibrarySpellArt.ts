import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { writeCanonicalLibraryArt, SPELL_CANONICAL_ART } from "./writeCanonicalLibraryArt";

const QUERY_KEY = "library-spell-art";

export interface LibrarySpellArtEntry {
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

export interface LibrarySpellArtMap {
  [entryId: string]: LibrarySpellArtEntry;
}

interface LibrarySpellArtRow {
  entry_id: string;
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

/**
 * Canonical art (library_spell_art_canonical — unowned, admin-managed) and a
 * user's private overrides (library_spell_art) are fetched from separate tables.
 * This is the override-precedence resolution: a user's own art always wins
 * over canonical art for the same entry_id.
 */
export function mergeLibrarySpellArtLayers(
  canonicalRows: readonly LibrarySpellArtRow[],
  ownRows: readonly LibrarySpellArtRow[],
): LibrarySpellArtMap {
  const map: LibrarySpellArtMap = {};
  for (const row of canonicalRows) {
    map[row.entry_id] = { image_url: row.image_url, portrait_focal_point: row.portrait_focal_point };
  }
  for (const row of ownRows) {
    map[row.entry_id] = { image_url: row.image_url, portrait_focal_point: row.portrait_focal_point };
  }
  return map;
}

async function fetchLibrarySpellArt(): Promise<LibrarySpellArtMap> {
  // library_spell_art_canonical: unowned, readable by any signed-in user.
  // library_spell_art: this user's own private overrides only (RLS).
  const [canonicalRes, ownRes] = await Promise.all([
    supabase.from("library_spell_art_canonical").select("entry_id, image_url, portrait_focal_point"),
    supabase.from("library_spell_art").select("entry_id, image_url, portrait_focal_point"),
  ]);
  if (canonicalRes.error) throw canonicalRes.error;
  if (ownRes.error) throw ownRes.error;

  return mergeLibrarySpellArtLayers(canonicalRes.data, ownRes.data);
}

type SpellArtEdit = {
  entry_id: string;
  image_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
};

async function upsertOwnLibrarySpellArt(entry: SpellArtEdit): Promise<void> {
  const user = getCurrentUser();
  const { error } = await supabase
    .from("library_spell_art")
    .upsert({ ...entry, user_id: user!.id }, { onConflict: "user_id,entry_id" });
  if (error) throw error;
}

export function useLibrarySpellArt() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchLibrarySpellArt,
    staleTime: 1000 * 60 * 30,
  });
}

export function useUpsertLibrarySpellArt() {
  const queryClient = useQueryClient();
  const auth = useAuthStore();
  return useMutation({
    mutationFn: async (entry: SpellArtEdit): Promise<void> => {
      if (auth.isAppAdmin) await writeCanonicalLibraryArt(SPELL_CANONICAL_ART, entry);
      else await upsertOwnLibrarySpellArt(entry);
    },
    onSuccess: async () => {
      // An admin write also changes library_spells rows, which the lists cache.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: ["library-spells"] }),
      ]);
    },
  });
}
