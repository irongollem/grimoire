<template>
  <!--
    A moving Picture plays UNDER everything, as an HTML element in the moving layer's box. An HTML sibling rather than
    a foreignObject: pan and zoom are already px numbers (panX/imageW), so a box in those px stays exact, and Safari
    mishandles a <video> inside an SVG foreignObject. It sits before the ground svg, so the Drawing's transparent bake
    draws over it; the still is left out of the svg while it plays.
  -->
  <video
    v-if="playsVideo && motionBox"
    class="motion-layer"
    :src="media.url.value ?? undefined"
    :style="motionStyle"
    autoplay
    loop
    muted
    playsinline
    aria-hidden="true"
    data-testid="map-motion"
  />
  <img
    v-else-if="playsAnimated && motionBox"
    class="motion-layer"
    :src="media.url.value ?? undefined"
    :style="motionStyle"
    alt=""
    draggable="false"
    data-testid="map-motion"
  />

  <!-- Ground: the Picture (under a Drawing), then the floor, shadows and rock of the Drawing (or the whole picture when it has no standing half). -->
  <svg class="map-svg" :viewBox="`0 0 ${hostW} ${hostH}`" preserveAspectRatio="none">
    <image v-if="pictureBox && !playing" :href="pictureBox.url" :x="pictureBox.x" :y="pictureBox.y" :width="pictureBox.w" :height="pictureBox.h" />
    <image v-if="!groundIsMoving" :href="imageUrl" :x="panX" :y="panY" :width="imageW" :height="imageH" />
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

  <!-- Only a DM's surface has a moving map (a player's projection never carries one), so this is a DM-only chip. -->
  <div
    v-if="motion && media.missing.value"
    data-slip
    class="absolute right-2 top-2 z-20 flex max-w-xs flex-col gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-label text-foreground"
    data-testid="map-motion-missing"
    @pointerdown.stop
    @wheel.stop
  >
    <span>Moving map: this device doesn't have the file</span>
    <AppButton variant="outline" size="xs" @click="fileInput?.click()">Pick the file</AppButton>
    <input ref="fileInput" type="file" class="hidden" accept="video/*,image/gif,image/webp,image/png" @change="onPicked" />
  </div>
  <div
    v-else-if="motion && media.mismatch.value"
    data-slip
    class="absolute right-2 top-2 z-20 max-w-xs rounded-md border border-border bg-card px-2 py-1.5 text-label text-foreground"
    data-testid="map-motion-mismatch"
    @pointerdown.stop
  >
    This is not the file the map was imported with ({{ motion.fileName }}). It plays anyway.
  </div>
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
import { computed, ref, shallowRef, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useLocalMapMedia } from "@/composables/locations/useLocalMapMedia";
import { prefersReducedMotion } from "@/lib/motion";
import { placeCalibrated, type PlacedRect } from "@/lib/locations/mapStack";
import BattleMapLiveLayer from "@/components/encounters/BattleMapLiveLayer.vue";
import BattleMapVeil from "@/components/encounters/BattleMapVeil.vue";
import { NO_ZONES, type DarknessZone } from "@/lib/battlemap/illumination";
import { NO_DOOR_STATES } from "@/lib/battlemap/occlusion";
import type { BattleMapLayers } from "@/lib/battlemap/roomBridge";
import type { Viewer } from "@/lib/battlemap/vision";
import type { MapLive, MapLiveDoorState } from "@/types/mapLive.types";

const { layers, panX, panY, imageW, imageH, viewers = null, zones = NO_ZONES, doorStates = NO_DOOR_STATES } = defineProps<{
  hostW: number;
  hostH: number;
  /** What the map is made of: the ground image, the standing half, the live snapshot (#1125: one object, so a new
   *  layer reaches every battle map without each mount learning a prop). The DM's `BattleSurface` is one. */
  layers: BattleMapLayers;
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
  /** The player's sight: set, the veil shows what these viewers see; null, the DM's translucent veil. */
  viewers?: Viewer[] | null;
  /** Magical darkness: counts as a dark map for mounting the veil, even on a daylight one. */
  zones?: readonly DarknessZone[];
  /** Doors the DM has opened or shut over their drawn state: light, sight and the drawn leaf follow (#1073). */
  doorStates?: readonly MapLiveDoorState[];
}>();

