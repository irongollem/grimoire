<template>
  <!-- The Picture layer (canvas frame 07). An uncalibrated picture has no grid to draw it on, so it is shown fitted to
       the canvas; lining the grid up puts the amber grid over it. A calibrated one is drawn on the canvas itself, in
       the grid it was lined up to. -->
  <div class="absolute inset-x-0 top-0 bottom-8 bg-card">
    <MapGridLineUp
      v-if="draft && natural"
      v-model="draft"
      :natural="natural"
      :box-mode="boxMode"
      :hint="hint"
      @box-done="boxMode = false"
    >
      <img :src="url" alt="" draggable="false" class="absolute inset-0 size-full object-contain" />
    </MapGridLineUp>
    <img v-else :src="url" alt="The picture under this map" draggable="false" class="size-full object-contain" />
  </div>
</template>

<script setup lang="ts">
import MapGridLineUp from "@/components/cartographer/MapGridLineUp.vue";
import type { ImageSize } from "@/lib/mapImport/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

defineProps<{
  url: string;
  /** The picture's decoded size; absent until it has loaded. */
  natural: ImageSize | null;
  hint: string;
}>();

/** The grid being lined up; null when the DM is not lining one up, so the picture shows bare. */
const draft = defineModel<GridCalibration | null>("draft", { required: true });
const boxMode = defineModel<boolean>("boxMode", { required: true });
</script>
