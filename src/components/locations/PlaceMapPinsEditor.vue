<template>
  <!--
    The Build map area of a place that is not a site (#958): the map with its
    pins live. No workbench here, since a world or a city has no floor plan;
    placing, moving and hiding pins is the whole job. The unplaced list inside
    `LocationMap` is where a place that is not yet on the map gets dropped on.
  -->
  <LocationMap
    v-model:pins="pins"
    :stack="stack"
    :children="candidates"
    mode="edit"
    show-hidden-pins
    compact
    :location-id="location.id"
    @pin-click="emit('select', $event)"
  />
</template>

<script setup lang="ts">
/**
 * Pin editing, written live (#958). These pins were drafted in the Edit form
 * and saved with it; in Build there is no Save, so every change to the pins is
 * its own write of `map_pins`.
 *
 * `pins` is a local ref synced from the row (the same shape as
 * `LocationRevealControl`): a drag must land where it was dropped before the
 * write comes back, and the refetch that follows then overwrites it with the
 * row. A failed write restores the row's pins and says so.
 *
 * The pin's denormalised name, type and sigil are refreshed from the live
 * place on the way in (so the editor shows the current name) and again on the
 * way out (so the stored copy players read is never staler than the write).
 */
import { computed, ref, watch } from "vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import { getPinnableDescendants, useUpdateLocation } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { refreshPinMetadata } from "@/lib/locations/mapPins";
import { buildMapStack } from "@/lib/locations/mapStack";
import type { Location, MapPin } from "@/types/location.types";

const { location, locations } = defineProps<{
  location: Location;
  /** Every place in the campaign: pin candidates are descendants reached
   *  through vague containers (`getPinnableDescendants`), not only children. */
  locations: Location[];
}>();

const emit = defineEmits<{ select: [id: string] }>();

const toast = useToast();
const { mutateAsync: updateLocation } = useUpdateLocation();

const stack = computed(() => buildMapStack(location));
const candidates = computed(() => getPinnableDescendants(location.id, locations));

/** The row's pins with their denormalised fields current. */
const saved = computed(() => refreshPinMetadata(location.map_pins, candidates.value));

const pins = ref<MapPin[]>(saved.value);
watch(saved, (next) => {
  pins.value = next;
});

// The sync above also assigns `pins`; that lands equal to `saved` and is not
// a write. Only a change the DM made differs.
watch(pins, async (next) => {
  if (JSON.stringify(next) === JSON.stringify(saved.value)) return;
  try {
    await updateLocation({ id: location.id, update: { map_pins: refreshPinMetadata(next, candidates.value) } });
  } catch (e) {
    pins.value = saved.value;
    toast.error(toast.fromError(e));
  }
});
</script>
