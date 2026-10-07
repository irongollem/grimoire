import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { fetchLibraryMonsterArtEntries, withLibraryArtAll } from "@/composables/library/useLibraryMonsterArt";
import { createIdBatcher } from "@/lib/batchById";
import { isUuid } from "@/lib/library/contentIdentity";
import { libraryMonsterRow } from "@/lib/library/libraryMonsterRow";
import { LIBRARY_MONSTER_COLUMNS } from "@/composables/monsters/useMonsters";
import type { Monster } from "@/types/monster.types";

/** Under the "monsters" root so an edit's `invalidateQueries({ queryKey: ["monsters"] })` reaches it. */
const BY_IDS_KEY = ["monsters", "by-ids"] as const;
/** Under the art root so every art write's prefix invalidation reaches it. */
const ART_ENTRIES_KEY = ["library-monster-art", "entries"] as const;
/**
 * `PartyTrackerRow` and its kin call `useMonstersByIds` once per row, so N rows
 * are N concurrent fetches. Batching sits here, in the fetch layer: ids asked
 * for in the same tick go out as one `.in()` request per table (chunked by the
 * batcher), and each caller gets back only its own ids. Query keys are unchanged.
 */
async function fetchLibraryMonsterRows(ids: string[]): Promise<Monster[]> {
  const { data, error } = await supabase.from("library_monsters").select(LIBRARY_MONSTER_COLUMNS).in("id", ids);
  if (error) throw error;
  return data.map(libraryMonsterRow);
}

const libraryBatcher = createIdBatcher<Monster>({
  fetchMany: fetchLibraryMonsterRows,
  idOf: (monster) => monster.id,
});

const customBatcher = createIdBatcher<Monster>({
  fetchMany: async (ids) => {
    const { data, error } = await supabase.from("monsters").select("*").in("id", ids);
    if (error) throw error;
    return data as Monster[];
  },
  idOf: (monster) => monster.id,
});

/**
 * Library rows by id, no source or ruleset filter. Public rows, so a player may
 * call it too. `load`, not `fetch`: it goes through the batcher, so the read
 * itself is `fetchLibraryMonsterRows` and may be shared with other callers.
 */
export async function loadLibraryMonstersByIds(libraryIds: readonly string[]): Promise<Monster[]> {
  return [...(await libraryBatcher.loadMany(libraryIds)).values()];
}

async function fetchByIds(libraryIds: readonly string[], customIds: readonly string[]): Promise<Map<string, Monster>> {
  const [libraryRows, customRows] = await Promise.all([
    libraryBatcher.loadMany(libraryIds),
    customBatcher.loadMany(customIds),
  ]);
  return new Map([...libraryRows, ...customRows]);
}

/** Resolves STORED monster ids (encounter combatants, companions, wild shape
 *  forms, quest attachments) to full monsters.
 *
 *  Applies no enabled-source, ruleset or campaign filter, on purpose: a reference
 *  outlives those decisions, and a scoped-away monster must still resolve or the
 *  combatant silently disappears (#597, #961). Choosing a monster is
 *  `useMonsterIndex`. Ids that match no row are simply absent from the map.
 *
 *  `withArt` also merges library art (canonical plus the caller's override),
 *  read for just these ids. */
export function useMonstersByIds(
  ids: MaybeRefOrGetter<readonly (string | null | undefined)[]>,
  opts?: { withArt?: boolean },
): { data: ComputedRef<Map<string, Monster>>; isLoading: ComputedRef<boolean> } {
  // Sorted and deduped so the cache key does not depend on the order the caller listed them.
  const split = computed(() => {
    const unique = [...new Set(toValue(ids).filter((id): id is string => !!id))].sort();
    return { libraryIds: unique.filter((id) => !isUuid(id)), customIds: unique.filter(isUuid) };
  });
  const hasIds = () => split.value.libraryIds.length + split.value.customIds.length > 0;

  const monstersQuery = useQuery({
    queryKey: computed(() => [...BY_IDS_KEY, split.value.libraryIds, split.value.customIds] as const),
    queryFn: ({ queryKey: [, , libraryIds, customIds] }) => fetchByIds(libraryIds, customIds),
    enabled: hasIds,
    staleTime: Infinity,
    // A spawn mid-fight changes the key; keep resolved monsters (and `isLoading` false) while the new set loads.
    placeholderData: keepPreviousData,
  });

  const artQuery = useQuery({
    queryKey: computed(() => [...ART_ENTRIES_KEY, split.value.libraryIds] as const),
    queryFn: ({ queryKey: [, , libraryIds] }) => fetchLibraryMonsterArtEntries(libraryIds),
    enabled: () => opts?.withArt === true && split.value.libraryIds.length > 0,
    staleTime: 1000 * 60 * 30,
    // So a refetch never briefly yields art-less monsters.
    placeholderData: keepPreviousData,
  });

  const data = computed(() => {
    const stored = monstersQuery.data.value;
    if (!stored || !hasIds()) return new Map<string, Monster>();
    // A placeholder is the previous key's rows: show only what is still requested.
    const wanted = new Set([...split.value.libraryIds, ...split.value.customIds]);
    const monsters = monstersQuery.isPlaceholderData.value
      ? new Map([...stored].filter(([id]) => wanted.has(id)))
      : stored;
    const art = artQuery.data.value;
    if (!opts?.withArt || !art) return monsters;
    const withArt = withLibraryArtAll(
      [...monsters.values()].filter((m) => m.is_shared),
      art,
    );
    const merged = new Map(monsters);
    for (const m of withArt) merged.set(m.id, m);
    return merged;
  });

  const isLoading = computed(() => monstersQuery.isLoading.value || artQuery.isLoading.value);
  return { data, isLoading };
}
