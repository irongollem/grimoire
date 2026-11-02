<template>
  <BattleMapLiveLayer
    v-if="playing && live"
    stratum="ground"
    :host-w="width"
    :host-h="height"
    :cell-px="cellPx"
    :origin-x="originX"
    :origin-y="originY"
    :live="live"
  />
  <!-- What stands on the ground: the editor's own canvas, so the water lies under the walls as on the table. -->
  <slot />
  <template v-if="playing && live">
    <BattleMapLiveLayer
      stratum="top"
      :host-w="width"
      :host-h="height"
      :cell-px="cellPx"
      :origin-x="originX"
      :origin-y="originY"
      :live="live"
    />
    <!-- The darkness veil, whose lit edge breathes with the lights. While motion plays the standing canvas leaves it out. -->
    <BattleMapVeil
      v-if="live.darkness !== 'daylight' && cellPx > 0"
      :host-w="width"
      :host-h="height"
      :pan-x="0"
      :pan-y="0"
      :image-w="width"
      :image-h="height"
      :cell-px="cellPx"
      :origin-x="originX"
      :origin-y="originY"
      :live="live"
    />
  </template>
</template>

<script setup lang="ts">
// The editor's motion (#1125 frames 16-17): the drawing's water, swaying props and firelight, played by the very
// layer the battle map uses, from a snapshot built in memory by the very builder publish uses.
// The battle map stacks ground, live ground (water), what stands, live top (sway, firelight). The editor matches it:
// this lays the live ground layer, then the default slot, then the live top layer, all in the same box, and the host
// puts the ground canvas before this and its standing canvas in the slot. Both still canvases render with
// `omitLive: true` while this plays, so a swaying prop is never drawn twice. The live layers take no pointer events.
// A finished edit is in the snapshot at once; only a drag in progress is throttled (`createSnapshotScheduler`).
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import { MOTION_REBUILD_INTERVAL_MS } from "@/cartographer/motion";
import { createSnapshotScheduler } from "@/cartographer/motionSnapshot";
import BattleMapLiveLayer from "@/components/encounters/BattleMapLiveLayer.vue";
import BattleMapVeil from "@/components/encounters/BattleMapVeil.vue";
import { buildMapLive } from "@/cartographer/mapLive";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DarknessLevel, DungeonMapLayers } from "@/types/dungeonMap.types";
import type { MapLive } from "@/types/mapLive.types";

const {
  layers,
  revision,
  darkness = "daylight",
  runtimes,
  dressing,
  tilePx,
  viewportOffset,
  dpr = 1,
  width,
  height,
  playing,
  busy = false,
} = defineProps<{
  layers: DungeonMapLayers;
  /** The editor's edit counter: layers are mutated in place, so their identity cannot say they changed. */
  revision: number;
  darkness?: DarknessLevel;
  runtimes: Map<string, TilePackRuntime>;
  dressing: DressingCatalog;
  /** The editor's `tilePx` and `viewportOffset`, in device pixels. */
  tilePx: number;
  viewportOffset: { x: number; y: number };
  /** Device pixels per CSS pixel; the layer draws in CSS pixels. */
  dpr?: number;
  /** The canvas's CSS size. */
  width: number;
  height: number;
  playing: boolean;
  /** A gesture is under way (a drag, a held stroke): edits then rebuild on an interval instead of at once. */
  busy?: boolean;
}>();

// Image cell (0,0) is the editor's cell (0,0): the snapshot is only ever drawn back over the same canvas.
const live = shallowRef<MapLive | null>(null);

const scheduler = createSnapshotScheduler(() => {
  live.value = buildMapLive({ layers, darkness }, runtimes, dressing, 0, 0);
}, MOTION_REBUILD_INTERVAL_MS);

// Playing builds at once (edits made while paused were not tracked). Paused builds nothing.
watch(
  () => playing,
  (on) => {
    if (on) scheduler.flush();
    else scheduler.cancel();
  },
  { immediate: true },
);
watch(
  () => [revision, layers, runtimes, dressing, darkness],
  () => {
    if (playing) scheduler.changed(busy);
  },
);
// The gesture ended: whatever its throttle had not built yet is built now.
watch(
  () => busy,
  (now) => {
    if (!now && playing) scheduler.settled();
  },
);

onBeforeUnmount(() => scheduler.cancel());

const cellPx = computed(() => tilePx / dpr);
const originX = computed(() => -viewportOffset.x / dpr);
const originY = computed(() => -viewportOffset.y / dpr);
</script>
