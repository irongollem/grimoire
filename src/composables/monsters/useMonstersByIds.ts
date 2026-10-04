import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { fetchLibraryMonsterArtEntries, withLibraryArtAll } from "@/composables/library/useLibraryMonsterArt";
import { isUuid } from "@/lib/library/contentIdentity";
import { libraryMonsterRow } from "@/lib/library/libraryMonsterRow";
import { LIBRARY_MONSTER_COLUMNS } from "@/composables/monsters/useMonsters";
import type { Monster } from "@/types/monster.types";

/** Under the "monsters" root so an edit's `invalidateQueries({ queryKey: ["monsters"] })` reaches it. */
const BY_IDS_KEY = ["monsters", "by-ids"] as const;
/** Under the art root so every art write's prefix invalidation reaches it. */
const ART_ENTRIES_KEY = ["library-monster-art", "entries"] as const;
/** PostgREST puts `.in()` in the URL; ~100 ids of 36 characters stays well inside any limit. */
const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

async function fetchByIds(libraryIds: readonly string[], customIds: readonly string[]): Promise<Map<string, Monster>> {
  const [libraryRows, customRows] = await Promise.all([
    Promise.all(
      chunks(libraryIds).map(async (ids) => {
        const { data, error } = await supabase.from("library_monsters").select(LIBRARY_MONSTER_COLUMNS).in("id", ids);
        if (error) throw error;
        return data.map(libraryMonsterRow);
      }),
    ),
    Promise.all(
      chunks(customIds).map(async (ids) => {
        const { data, error } = await supabase.from("monsters").select("*").in("id", ids);
        if (error) throw error;
        return data as Monster[];
      }),
    ),
  ]);
  return new Map([...libraryRows.flat(), ...customRows.flat()].map((m) => [m.id, m]));
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
  });

  const artQuery = useQuery({
    queryKey: computed(() => [...ART_ENTRIES_KEY, split.value.libraryIds] as const),
    queryFn: ({ queryKey: [, , libraryIds] }) => fetchLibraryMonsterArtEntries(libraryIds),
    enabled: () => opts?.withArt === true && split.value.libraryIds.length > 0,
    staleTime: 1000 * 60 * 30,
  });

  const data = computed(() => {
    const monsters = monstersQuery.data.value;
    if (!monsters) return new Map<string, Monster>();
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
