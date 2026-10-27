import { computed, toValue } from "vue";
import type { MaybeRefOrGetter } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import { normaliseIds, useRowsByIds } from "@/composables/useRowsByIds";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/library/contentIdentity";
import { normalizeLibraryItem } from "@/composables/items/useItems";
import type { Item } from "@/types/item.types";

const ITEMS_BY_IDS_KEY = ["items", "by-ids"] as const;
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
  const unique = normaliseIds(ids);
  return { libraryIds: unique.filter((id) => !isUuid(id)), customIds: unique.filter(isUuid) };
}

/** The rows for these ids from `library_items` and `items`; the query function of `useItemsByIds`, also callable directly. */
export async function fetchItemsByIds(ids: readonly (string | null)[]): Promise<Item[]> {
  const { libraryIds, customIds } = splitItemIds(ids);
  return fetchSplitRows(libraryIds, customIds);
}

async function fetchSplit(libraryIds: readonly string[], customIds: readonly string[]): Promise<Map<string, Item>> {
  return new Map((await fetchSplitRows(libraryIds, customIds)).map((item) => [item.id, item]));
}

async function fetchSplitRows(libraryIds: readonly string[], customIds: readonly string[]): Promise<Item[]> {
  const [library, custom] = await Promise.all([
    libraryIds.length ? readInChunks<Record<string, unknown>>("library_items", libraryIds) : [],
    customIds.length ? readInChunks<Item>("items", customIds) : [],
  ]);
  return [...library.map(normalizeLibraryItem), ...custom];
}

/**
 * One item, for a click handler that must decide on the item's real flags. The
 * reactive map can lag (a refetch in flight, or the message naming the item only
 * just arrived), and deciding on `undefined` mis-files services, magic items and
 * containers. Reads through the same cache entry `useItemsByIds` would use for
 * `[id]`, so the answer is kept. Resolves `undefined` only for an id with no row;
 * a failed read throws rather than passing for "no such item".
 */
export async function resolveItemById(
  queryClient: QueryClient,
  known: ReadonlyMap<string, Item>,
  id: string,
): Promise<Item | undefined> {
  const hit = known.get(id);
  if (hit) return hit;
  const { libraryIds, customIds } = splitItemIds([id]);
  const rows = await queryClient.fetchQuery({
    queryKey: [...ITEMS_BY_IDS_KEY, libraryIds, customIds] as const,
    queryFn: () => fetchSplit(libraryIds, customIds),
    staleTime: Infinity,
  });
  return rows.get(id);
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
  return useRowsByIds<Item>({
    keyRoot: ITEMS_BY_IDS_KEY,
    idLists: () => [split.value.libraryIds, split.value.customIds],
    fetch: ([libraryIds, customIds]) => fetchSplit(libraryIds, customIds),
    enabled: () => getOptions?.().enabled !== false,
  });
}
