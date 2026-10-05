import { computed } from "vue";
import type { Ref } from "vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { buildAtlasIndex, descendantsOf } from "@/lib/locations/tree";

/**
 * A place plus everything under it, from the campaign's cached location list.
 * One derivation for every panel that reads "what is homed in this place or
 * below it": they all pass this same set to `useNpcsByLocations` /
 * `useEncountersByLocations`, so they share one request per table rather than
 * one each (#972, story 11). An NPC in a town is in its region.
 */
export function useLocationSubtreeIds(locationId: Ref<string>) {
  const { data: allLocations } = useAllLocations();
  return computed(() => {
    // Empty until the list is in: asking with just [id] first and the full
    // set a moment later would be two requests for one answer.
    if (!locationId.value || !allLocations.value) return [];
    const index = buildAtlasIndex(allLocations.value);
    return [locationId.value, ...descendantsOf(index, locationId.value).map((l) => l.id)];
  });
}
