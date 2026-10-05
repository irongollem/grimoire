import { computed, onScopeDispose, ref, watch } from "vue";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/vue-query";

/**
 * The shared core of the server-paged catalogue lists (#972): Bestiary, Vault
 * and Spellbook each ask a `browse_*` RPC for one page at a time. The server
 * sends the summary (`total`, selectable ids, ...) on the first page only, so
 * "how many are there" is always read from `pages[0]`.
 */

/** The offset of the next page, or `undefined` when the catalogue is exhausted.
 *  An empty page stops it too, so a short answer cannot loop on one offset. */
export function nextBrowseOffset(
  last: { rows: readonly unknown[] },
  pages: ReadonlyArray<{ rows: readonly unknown[]; total?: number }>,
): number | undefined {
  const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
  return last.rows.length > 0 && loaded < (pages[0]?.total ?? 0) ? loaded : undefined;
}

/** The search text, settled: follows the getter after a pause so a keystroke is
 *  not a request. Trimmed; clearing it is immediate. */
export function useSettledSearch(getter: () => string, ms = 250) {
  const settled = ref(getter().trim());
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(getter, (raw) => {
    clearTimeout(timer);
    const next = raw.trim();
    if (next === "") { settled.value = next; return; }
    timer = setTimeout(() => { settled.value = next; }, ms);
  });
  onScopeDispose(() => clearTimeout(timer));
  return settled;
}

interface CatalogueBrowseOptions<Page> {
  queryKey: () => readonly unknown[];
  fetchPage: (offset: number) => Promise<Page>;
  enabled: () => boolean;
}

export function useCatalogueBrowse<Row, Page extends { rows: Row[]; total?: number }>(
  options: CatalogueBrowseOptions<Page>,
) {
  const query = useInfiniteQuery({
    queryKey: computed(() => options.queryKey()),
    queryFn: ({ pageParam }) => options.fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: nextBrowseOffset,
    enabled: options.enabled,
    // A filter edit keeps the grid on screen until the new first page lands.
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });

  const first = computed(() => query.data.value?.pages[0]);

  return {
    rows: computed<Row[]>(() => query.data.value?.pages.flatMap((p) => p.rows) ?? []),
    /** Page 1 of the current query: the only page that carries the summary. */
    first,
    /** True once page 1 of the current filters is in, not a stand-in for the previous ones. */
    ready: computed(() => first.value !== undefined && !query.isPlaceholderData.value),
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => query.fetchNextPage(),
    isLoading: query.isLoading,
    error: query.error,
  };
}
