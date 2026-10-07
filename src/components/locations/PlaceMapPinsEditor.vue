<template>
  <!--
    The Build map area of a place that is not a site (#958): the map with its
    pins live. No workbench here, since a world or a city has no floor plan;
    placing, moving and hiding pins is the whole job. The unplaced list inside
    `LocationMap` is where a place that is not yet on the map gets dropped on.
  -->
  <div class="flex flex-col gap-2">
    <!-- The map's scale (#932): what Browse's Measure tool reads. Beside the
         map because it is a fact about this picture, set by marking two points
         on it; it has no other home on a place with no workbench. -->
    <div v-if="stack.primary" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
      <IconRuler class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span v-if="scale">
        Scale: <span class="font-semibold text-foreground">{{ formatDistance(scale.distance, scale.unit) }}</span>
        between the two marked points
      </span>
      <span v-else>No scale yet, so routes cannot be measured</span>
      <AppButton
        variant="ghost"
        size="inline-xs"
        :label="scale ? 'Edit scale' : 'Set scale'"
        @click="scaleOpen = true"
      />
    </div>

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

    <MapScaleDialog
      :open="scaleOpen"
      :map-url="stack.primary?.url ?? null"
      :existing="scale"
      :saving="isSavingScale"
      @cancel="scaleOpen = false"
      @save="saveScale"
      @clear="saveScale(null)"
    />
  </div>
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
import AppButton from "@/components/common/AppButton.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import MapScaleDialog from "@/components/locations/MapScaleDialog.vue";
import {
  getPinnableDescendants,
  useUpdateLocation,
  useUpdateLocationMapScale,
  type PinnableFields,
} from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { IconRuler } from "@/lib/icons";
import { formatDistance, parseMapScale } from "@/lib/locations/mapScale";
import { refreshPinMetadata } from "@/lib/locations/mapPins";
import { buildMapStack } from "@/lib/locations/mapStack";
import type { Location, MapPin, MapScale } from "@/types/location.types";

const { location, locations } = defineProps<{
  location: Location;
  /** Every place in the campaign: pin candidates are descendants reached
   *  through vague containers (`getPinnableDescendants`), not only children. */
  locations: readonly PinnableFields[];
}>();

const emit = defineEmits<{ select: [id: string] }>();

const toast = useToast();
const { mutateAsync: updateLocation } = useUpdateLocation();

const stack = computed(() => buildMapStack(location));

// ── Map scale (#932) — written live like the pins: there is no Save in Build. ─
const scale = computed(() => parseMapScale(location.map_scale));
const scaleOpen = ref(false);
const { mutateAsync: updateScale, isPending: isSavingScale } = useUpdateLocationMapScale();

async function saveScale(next: MapScale | null) {
  try {
    await updateScale({ id: location.id, scale: next });
    scaleOpen.value = false;
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}
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
