import { computed, isRef, ref, type Ref } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { fetchBookNook, useBookNook } from "@/composables/bookNook/useBookNooks";
import type { Location } from "@/types/location.types";

/**
 * Makes a place show a nook, or show none (`nookId` null).
 *
 * `locations.book_nook_id` is unique, so a nook already shown at another place is taken off that place first:
 * writing the new place first would trip the unique index for the instant both rows hold the id.
 *
 * A nook with a still also lends it to the place as its picture ("Saving a nook that a place shows writes its first
 * frame to the place's picture"); a nook without one leaves the picture alone rather than blanking it.
 */
export async function showNookAtPlace(locationId: string, nookId: string | null): Promise<void> {
  if (nookId === null) {
    const { error } = await supabase.from("locations").update({ book_nook_id: null }).eq("id", locationId);
    if (error) throw error;
    return;
  }
  const nook = await fetchBookNook(nookId);
  const { error: clearError } = await supabase
    .from("locations")
    .update({ book_nook_id: null })
    .eq("book_nook_id", nookId)
    .neq("id", locationId);
  if (clearError) throw clearError;
  const patch: { book_nook_id: string; image_url?: string } = { book_nook_id: nookId };
  if (nook.still_url) patch.image_url = nook.still_url;
  const { error } = await supabase.from("locations").update(patch).eq("id", locationId);
  if (error) throw error;
}

/**
 * A nook's new still becomes the picture of the place that shows it, if one does, so every card, list and link
 * preview that reads a place's picture shows the room with its cut-outs in place.
 */
export async function giveStillToPlace(nookId: string, stillUrl: string): Promise<void> {
  const { error } = await supabase.from("locations").update({ image_url: stillUrl }).eq("book_nook_id", nookId);
  if (error) throw error;
}

export function useShowNookAtPlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ locationId, nookId }: { locationId: string; nookId: string | null }) =>
      showNookAtPlace(locationId, nookId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["locations"] }),
  });
}

/** The nook a DM's place shows, or undefined data when it shows none. */
export function useNookForPlace(location: Location | null | undefined | Ref<Location | null | undefined>) {
  const loc = isRef(location) ? location : ref(location);
  return useBookNook(computed(() => loc.value?.book_nook_id));
}
