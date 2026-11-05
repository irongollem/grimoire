import { computed, isRef, ref, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { BookNook } from "@/types/bookNook.types";

/** Query-key root the campaign channel refreshes on a `book_nooks` ring. */
export const PLAYER_BOOK_NOOK_KEY = "player-book-nook";

/** The nook a place shows, as a player who may see that place reads it; null when the place shows none. */
export async function fetchPlayerBookNook(locationId: string): Promise<BookNook | null> {
  const { data, error } = await supabase.rpc("get_player_book_nook", { p_location_id: locationId });
  if (error) throw error;
  return ((data ?? []) as BookNook[])[0] ?? null;
}

/**
 * The key carries the nook the place shows as well as the place: the `locations` ring refreshes the place (and so
 * its `book_nook_id`) but not this key root, so a place switching to another nook must become a new query.
 */
export function usePlayerBookNook(
  locationId: string | null | Ref<string | null | undefined>,
  bookNookId: string | null | Ref<string | null | undefined> = null,
) {
  const idRef = isRef(locationId) ? locationId : ref(locationId);
  const nookRef = isRef(bookNookId) ? bookNookId : ref(bookNookId);
  return useQuery({
    queryKey: computed(() => [PLAYER_BOOK_NOOK_KEY, idRef.value, nookRef.value] as const),
    queryFn: ({ queryKey: [, id] }) => {
      if (!id) throw new Error("usePlayerBookNook fetched without a place; enabled guarantees one");
      return fetchPlayerBookNook(id);
    },
    enabled: () => !!idRef.value,
  });
}