const imageUrl = computed(() => layers.imageUrl);
const standUrl = computed(() => layers.standUrl);
const standLiveUrl = computed(() => layers.standLiveUrl);
const live = computed(() => layers.live);

// ── The Picture under the Drawing, and a moving Picture (#1125 decisions 6 and 8) ──
const picture = computed(() => layers.picture);
const pictureUrl = computed(() => picture.value?.url ?? null);
// The Picture's natural size is not known to the surface; only its aspect matters to `placeCalibrated`.
const pictureNatural = ref<{ w: number; h: number } | null>(null);
watch(
  pictureUrl,
  (url) => {
    pictureNatural.value = null;
    if (url === null) return;
    const probe = new Image();
    probe.onload = () => {
      // A newer Picture may have replaced this one while it loaded.
      if (pictureUrl.value === url) pictureNatural.value = { w: probe.naturalWidth, h: probe.naturalHeight };
    };
    probe.src = url;
  },
  { immediate: true },
);
const pictureRect = computed<PlacedRect | null>(() => {
  const p = picture.value;
  const natural = pictureNatural.value;
  if (!p || !natural || imageW <= 0 || imageH <= 0) return null;
  return placeCalibrated(p.drawingCalibration, p.calibration, { w: imageW, h: imageH }, natural);
});
const pictureBox = computed(() => {
  const r = pictureRect.value;
  const p = picture.value;
  return r && p ? { url: p.url, x: panX + r.left * imageW, y: panY + r.top * imageH, w: r.width * imageW, h: r.height * imageH } : null;
});

const motion = computed(() => layers.motion);
const media = useLocalMapMedia(
  () => motion.value?.key ?? null,
  () => (motion.value ? { fileName: motion.value.fileName, bytes: motion.value.bytes } : null),
);
// Reduced motion shows the still, which is `map_url` and already drawn as the ground or the Picture.
const playing = computed(() => !!motion.value && media.url.value !== null && !prefersReducedMotion());
// The moving layer is the Picture: under the Drawing in its placed rect, or the ground itself when it is all there is.
const motionBox = computed(() => {
  const m = motion.value;
  if (!m || !playing.value) return null;
  if (picture.value) return pictureBox.value;
  return imageUrl.value === m.still ? { x: panX, y: panY, w: imageW, h: imageH } : null;
});
// The ground IS the Picture and it is playing: the video draws it, so the still must not cover it.
const groundIsMoving = computed(() => playing.value && !picture.value && motion.value?.still === imageUrl.value);
const playsVideo = computed(() => playing.value && motion.value?.kind === "video");
const playsAnimated = computed(() => playing.value && motion.value?.kind === "animated");
const motionStyle = computed(() => {
  const b = motionBox.value;
  return b ? { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` } : {};
});

const fileInput = ref<HTMLInputElement | null>(null);
async function onPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) await media.pick(file);
}

const topDraws = computed(
  () => {
    const snapshot = live.value;
    return snapshot !== null && standLiveUrl.value !== null && (snapshot.sprites.length > 0 || snapshot.doors.some((d) => d.leaf !== null));
  },
);
// Ready is remembered per snapshot: a new one has sprites of its own to load before its standing image can drop them.
// A shallow ref, because it is compared by identity: `ref` would wrap the snapshot in a reactive proxy that never
// equals the raw object the prop carries, and the stack would never swap.
const readyLive = shallowRef<MapLive | null>(null);
// The ground picture's box, so the ground layer keeps a light's flicker to its painted part.
const groundBox = computed(() => ({ url: imageUrl.value, x: panX, y: panY, w: imageW, h: imageH }));
const shownStandUrl = computed(() => (topDraws.value && readyLive.value === live.value ? standLiveUrl.value : standUrl.value));
</script>

<style scoped>
.motion-layer {
  position: absolute;
  max-width: none;
  pointer-events: none;
  user-select: none;
}
.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  user-select: none;
}
</style>
