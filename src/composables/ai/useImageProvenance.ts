import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { imageProvenanceKey, loadImageProvenance } from "@/lib/storage";
import type { AiProvenance } from "@edge-shared/provenance/types.ts";

/**
 * The AI provenance of a stored image, found by its URL (#935). The registry
 * is keyed by storage object, so any URL shape of one image (the original or a
 * `_w400` variant) resolves to the same record, and the answer never depends
 * on which entity row happens to show the picture.
 *
 * Null while loading, for a URL outside the registered buckets (a `blob:`
 * preview, a bundled asset), and for an image the registry has no record of.
 * A failed lookup is an error on the query, never a quiet null, so it reaches
 * the query client's error handling rather than hiding an AI image's badge.
 *
 * A record is immutable for its key (storage paths are uuids), so hits and
 * misses are both kept for the session: no stale time, no refetch, no poll.
 */
export function useImageProvenance(url: MaybeRefOrGetter<string | null | undefined>): ComputedRef<AiProvenance | null> {
  const key = computed(() => {
    const value = toValue(url);
    return value ? imageProvenanceKey(value) : null;
  });

  const query = useQuery({
    queryKey: computed(() => ["image-provenance", key.value?.bucket ?? null, key.value?.stem ?? null] as const),
    queryFn: () => {
      const k = key.value;
      if (!k) throw new Error("image provenance requested without a registry key");
      return loadImageProvenance(k);
    },
    enabled: computed(() => key.value !== null),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  return computed(() => query.data.value ?? null);
}
