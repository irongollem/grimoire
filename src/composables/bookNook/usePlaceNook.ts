import { computed, type Ref } from "vue";
import { useBookNook } from "@/composables/bookNook/useBookNooks";
import { usePlayerBookNook } from "@/composables/bookNook/usePlayerBookNook";
import { useAppUiStore } from "@/stores/ui/app";
import type { BookNook } from "@/types/bookNook.types";

/** The two fields of a place that decide whether it shows a nook. */
export interface NookPlace {
  id: string;
  book_nook_id?: string | null;
}

/**
 * The nook a place shows to the viewer, or null. A player reads it through `get_player_book_nook`, which answers
 * only for a place the party may see. The DM previewing the player portal is not a campaign member, so that rpc
 * answers nothing for them; they read the nook they own by id (as `usePlayerVisibleLocation` reads the place).
 * A place with no `book_nook_id` asks nothing at all.
 */
export function usePlaceNook(place: Ref<NookPlace | null | undefined>) {
  const appUi = useAppUiStore();
  const hasNook = computed(() => !!place.value?.book_nook_id);
  const playerId = computed(() => (hasNook.value && !appUi.dmPreviewMode ? (place.value?.id ?? null) : null));
  const dmNookId = computed(() => (hasNook.value && appUi.dmPreviewMode ? (place.value?.book_nook_id ?? null) : null));

  const asPlayer = usePlayerBookNook(
    playerId,
    computed(() => place.value?.book_nook_id ?? null),
  );
  const asDm = useBookNook(dmNookId);

  const nook = computed<BookNook | null>(() => {
    if (!hasNook.value) return null;
    return (appUi.dmPreviewMode ? asDm.data.value : asPlayer.data.value) ?? null;
  });
  return { nook };
}
