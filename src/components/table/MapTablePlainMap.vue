<template>
  <div class="relative flex h-dvh w-screen items-center justify-center overflow-hidden bg-black" data-testid="table-plain-map">
    <div v-if="layer" class="relative" :style="frameStyle" data-testid="plain-map-frame">
      <img :src="layer.url" class="absolute inset-0 h-full w-full" alt="Map" draggable="false" @load="onLoad" />
      <div
        v-for="pin in pins"
        :key="pin.child_location_id"
        class="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
        :style="{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }"
        data-testid="plain-map-pin"
      >
        <span class="h-3 w-3 rounded-full border-2 border-white bg-primary shadow-md" />
        <span class="whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-label-lg font-semibold text-white">{{ pin.child_name }}</span>
      </div>
    </div>
    <PlaceArrivalTitle :place-id="placeId" />
  </div>
</template>

<script setup lang="ts">
/**
 * A map with no grid, on the Table screen: a town or region picture the party reads rather than plays on. A still, no
 * fog and no tokens, plus the pins the DM has shared. The frame is sized to the image's own aspect ratio so a pin's
 * 0..1 position lands on the image and not on the letterbox around it. Before the image reports its size the frame
 * is the whole screen; pins sit on that guess for a moment at most.
 */
import { computed, ref } from "vue";
import PlaceArrivalTitle from "@/components/table/PlaceArrivalTitle.vue";
import { useLocation } from "@/composables/locations/useLocations";
import { buildMapStack } from "@/lib/locations/mapStack";

const props = defineProps<{ placeId: string }>();

const placeId = computed(() => props.placeId);
const { data: place } = useLocation(placeId);
const layer = computed(() => buildMapStack(place.value).primary);
const pins = computed(() => (place.value?.map_pins ?? []).filter((p) => p.visible_to_players));

const ratio = ref<number | null>(null);
function onLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  if (img.naturalWidth > 0 && img.naturalHeight > 0) ratio.value = img.naturalWidth / img.naturalHeight;
}

// The largest box of the image's ratio that fits the viewport (object-contain, but as a box the pins can sit in).
const frameStyle = computed(() =>
  ratio.value
    ? { aspectRatio: String(ratio.value), width: `min(100vw, 100dvh * ${ratio.value})` }
    : { width: "100vw", height: "100dvh" },
);
</script>
