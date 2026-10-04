import { computed, toValue } from "vue";
import type { MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/library/contentIdentity";
import { normalizeLibraryItem } from "@/composables/items/useItems";
import type { Item } from "@/types/item.types";

const CHUNK = 100;

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

async function readInChunks<T>(table: "library_items" | "items", ids: readonly string[]): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await supabase.from(table).select("*").in("id", part);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

/** Splits ids into sorted, deduped library (text) and own (uuid) lists, so the query key ignores order. */
export function splitItemIds(ids: readonly (string | null)[]): { libraryIds: string[]; customIds: string[] } {
  const library = new Set<string>();
  const custom = new Set<string>();
  for (const id of ids) {
    if (id === null || id === "") continue;
    (isUuid(id) ? custom : library).add(id);
  }
  return { libraryIds: [...library].sort(), customIds: [...custom].sort() };
}

/**
 * Read exactly the items a view names, whichever table they live in (#972).
 *
 * Deliberately no source, edition or campaign-scope filter: a stored reference
 * keeps resolving after its book is disabled or the table switches edition (#961).
 * Own rows come from `items` and are scoped by RLS to what the caller may read, so
 * a player gets nothing for a DM-owned uuid; their surfaces resolve through the
 * gated projection instead. Library rows carry their art already
 * (`sync_library_item_art()`), custom rows their own.
 */
export function useItemsByIds(
  ids: MaybeRefOrGetter<readonly (string | null)[]>,
  getOptions?: () => { enabled?: boolean },
) {
  const split = computed(() => splitItemIds(toValue(ids)));

  const query = useQuery({
    queryKey: computed(() => ["items", "by-ids", split.value.libraryIds, split.value.customIds] as const),
    queryFn: async ({ queryKey: [, , libraryIds, customIds] }) => {
      const [library, custom] = await Promise.all([
        libraryIds.length ? readInChunks<Record<string, unknown>>("library_items", libraryIds) : [],
        customIds.length ? readInChunks<Item>("items", customIds) : [],
      ]);
      return [...library.map(normalizeLibraryItem), ...custom];
    },
    enabled: () =>
      getOptions?.().enabled !== false && (split.value.libraryIds.length > 0 || split.value.customIds.length > 0),
    staleTime: Infinity,
  });

  const data = computed(() => new Map((query.data.value ?? []).map((item) => [item.id, item])));
  return { data, isLoading: query.isLoading };
}
