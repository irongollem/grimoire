import { computed, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import type { SoundProvider, ProviderSearchResult } from "@/lib/soundProviders";

/**
 * Search whichever sound provider is currently selected.
 *
 * Provider-agnostic on purpose — the query key includes the provider id, so
 * switching providers refetches rather than showing the previous library's
 * results under a new name.
 */
export function useProviderSearch(
  provider: Ref<SoundProvider>,
  query: Ref<string>,
  page: Ref<number>,
) {
  return useQuery<ProviderSearchResult>({
    queryKey: computed(() => [
      "provider-search",
      provider.value.id,
      query.value.trim().toLowerCase(),
      page.value,
    ]),
    queryFn: () => provider.value.search({ query: query.value.trim(), page: page.value }),
    enabled: computed(() => query.value.trim().length >= provider.value.minQueryLength),
    staleTime: 1000 * 60 * 10,
    placeholderData: (prev) => prev,
  });
}
