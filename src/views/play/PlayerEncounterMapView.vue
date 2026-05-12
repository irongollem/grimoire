<template>
  <div class="map-root">
    <!-- Top bar -->
    <div class="map-topbar">
      <RouterLink to="/play/encounter" class="back-link">← Back</RouterLink>
      <span class="encounter-name">{{ encounter?.name ?? "Battle Map" }}</span>
      <div class="topbar-right">
        <span class="hint">{{ Math.round(scale * 100) }}%</span>
        <button class="zoom-btn" title="Reset view" @click="resetView">Reset</button>
      </div>
    </div>

    <div
      ref="canvasHost"
      class="map-canvas-host"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <div v-if="loadingState" class="empty-state">{{ loadingState }}</div>

      <svg
        v-else-if="location && imageReady"
        class="map-svg"
        :viewBox="`0 0 ${hostW} ${hostH}`"
        preserveAspectRatio="none"
      >
        <image
          :href="location.map_url ?? undefined"
          :x="panX"
          :y="panY"
          :width="imageNaturalW * scale"
          :height="imageNaturalH * scale"
        />
        <g class="grid">
          <line
            v-for="(x, i) in gridVerticals"
            :key="`v-${i}`"
            :x1="x"
            :y1="0"
            :x2="x"
            :y2="hostH"
            stroke="rgba(0,0,0,0.35)"
            stroke-width="1"
          />
          <line
            v-for="(y, i) in gridHorizontals"
            :key="`h-${i}`"
            :x1="0"
            :y1="y"
            :x2="hostW"
            :y2="y"
            stroke="rgba(0,0,0,0.35)"
            stroke-width="1"
          />
        </g>
      </svg>

      <BattleMapTokenLayer
        v-if="location && imageReady && cellPx > 0 && liveCombatants"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="liveCombatants"
        :factions="encounter?.factions ?? []"
        :active-instance-id="activeInstanceId"
        :draggable-instance-ids="emptyDragSet"
        :hide-hidden="true"
        :silhouette-unseen="true"
      />

      <img
        v-if="location?.map_url && !imageReady"
        :src="location.map_url"
        class="hidden-loader"
        @load="onImageLoad"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useEncounter } from "@/composables/useEncounters";
import { useLocation } from "@/composables/useLocations";
import { liveState } from "@/composables/useEncounterLive";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import {
  gridLinePositions,
  cellSizeInDisplay,
  gridOriginInDisplay,
} from "@/lib/battleMapGeometry";

const router = useRouter();

const MOBILE_BREAKPOINT_PX = 768;

function isMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX;
}

onMounted(() => {
  // Phones don't see the battle map — bounce back to the stats panel.
  if (isMobile()) {
    router.replace("/play/encounter");
  }
});

const encounterIdRef = computed(() => liveState.value?.encounter_id ?? "");
const { data: encounter } = useEncounter(encounterIdRef);
const locationIdRef = computed(() => encounter.value?.location_id ?? "");
const { data: location } = useLocation(locationIdRef);

const liveCombatants = computed(() => liveState.value?.combatants_live ?? null);
const activeInstanceId = computed(() => {
  if (!liveState.value || !liveCombatants.value) return null;
  return liveCombatants.value[liveState.value.active_combatant_index ?? 0]?.instance_id ?? null;
});

// Empty Set keeps the token layer's drag logic disabled on the player side
// until #394 makes the player's own token draggable.
const emptyDragSet = new Set<string>();

const canvasHost = ref<HTMLElement | null>(null);
const hostW = ref(0);
const hostH = ref(0);
const imageNaturalW = ref(0);
const imageNaturalH = ref(0);
const imageReady = ref(false);

const panX = ref(0);
const panY = ref(0);
const scale = ref(1);

const dragging = ref(false);
const dragLastX = ref(0);
const dragLastY = ref(0);

