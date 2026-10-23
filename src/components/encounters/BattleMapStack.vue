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
    :door-states="doorStates"
    :ground="groundBox"
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
    v-if="topDraws && cellPx > 0"
    stratum="top"
    :host-w="hostW"
    :host-h="hostH"
    :cell-px="cellPx"
    :origin-x="originX"
    :origin-y="originY"
    :live="live"
    :door-states="doorStates"
    :stand-url="standLiveUrl"
    @ready="readyLive = live"
  />

  <!-- Last, so room focus, tokens and fog (the views draw them after the stack) stay above the veil. -->
  <BattleMapVeil
    v-if="live && (live.darkness !== 'daylight' || zones.length > 0) && cellPx > 0"
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
    :door-states="doorStates"
    :viewers="viewers"
    :zones="zones"
    :ground-url="imageUrl"
    :stand-url="standUrl"
  />
</template>

<script setup lang="ts">
// The picture of a battle map, bottom to top (epic #1073): the ground image, the ground live layer (water), the grid,
// the standing image, the top live layer, the darkness veil (mounted for a dark or dim map, or a daylight one with a sphere of magical darkness). "Props, trees, walls are ON the grid while the floor is UNDER it", so the
// grid is cut between two images of the same Drawing. Room focus, tokens and fog stay with the view and draw above.
// `standUrl` is null when the shown image is not the Drawing or the drawing predates the split.
//
// What sways, and every door leaf that has art of its own, is drawn by the top live layer, so while that layer draws
// the standing image is `standLiveUrl`, the same picture without those props and leaves. The swap waits for the
// layer's `ready` (every sprite, leaf and `standLiveUrl` itself decoded, so the walls never blink out while the new
// picture loads), and the layer draws them from then on only, so they never show twice. Until then, or when an image
// fails to load, everything stays in the full `standUrl` and nothing is ever missing. A reduced-motion user gets the
// same swap: the layer draws one still frame instead of a loop, which a door the DM opens still needs (#1073).
import { computed, shallowRef } from "vue";
import BattleMapLiveLayer from "@/components/encounters/BattleMapLiveLayer.vue";
import BattleMapVeil from "@/components/encounters/BattleMapVeil.vue";
import { NO_ZONES, type DarknessZone } from "@/lib/battlemap/illumination";
import { NO_DOOR_STATES } from "@/lib/battlemap/occlusion";
import type { Viewer } from "@/lib/battlemap/vision";
import type { MapLive, MapLiveDoorState } from "@/types/mapLive.types";

const { imageUrl, panX, panY, imageW, imageH, standUrl, standLiveUrl, live, viewers = null, zones = NO_ZONES, doorStates = NO_DOOR_STATES } = defineProps<{
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
  /** Magical darkness: counts as a dark map for mounting the veil, even on a daylight one. */
  zones?: readonly DarknessZone[];
  /** Doors the DM has opened or shut over their drawn state: light, sight and the drawn leaf follow (#1073). */
  doorStates?: readonly MapLiveDoorState[];
}>();

const topDraws = computed(
  () => live !== null && standLiveUrl !== null && (live.sprites.length > 0 || live.doors.some((d) => d.leaf !== null)),
);
// Ready is remembered per snapshot: a new one has sprites of its own to load before its standing image can drop them.
// A shallow ref, because it is compared by identity: `ref` would wrap the snapshot in a reactive proxy that never
// equals the raw object the prop carries, and the stack would never swap.
const readyLive = shallowRef<MapLive | null>(null);
// The ground picture's box, so the ground layer keeps a light's flicker to its painted part.
const groundBox = computed(() => ({ url: imageUrl, x: panX, y: panY, w: imageW, h: imageH }));
const shownStandUrl = computed(() => (topDraws.value && readyLive.value === live ? standLiveUrl : standUrl));
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
