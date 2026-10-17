<template>
  <!-- Ground: the floor, shadows and rock of the Drawing (or the whole picture when it has no standing half). -->
  <svg class="map-svg" :viewBox="`0 0 ${hostW} ${hostH}`" preserveAspectRatio="none">
    <image :href="imageUrl" :x="panX" :y="panY" :width="imageW" :height="imageH" />
  </svg>

  <BattleMapLiveLayer
    v-if="live && cellPx > 0"
    stratum="ground"
    :host-w="hostW"
    :host-h="hostH"
    :cell-px="cellPx"
    :origin-x="originX"
    :origin-y="originY"
    :live="live"
  />

  <svg v-if="showGrid" class="map-svg" :viewBox="`0 0 ${hostW} ${hostH}`" preserveAspectRatio="none">
    <g class="grid">
      <line
        v-for="(x, i) in gridVerticals"
        :key="`v-${i}`"
        :x1="x"
        :y1="0"
        :x2="x"
        :y2="hostH"
        stroke="#000"
        :stroke-opacity="gridStrokeOpacity"
        stroke-width="1"
      />
      <line
        v-for="(y, i) in gridHorizontals"
        :key="`h-${i}`"
        :x1="0"
        :y1="y"
        :x2="hostW"
        :y2="y"
        stroke="#000"
        :stroke-opacity="gridStrokeOpacity"
        stroke-width="1"
      />
    </g>
  </svg>

  <!-- Standing: props, walls, doors and labels draw over the grid. Same box as the ground, so it needs no calibration of its own. -->
  <svg v-if="shownStandUrl" class="map-svg" :viewBox="`0 0 ${hostW} ${hostH}`" preserveAspectRatio="none">
    <image :href="shownStandUrl" :x="panX" :y="panY" :width="imageW" :height="imageH" />
  </svg>

  <BattleMapLiveLayer
    v-if="topAnimates && cellPx > 0"
    stratum="top"
    :host-w="hostW"
    :host-h="hostH"
    :cell-px="cellPx"
    :origin-x="originX"
    :origin-y="originY"
    :live="live"
    @ready="readyLive = live"
  />

  <!-- Last, so room focus, tokens and fog (the views draw them after the stack) stay above the veil. -->
  <BattleMapVeil
    v-if="live && live.darkness !== 'daylight' && cellPx > 0"
    :host-w="hostW"
    :host-h="hostH"
    :pan-x="panX"
    :pan-y="panY"
    :image-w="imageW"
    :image-h="imageH"
    :cell-px="cellPx"
    :origin-x="originX"
    :origin-y="originY"
    :live="live"
    :viewers="viewers"
    :ground-url="imageUrl"
    :stand-url="standUrl"
  />
</template>

<script setup lang="ts">
// The picture of a battle map, bottom to top (epic #1073): the ground image, the ground live layer (water), the grid,
// the standing image, the top live layer, the darkness veil. "Props, trees, walls are ON the grid while the floor is UNDER it", so the
// grid is cut between two images of the same Drawing. Room focus, tokens and fog stay with the view and draw above.
// `standUrl` is null when the shown image is not the Drawing or the drawing predates the split.
//
// What sways is drawn by the top live layer, so while that layer animates the standing image is `standLiveUrl`, the
// same picture without those props. The swap waits for the layer's `ready` (every sprite decoded): until then, and
// for a reduced-motion user, or when a sprite fails to load, every prop stays in the full `standUrl` and nothing
// is ever missing.
import { computed, shallowRef } from "vue";
import BattleMapLiveLayer from "@/components/encounters/BattleMapLiveLayer.vue";
import BattleMapVeil from "@/components/encounters/BattleMapVeil.vue";
import type { Viewer } from "@/lib/battlemap/vision";
import { prefersReducedMotion } from "@/lib/motion";
import type { MapLive } from "@/types/mapLive.types";

const { standUrl, standLiveUrl, live, viewers = null } = defineProps<{
  hostW: number;
  hostH: number;
  imageUrl: string;
  standUrl: string | null;
  /** The standing image without the swaying props, or null when nothing sways. */
  standLiveUrl: string | null;
  panX: number;
  panY: number;
  /** The image's drawn size on screen, in px. */
  imageW: number;
  imageH: number;
  showGrid: boolean;
  gridVerticals: number[];
  gridHorizontals: number[];
  gridStrokeOpacity: number;
  cellPx: number;
  originX: number;
  originY: number;
  live: MapLive | null;
  /** The player's sight: set, the veil shows what these viewers see; null, the DM's translucent veil. */
  viewers?: Viewer[] | null;
}>();

const topAnimates = computed(
  () => live !== null && standLiveUrl !== null && live.sprites.length > 0 && !prefersReducedMotion(),
);
// Ready is remembered per snapshot: a new one has sprites of its own to load before its standing image can drop them.
// A shallow ref, because it is compared by identity: `ref` would wrap the snapshot in a reactive proxy that never
// equals the raw object the prop carries, and the stack would never swap.
const readyLive = shallowRef<MapLive | null>(null);
const shownStandUrl = computed(() => (topAnimates.value && readyLive.value === live ? standLiveUrl : standUrl));
</script>

<style scoped>
.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  user-select: none;
}
</style>
