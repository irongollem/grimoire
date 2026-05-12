<template>
  <div class="map-root">
    <!-- Top bar -->
    <div class="map-topbar">
      <RouterLink :to="`/encounters/${encounterId}/run`" class="back-link">
        ← Back to Runner
      </RouterLink>
      <span class="encounter-name">{{ encounter?.name ?? "" }}</span>
      <div class="topbar-right">
        <span class="hint">{{ Math.round(scale * 100) }}%</span>
        <button class="zoom-btn" title="Reset view" @click="resetView">Reset</button>
      </div>
    </div>

    <!-- Body -->
    <div
      ref="canvasHost"
      class="map-canvas-host"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <!-- Empty / error states -->
      <div v-if="loadingState" class="empty-state">{{ loadingState }}</div>

      <!-- Map + grid via SVG (single layer, simple, accessible) -->
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

      <!-- Off-screen loader to read naturalWidth/Height -->
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
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { useEncounter } from "@/composables/useEncounters";
import { useLocation } from "@/composables/useLocations";
import {
  gridLinePositions,
  cellSizeInDisplay,
  gridOriginInDisplay,
} from "@/lib/battleMapGeometry";

const route = useRoute();
const encounterId = computed(() => route.params.id as string);
const { data: encounter } = useEncounter(encounterId);
const locationIdRef = computed(() => encounter.value?.location_id ?? "");
const { data: location } = useLocation(locationIdRef);

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
  if (!encounter.value) return "Loading encounter…";
  if (!encounter.value.location_id) {
    return "This encounter is not linked to a location. Set a location with a calibrated map to use the battle view.";
  }
  if (!location.value) return "Loading location…";
  if (!location.value.map_url) {
    return "The linked location has no map. Upload or bake a map for this location first.";
  }
  if (!location.value.grid_calibration) {
    return "This map is not calibrated yet. Open the location and click \"Calibrate grid\" to set the 5-ft scale.";
  }
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
  // Zoom relative to cursor position so the cursor cell stays under the cursor.
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
      if (imageReady.value && (panX.value === 0 && panY.value === 0)) {
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
  max-width: 32rem;
  margin: 0 auto;
}

.hidden-loader {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