const loadingState = computed(() => {
  if (!liveState.value) return "No live encounter right now.";
  if (!encounter.value) return "Loading encounter…";
  if (!encounter.value.location_id) return "This encounter has no battle map.";
  if (!location.value) return "Loading location…";
  if (!location.value.map_url) return "The battle map has no image yet.";
  if (!location.value.grid_calibration) return "The DM hasn't calibrated this map yet.";
  return null;
});

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  imageNaturalW.value = img.naturalWidth;
  imageNaturalH.value = img.naturalHeight;
  imageReady.value = true;
  fitImageToHost();
}

function measureHost() {
  if (!canvasHost.value) return;
  const rect = canvasHost.value.getBoundingClientRect();
  hostW.value = rect.width;
  hostH.value = rect.height;
}

function fitImageToHost() {
  if (!imageReady.value || !hostW.value || !hostH.value) return;
  const fitScale = Math.min(hostW.value / imageNaturalW.value, hostH.value / imageNaturalH.value);
  scale.value = fitScale;
  panX.value = (hostW.value - imageNaturalW.value * fitScale) / 2;
  panY.value = (hostH.value - imageNaturalH.value * fitScale) / 2;
}

function resetView() {
  fitImageToHost();
}

function onWheel(e: WheelEvent) {
  if (!imageReady.value) return;
  const factor = Math.exp(-e.deltaY * 0.001);
  const newScale = Math.min(8, Math.max(0.1, scale.value * factor));
  const ratio = newScale / scale.value;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  panX.value = cx - (cx - panX.value) * ratio;
  panY.value = cy - (cy - panY.value) * ratio;
  scale.value = newScale;
}

function onPointerDown(e: PointerEvent) {
  if (!imageReady.value) return;
  dragging.value = true;
  dragLastX.value = e.clientX;
  dragLastY.value = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  panX.value += e.clientX - dragLastX.value;
  panY.value += e.clientY - dragLastY.value;
  dragLastX.value = e.clientX;
  dragLastY.value = e.clientY;
}

function onPointerUp() {
  dragging.value = false;
}

const cellPx = computed(() =>
  location.value?.grid_calibration
    ? cellSizeInDisplay({
        imageNaturalWidth: imageNaturalW.value,
        cellsPerImageWidth: location.value.grid_calibration.cells_per_image_width,
        scale: scale.value,
      })
    : 0,
);

const gridOrigin = computed(() =>
  location.value?.grid_calibration
    ? gridOriginInDisplay({
        panX: panX.value,
        panY: panY.value,
        scale: scale.value,
        imageNaturalWidth: imageNaturalW.value,
        imageNaturalHeight: imageNaturalH.value,
        originXPct: location.value.grid_calibration.origin_x_pct,
        originYPct: location.value.grid_calibration.origin_y_pct,
      })
    : { x: 0, y: 0 },
);

const gridVerticals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.x, hostW.value, cellPx.value) : [],
);
const gridHorizontals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.y, hostH.value, cellPx.value) : [],
);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  measureHost();
  if (canvasHost.value) {
    resizeObserver = new ResizeObserver(() => {
      measureHost();
      if (imageReady.value && panX.value === 0 && panY.value === 0) {
        fitImageToHost();
      }
    });
    resizeObserver.observe(canvasHost.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

watch(imageReady, (ready) => {
  if (ready) fitImageToHost();
});
</script>

<style scoped>
.map-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0b0b10;
  color: #e7e7ea;
}

.map-topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.4);
}

.back-link {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: color 120ms ease;
}
.back-link:hover {
  color: #fff;
}

.encounter-name {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-weight: 700;
  flex: 1;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hint {
  font-family: var(--font-fell, "IM Fell English", serif);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

.zoom-btn {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.25rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
}
.zoom-btn:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}

.map-canvas-host {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.map-canvas-host:active {
  cursor: grabbing;
}

.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  user-select: none;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-family: var(--font-fell, "IM Fell English", serif);
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.55);
  padding: 2rem;
  line-height: 1.6;
}

.hidden-loader {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
