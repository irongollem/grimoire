import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import {
  getPinnableDescendants,
  useUpdateLocation,
  type PinnableFields,
} from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { refreshPinMetadata } from "@/lib/locations/mapPins";
import type { Location, MapPin } from "@/types/location.types";

/**
 * A place's pins, written live (#958): there is no Save, so every change the DM
 * makes to the pins on the map is its own write of `map_pins`.
 *
 * `pins` is a local ref synced from the row (the same shape as
 * `LocationRevealControl`): a drag must land where it was dropped before the
 * write comes back, and the refetch that follows then overwrites it with the
 * row. A failed write restores the row's pins and says so.
 *
 * The pin's denormalised name, type and sigil are refreshed from the live place
 * on the way in (so the map shows the current name) and again on the way out
 * (so the stored copy players read is never staler than the write).
 *
 * `places` is every place in the campaign: the candidates are descendants
 * reached through vague containers (`getPinnableDescendants`), not only children.
 */
export function usePlaceMapPins(
  location: MaybeRefOrGetter<Pick<Location, "id" | "map_pins">>,
  places: MaybeRefOrGetter<readonly PinnableFields[]>,
) {
  const toast = useToast();
  const { mutateAsync: updateLocation } = useUpdateLocation();

  const candidates = computed(() => getPinnableDescendants(toValue(location).id, toValue(places)));

  /** The row's pins with their denormalised fields current. */
  const saved = computed(() => refreshPinMetadata(toValue(location).map_pins, candidates.value));

  const pins = ref<MapPin[]>(saved.value);
  watch(saved, (next) => {
    pins.value = next;
  });

  // The sync above also assigns `pins`; that lands equal to `saved` and is not
  // a write. Only a change the DM made differs.
  watch(pins, async (next) => {
    if (JSON.stringify(next) === JSON.stringify(saved.value)) return;
    try {
      await updateLocation({
        id: toValue(location).id,
        update: { map_pins: refreshPinMetadata(next, candidates.value) },
      });
    } catch (e) {
      pins.value = saved.value;
      toast.error(toast.fromError(e));
    }
  });

  return { pins, candidates };
}
