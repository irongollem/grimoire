import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useEncounterRoom } from "@/composables/encounters/useEncounterRoom";
import type { FightSite } from "@/lib/locations/explore";
import { isSiteType } from "@/lib/locations/tiers";

/**
 * The site an encounter is fought in (#1125 decision 9): the map its room rides on, or the encounter's own place
 * when that is a site. Null for an encounter anchored in a town, with no place, or before it has loaded.
 */
export function useEncounterSite(encounterId: MaybeRefOrGetter<string>) {
  const { surface } = useEncounterRoom(() => toValue(encounterId));
  return computed<FightSite | null>(() => {
    const place = surface.value?.mapLocation;
    return place && isSiteType(place.location_type) ? { id: place.id, name: place.name } : null;
  });
}
