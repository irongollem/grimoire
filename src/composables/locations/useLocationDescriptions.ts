import { computed } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

const CHUNK = 100;

/**
 * `description` of the given places, by id. The campaign-wide place list is
 * slim (#972) and carries no description, so a surface that only needs to know
 * whether a place is written, or to quote it, asks for exactly those rows.
 */
export async function fetchLocationDescriptions(
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const { data, error } = await supabase
      .from("locations")
      .select("id, description")
      .in("id", ids.slice(start, start + CHUNK));
    if (error) throw error;
    for (const row of data) result.set(row.id, row.description);
  }
  return result;
}

/**
 * Reactive form of `fetchLocationDescriptions`. Keyed under the `locations`
 * root so every place mutation refreshes it, and as `["locations",
 * "descriptions", ids]`, which the live-sync reducer's `include` never admits
 * (its third segment is not a parent id and its second is not the campaign).
 */
export function useLocationDescriptions(ids: Ref<readonly string[]>) {
  const sortedIds = computed(() => [...new Set(ids.value)].sort());
  return useQuery({
    queryKey: computed(() => ["locations", "descriptions", sortedIds.value] as const),
    queryFn: ({ queryKey: [, , wanted] }) => fetchLocationDescriptions(wanted),
    enabled: () => sortedIds.value.length > 0,
  });
}
