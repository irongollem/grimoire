import { computed } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

const CHUNK = 100;

// Single-column reads of the NPCs a surface names by id, standing in for the prose and
// whole rows the campaign NPC list no longer carries (#999).

/**
 * `appearance` of the given NPCs, by id. The campaign NPC list leaves the prose
 * columns out (#999), so a surface that only quotes the look of the NPCs a text
 * @-mentions asks for exactly those rows rather than widening the list.
 */
export async function fetchNpcAppearances(
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const { data, error } = await supabase
      .from("npcs")
      .select("id, appearance")
      .in("id", ids.slice(start, start + CHUNK));
    if (error) throw error;
    for (const row of data) result.set(row.id, row.appearance);
  }
  return result;
}

/**
 * Reactive form of `fetchNpcAppearances`. Keyed `["npcs", "appearances", ids]`
 * under the `npcs` root so every NPC mutation refreshes it; the live-sync
 * reducer's `include` never admits it (its second segment is not a campaign id
 * and its length is 3 with a non-`by-location` middle).
 */
export function useNpcAppearances(ids: Ref<readonly string[]>) {
  const sortedIds = computed(() => [...new Set(ids.value)].sort());
  return useQuery({
    queryKey: computed(() => ["npcs", "appearances", sortedIds.value] as const),
    queryFn: ({ queryKey: [, , wanted] }) => fetchNpcAppearances(wanted),
    enabled: () => sortedIds.value.length > 0,
  });
}

/**
 * `name` of the given NPCs, by id, for a surface that prints a name next to
 * something else (the dashboard's quest rows show their quest-giver). Reading
 * the few names it needs replaces loading the whole campaign list for them
 * (#999). Keyed `["npcs", "names", ids]`; see `useNpcAppearances` for why that
 * shape never meets the live-sync list reducer.
 */
export async function fetchNpcNames(ids: readonly string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const { data, error } = await supabase
      .from("npcs")
      .select("id, name")
      .in("id", ids.slice(start, start + CHUNK));
    if (error) throw error;
    for (const row of data) result.set(row.id, row.name);
  }
  return result;
}

export function useNpcNames(ids: () => readonly string[]) {
  const sortedIds = computed(() => [...new Set(ids())].sort());
  return useQuery({
    queryKey: computed(() => ["npcs", "names", sortedIds.value] as const),
    queryFn: ({ queryKey: [, , wanted] }) => fetchNpcNames(wanted),
    enabled: () => sortedIds.value.length > 0,
  });
}
