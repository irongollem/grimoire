<template>
  <!-- Lining the grid up, in the map's own spot (the maintainer's decision of
       14 Nov 2026, replacing a full-screen editor): the picture fitted
       with the amber grid over it, and below it the fields and Done / Cancel. -->
  <div class="flex flex-col gap-3">
    <div class="relative h-[60vh] min-h-64 overflow-hidden rounded-md border border-border bg-muted/30">
      <MapGridLineUp
        v-if="natural && draft"
        v-model="draft"
        :natural="natural"
        :box-mode="boxMode"
        :hint="`${Number(draft.cells_per_image_width.toFixed(1))} squares across. Drag the grid to line it up; arrow keys nudge it a pixel.`"
        @box-done="boxMode = false"
      >
        <img :src="mapUrl" alt="" draggable="false" class="absolute inset-0 size-full object-contain" />
      </MapGridLineUp>
    </div>

    <section
      v-if="natural && draft"
      class="flex flex-col gap-3 rounded-md border border-border bg-card px-3 py-2.5"
      aria-label="Line up the grid"
    >
      <div class="flex items-center gap-2">
        <IconGrid class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h3 class="flex-1 text-label-lg font-semibold text-muted-foreground">LINE UP THE GRID</h3>
      </div>
      <PictureGridFields v-model="draft" v-model:box-mode="boxMode" :natural="natural" />
      <div class="flex items-center gap-1.5">
        <AppButton variant="primary" size="sm" label="Done" :disabled="busy" @click="finish" />
        <AppButton variant="ghost" fill="muted" size="sm" label="Cancel" @click="emit('close')" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * The Atlas map's "Line up the grid" tool. It owns the draft and the picture's
 * natural size (read by loading the url once); the write is the shared picture
 * write, `usePlacePicture().setCalibration`, so it behaves as it does in the
 * site workbench. Done saves and closes, Cancel only closes.
 */
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import MapGridLineUp from "@/components/cartographer/MapGridLineUp.vue";
import PictureGridFields from "@/components/cartographer/PictureGridFields.vue";
import { usePlacePicture } from "@/composables/locations/usePlacePicture";
import { IconGrid } from "@/lib/icons";
import { DEFAULT_SQUARES_ACROSS, calibrationFor, type ImageSize } from "@/lib/mapImport/pictureGrid";
import type { GridCalibration, Location } from "@/types/location.types";

const { location, mapUrl } = defineProps<{
  location: Pick<Location, "id" | "map_url" | "map_motion" | "is_battle_map" | "grid_calibration">;
  /** The picture being lined up: the place's `map_url`, which the caller has already checked is there. */
  mapUrl: string;
}>();

const emit = defineEmits<{ close: [] }>();

const picture = usePlacePicture(() => location);
const busy = picture.busy;

const natural = ref<ImageSize | null>(null);
const draft = ref<GridCalibration | null>(null);
const boxMode = ref(false);

watch(
  () => mapUrl,
  (url) => {
    natural.value = null;
    draft.value = null;
    const img = new Image();
    img.onload = () => {
      if (url !== mapUrl) return;
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      natural.value = size;
      draft.value = location.grid_calibration
        ? { ...location.grid_calibration }
        : calibrationFor(size, DEFAULT_SQUARES_ACROSS);
    };
    img.src = url;
  },
  { immediate: true },
);

async function finish(): Promise<void> {
  if (draft.value) await picture.setCalibration(draft.value);
  emit("close");
}
</script>
