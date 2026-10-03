import { computed, toValue } from "vue";
import type { MaybeRefOrGetter, Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/library/contentIdentity";
import { useItems, normalizeLibraryItem } from "@/composables/items/useItems";
import type { Item } from "@/types/item.types";

/** Library ids in `ids` that `known` cannot resolve, sorted so the query key is stable. */
export function missingLibraryIds(ids: readonly (string | null)[], known: ReadonlySet<string>): string[] {
  const missing = new Set<string>();
  for (const id of ids) {
    if (id !== null && !isUuid(id) && !known.has(id)) missing.add(id);
  }
  return [...missing].sort();
}

/**
 * Resolve item ids a record *stored* (encounter loot, a downtime reward, an item
 * someone carries) to rows.
 *
 * A stored reference is either an own-item uuid or a text `library_items` id, and
 * it must keep resolving after the campaign disables the book it came from or
 * switches edition: only pickers respect enabled sources and the table's edition
 * (#961). The item hooks' `resolvable` list already keeps own rows of any edition;
 * library ids it cannot resolve are fetched straight from `library_items` here
 * instead of being silently dropped from the screen.
 */
export function useStoredItemRefs(
  ids: MaybeRefOrGetter<readonly (string | null)[]>,
  /** The list the caller already holds: an item hook's `resolvable`, never its
   *  browse `data`. Defaults to the DM's {@link useItems}; player surfaces pass
   *  their own gated projection. Either way, library ids the list lacks are still
   *  fetched: shared content is public, so naming it hides nothing, and a
   *  player's vault-item gate is unaffected (uuids are never fetched). */
  source?: Ref<Item[] | undefined>,
) {
  const items = source ?? useItems().resolvable;

  const known = computed(() => new Set((items.value ?? []).map((i) => i.id)));
  const missing = computed(() => missingLibraryIds(toValue(ids), known.value));

  const fetched = useQuery({
    queryKey: computed(() => ["resolved-library-items", missing.value] as const),
    queryFn: async ({ queryKey: [, wanted] }) => {
      const { data, error } = await supabase.from("library_items").select("*").in("id", wanted);
      if (error) throw error;
      return (data ?? []).map(normalizeLibraryItem);
    },
    enabled: () => items.value !== undefined && missing.value.length > 0,
    staleTime: Infinity,
  });

  /** Every item the ids can currently be resolved to, own and library alike. */
  const resolved = computed<Item[]>(() => [...(items.value ?? []), ...(fetched.data.value ?? [])]);

  function find(id: string): Item | undefined {
    return resolved.value.find((i) => i.id === id);
  }

  return { items: resolved, find };
}
