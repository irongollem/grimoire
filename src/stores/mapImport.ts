import { defineStore } from "pinia";
import { computed, shallowRef } from "vue";

/**
 * The file on its way from "Start a map" (or a place's empty Map tab) to "Bring a map" (#1125, frames 05 and 06).
 * A File cannot ride in a route, so it waits here, in memory only: a reload loses it, and Bring then sends the DM
 * back to choose again. `targetPlaceId` is set when the drop landed on a place's own Map tab, which locks "Where it
 * lives" to that place.
 */
export const useMapImportStore = defineStore("mapImport", () => {
  const file = shallowRef<File | null>(null);
  const targetPlaceId = shallowRef<string | null>(null);

  const hasFile = computed(() => file.value !== null);

  function hold(next: File, target: string | null = null): void {
    file.value = next;
    targetPlaceId.value = target;
  }

  function clear(): void {
    file.value = null;
    targetPlaceId.value = null;
  }

  return { file, targetPlaceId, hasFile, hold, clear };
});
