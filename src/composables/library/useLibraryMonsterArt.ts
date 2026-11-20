import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { writeCanonicalLibraryArt, MONSTER_CANONICAL_ART, type CanonicalArtEdit } from "./writeCanonicalLibraryArt";
import {
  ART_COLUMNS,
  mergeLibraryMonsterArtLayers,
  type LibraryArtEntry,
  type LibraryArtMap,
  type LibraryArtRow,
} from "@/lib/library/monsterArtLayers";

const QUERY_KEY = "library-monster-art";
/** Exported so a second query on the same art keys (useEntityEmbedData.ts)
 *  applies the same staleness window rather than immediately refetching under
 *  a shorter default. */
export const LIBRARY_MONSTER_ART_STALE_TIME = 1000 * 60 * 30; // 30 minutes — art changes rarely

/**
 * One monster's art: the canonical + own-override merge for a single
 * `entry_id` (#972). A detail page reads one row, so it must not download
 * every monster's art to find it. The own-override read names the
 * caller explicitly — RLS bounds it, it does not filter it.
 */
export async function fetchLibraryMonsterArtEntry(entryId: string): Promise<LibraryArtEntry | null> {
  const user = getCurrentUser();
  const [canonicalRes, ownRes] = await Promise.all([
    supabase.from("library_monster_art_canonical").select(ART_COLUMNS).eq("entry_id", entryId),
    user
      ? supabase.from("library_monster_art").select(ART_COLUMNS).eq("entry_id", entryId).eq("user_id", user.id)
      : Promise.resolve({ data: [] as LibraryArtRow[], error: null }),
  ]);
  if (canonicalRes.error) throw canonicalRes.error;
  if (ownRes.error) throw ownRes.error;

  return mergeLibraryMonsterArtLayers(canonicalRes.data, ownRes.data)[entryId] ?? null;
}

/**
 * Several monsters' art in one round trip: the canonical + own-override merge of
 * {@link fetchLibraryMonsterArtEntry} for a set of `entry_id`s, so a screen that
 * shows a handful of stored monsters does not download every monster's art. The
 * own-override read names the caller explicitly, like the single-entry read.
 */
export async function fetchLibraryMonsterArtEntries(entryIds: readonly string[]): Promise<LibraryArtMap> {
  if (entryIds.length === 0) return {};
  const user = getCurrentUser();
  const ids = [...entryIds];
  const [canonicalRes, ownRes] = await Promise.all([
    supabase.from("library_monster_art_canonical").select(ART_COLUMNS).in("entry_id", ids),
    user
      ? supabase.from("library_monster_art").select(ART_COLUMNS).in("entry_id", ids).eq("user_id", user.id)
      : Promise.resolve({ data: [] as LibraryArtRow[], error: null }),
  ]);
  if (canonicalRes.error) throw canonicalRes.error;
  if (ownRes.error) throw ownRes.error;

  return mergeLibraryMonsterArtLayers(canonicalRes.data, ownRes.data);
}

/** Every cache that holds a monster's art or the library row it was synced into. */
function invalidateMonsterArtReaders(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    queryClient.invalidateQueries({ queryKey: ["library-monster-index"] }),
    queryClient.invalidateQueries({ queryKey: ["library-monsters"] }),
    queryClient.invalidateQueries({ queryKey: ["monsters", "browse"] }),
    queryClient.invalidateQueries({ queryKey: ["monsters", "by-ids"] }),
    queryClient.invalidateQueries({ queryKey: ["resolved-monster"] }),
  ]);
}

async function upsertOwnLibraryMonsterArt(entry: CanonicalArtEdit): Promise<void> {
  const user = getCurrentUser();
  const { error } = await supabase
    .from("library_monster_art")
    .upsert({ ...entry, user_id: user!.id }, { onConflict: "user_id,entry_id" });
  if (error) throw error;
}

/** One monster's merged art. Keyed under `["library-monster-art"]`, so the
 *  prefix invalidation after an art write reaches it. */
export function useLibraryMonsterArtEntry(entryId: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "entry", toValue(entryId)] as const),
    queryFn: ({ queryKey: [, , id] }) => fetchLibraryMonsterArtEntry(id),
    staleTime: LIBRARY_MONSTER_ART_STALE_TIME,
    enabled: () => !!toValue(entryId) && toValue(enabled),
  });
}

export function useUpsertLibraryMonsterArt() {
  const queryClient = useQueryClient();
  const auth = useAuthStore();
  return useMutation({
    mutationFn: async (entry: CanonicalArtEdit): Promise<void> => {
      if (auth.isAppAdmin) await writeCanonicalLibraryArt(MONSTER_CANONICAL_ART, entry);
      else await upsertOwnLibraryMonsterArt(entry);
    },
    onSuccess: async () => {
      // An admin write also changes library_monsters rows, which every read
      // below carries or merges art into.
      await invalidateMonsterArtReaders(queryClient);
    },
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
    onSuccess: () => invalidateMonsterArtReaders(queryClient),
  });
}
