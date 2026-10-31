<template>
  <template v-if="playing && live">
    <BattleMapLiveLayer
      stratum="ground"
      :host-w="width"
      :host-h="height"
      :cell-px="cellPx"
      :origin-x="originX"
      :origin-y="originY"
      :live="live"
    />
    <BattleMapLiveLayer
      stratum="top"
      :host-w="width"
      :host-h="height"
      :cell-px="cellPx"
      :origin-x="originX"
      :origin-y="originY"
      :live="live"
    />
  </template>
</template>

<script setup lang="ts">
// The editor's motion (#1125 frames 16-17): the drawing's water, swaying props and firelight, played by the very
// layer the battle map uses, from a snapshot built in memory by the very builder publish uses. The editor's still
// canvas must be rendered with `omitLive: true` while this plays, so a swaying prop is never drawn twice (a still
// copy under a moving one). Mount it over the canvas, same box; it takes no pointer events.
// The snapshot is rebuilt on a short idle after an edit, never per pointer move.
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import { MOTION_REBUILD_IDLE_MS } from "@/cartographer/motion";
import BattleMapLiveLayer from "@/components/encounters/BattleMapLiveLayer.vue";
import { buildMapLive } from "@/cartographer/mapLive";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DarknessLevel, DungeonMap, DungeonMapLayers } from "@/types/dungeonMap.types";
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
}>();

// buildMapLive reads only the layers and the darkness of a map.
function mapOf(): DungeonMap {
  return {
    id: "", user_id: "", campaign_id: null, name: "", description: null, layers, metadata: {}, default_pack_id: null,
    darkness, tags: [], notes: null, rev: 0, created_at: "", updated_at: "",
  };
}

// Image cell (0,0) is the editor's cell (0,0): the snapshot is only ever drawn back over the same canvas.
const live = shallowRef<MapLive | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

function rebuild() {
  timer = null;
  live.value = buildMapLive(mapOf(), runtimes, dressing, 0, 0);
}

function schedule() {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(rebuild, MOTION_REBUILD_IDLE_MS);
}

function cancel() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

// Playing builds at once (edits made while paused were not tracked); later edits wait for the idle. Paused builds nothing.
watch(
  () => playing,
  (on) => {
    if (!on) return cancel();
    rebuild();
  },
  { immediate: true },
);
watch(
  () => [revision, layers, runtimes, dressing, darkness],
  () => {
    if (playing) schedule();
  },
);

onBeforeUnmount(cancel);

const cellPx = computed(() => tilePx / dpr);
const originX = computed(() => -viewportOffset.x / dpr);
const originY = computed(() => -viewportOffset.y / dpr);
</script>
