import { computed, toValue, type MaybeRefOrGetter } from "vue";
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

/** One spell's merged art, for a detail page that reads a single row (#972). */
async function fetchLibrarySpellArtEntry(entryId: string): Promise<LibrarySpellArtEntry | null> {
  const user = getCurrentUser();
  const columns = "entry_id, image_url, portrait_focal_point";
  const [canonicalRes, ownRes] = await Promise.all([
    supabase.from("library_spell_art_canonical").select(columns).eq("entry_id", entryId),
    user
      ? supabase.from("library_spell_art").select(columns).eq("entry_id", entryId).eq("user_id", user.id)
      : Promise.resolve({ data: [] as LibrarySpellArtRow[], error: null }),
  ]);
  if (canonicalRes.error) throw canonicalRes.error;
  if (ownRes.error) throw ownRes.error;

  return mergeLibrarySpellArtLayers(canonicalRes.data, ownRes.data)[entryId] ?? null;
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

/** One spell's merged art. Keyed under `["library-spell-art"]`, so the prefix
 *  invalidation after an art write reaches it. */
export function useLibrarySpellArtEntry(entryId: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "entry", toValue(entryId)] as const),
    queryFn: ({ queryKey: [, , id] }) => fetchLibrarySpellArtEntry(id),
    staleTime: 1000 * 60 * 30,
    enabled: () => !!toValue(entryId) && toValue(enabled),
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
      // An admin write also changes library_spells rows, which the index and
      // the server browse carry art on.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: ["library-spell-index"] }),
        queryClient.invalidateQueries({ queryKey: ["library-spells"] }),
        queryClient.invalidateQueries({ queryKey: ["spells", "browse"] }),
        queryClient.invalidateQueries({ queryKey: ["spells", "by-ids"] }),
      ]);
    },
  });
}
