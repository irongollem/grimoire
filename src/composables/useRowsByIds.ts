import { computed } from "vue";
import { keepPreviousData, useQuery } from "@tanstack/vue-query";

/** Order-independent, de-duplicated, blanks (null, undefined, "") dropped: the cache key must not depend on how a caller listed the ids. */
export function normaliseIds(ids: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))].sort();
}

const isIdList = (part: unknown): part is string[] => Array.isArray(part);

/**
 * The shell every "read exactly these ids" hook shares (items, spells, monsters):
 * the query key is the key root plus the caller's normalised id lists, so the same
 * ids in another order reuse one cache entry; nothing is requested while every list
 * is empty; resolved rows stay on screen (and `isLoading` stays false) while a grown
 * id set loads; and while that placeholder is up, only ids still requested are shown.
 *
 * What the lists mean (library vs own rows, say) and how they are read is the
 * caller's: `idLists` names them, `fetch` receives them back out of the query key.
 */
export function useRowsByIds<T>(options: {
  keyRoot: readonly string[];
  idLists: () => readonly (readonly string[])[];
  fetch: (idLists: string[][]) => Promise<Map<string, T>>;
  /** Extra switch, e.g. a caller's `enabled: false`; an empty id set always disables. */
  enabled?: () => boolean;
}) {
  const key = computed(() => [...options.keyRoot, ...options.idLists()] as const);
  const hasIds = () => options.idLists().some((list) => list.length > 0);

  const query = useQuery({
    queryKey: key,
    queryFn: ({ queryKey }) => options.fetch(queryKey.filter(isIdList)),
    enabled: () => options.enabled?.() !== false && hasIds(),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  const data = computed(() => {
    const rows = query.data.value;
    if (!rows) return new Map<string, T>();
    // A placeholder is the previous key's rows: show only what is still requested.
    if (!query.isPlaceholderData.value) return rows;
    const wanted = new Set(options.idLists().flat());
    return new Map([...rows].filter(([id]) => wanted.has(id)));
  });
  return { data, isLoading: query.isLoading };
}
