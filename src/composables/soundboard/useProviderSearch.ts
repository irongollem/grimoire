import { computed, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { getProvider, type SoundProvider, type ProviderFilters } from "@/lib/audio/providers";

/**
 * Search whichever sound provider is currently selected.
 *
 * Provider-agnostic on purpose — the query key includes the provider id, so
 * switching providers refetches rather than showing the previous library's
 * results under a new name. Filters are in the key for the same reason: a
 * narrowed search must not be served the unnarrowed cache entry.
 */
export function useProviderSearch(
  provider: Ref<SoundProvider>,
  query: Ref<string>,
  page: Ref<number>,
  filters: Ref<ProviderFilters>,
) {
  return useQuery({
    queryKey: computed(() => [
      "provider-search",
      provider.value.id,
      query.value.trim().toLowerCase(),
      page.value,
      filters.value.sort,
      filters.value.minDuration,
      filters.value.maxDuration,
    ] as const),
    queryFn: ({ queryKey: [, providerId, q, p, sort, minDuration, maxDuration] }) => {
      const activeProvider = getProvider(providerId);
      if (!activeProvider) throw new Error(`useProviderSearch fetched for unknown provider "${providerId}"`);
      return activeProvider.search({
        query: q,
        page: p,
        filters: { sort, minDuration, maxDuration },
      });
    },
    enabled: computed(() => query.value.trim().length >= provider.value.minQueryLength),
    staleTime: 1000 * 60 * 10,
    placeholderData: (prev) => prev,
  });
}
