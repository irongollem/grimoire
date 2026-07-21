<template>
  <div class="map-root">
    <!-- Top bar -->
    <div class="map-topbar">
      <RouterLink :to="`/encounters/${encounterId}/run`" class="back-link">
        ← Back to Runner
      </RouterLink>
      <span class="encounter-name">{{ encounter?.name ?? "" }}</span>
      <ManualHelpLink page="encounter-map-battle-map-fog-of-war" />

      <!-- Fog toolbox -->
      <div class="fog-toolbox">
        <span class="fog-label">Fog</span>
        <div class="tool-group" role="radiogroup" aria-label="Tool">
          <button
            v-for="t in TOOLS"
            :key="t.id"
            type="button"
            class="tool-btn"
            :class="{ 'tool-btn-active': tool === t.id }"
            :title="t.label"
            @click="tool = t.id"
          >
            {{ t.icon }}
          </button>
        </div>
        <template v-if="tool !== 'pan'">
          <div class="tool-group" role="radiogroup" aria-label="Brush shape">
            <button
              v-for="s in BRUSH_SHAPES"
              :key="s.id"
              type="button"
              class="tool-btn"
              :class="{ 'tool-btn-active': brushShape === s.id }"
              :title="s.label"
              @click="brushShape = s.id"
            >
              {{ s.icon }}
            </button>
          </div>
          <div class="tool-group" role="radiogroup" aria-label="Brush size">
            <button
              v-for="n in BRUSH_SIZES"
              :key="n"
              type="button"
              class="tool-btn"
              :class="{ 'tool-btn-active': brushSize === n }"
              :title="`${n} cells`"
              @click="brushSize = n"
            >
              {{ n }}
            </button>
          </div>
        </template>
        <button class="zoom-btn" title="Reveal everything (clear fog)" @click="resetFog('reveal')">Reveal all</button>
        <button class="zoom-btn" title="Re-hide everything (reset fog)" @click="resetFog('hide')">Hide all</button>
        <label class="fog-label inline-flex items-center gap-1 cursor-pointer">
          <input v-model="previewAsPlayer" type="checkbox" />
          <span>As player</span>
        </label>
      </div>

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

      <!-- Token layer (DM-side: renders all combatants regardless of reveal_state) -->
      <BattleMapTokenLayer
        v-if="location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="store.combatants"
        :factions="store.factions"
        :monsters="store.availableMonsters"
        :npcs="store.availableNpcs"
        :active-instance-id="store.activeCombatant?.instance_id ?? null"
        :draggable-instance-ids="tool === 'pan' ? null : emptyDragSet"
        :on-position-change="onTokenMoved"
        :class="{ 'pointer-events-none': tool !== 'pan' }"
      />

      <!-- Fog layer (DM: translucent unless previewing as player) -->
      <BattleMapFogLayer
        v-if="location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :mask="fogMask"
        :opaque="previewAsPlayer"
      />

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
import { computed, ref, watch } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { useEncounter } from "@/composables/useEncounters";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import { useLocation } from "@/composables/useLocations";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive, liveState } from "@/composables/useEncounterLive";
import { useMapCanvas } from "@/composables/useMapCanvas";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import {
  gridLinePositions,
  cellSizeInDisplay,
  gridOriginInDisplay,
} from "@/lib/battleMapGeometry";
import {
  applyBrush,
  cellBrushCells,
  decodeFogMask,
  encodeFogMask,
  roundBrushCells,
  type BrushMode,
  type CellKey,
} from "@/lib/fogMask";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";

const route = useRoute();
const encounterId = computed(() => route.params.id as string);
const { data: encounter } = useEncounter(encounterId);
const locationIdRef = computed(() => encounter.value?.location_id ?? "");
const { data: location } = useLocation(locationIdRef);
const store = useEncounterRunStore();
const { schedulePush, isLive } = useEncounterLive(encounterId.value);

function onTokenMoved(instanceId: string, position: { x: number; y: number }) {
  const target = store.combatants.find((c) => c.instance_id === instanceId);
  if (!target) return;
  target.position = position;
  // Only push when live; otherwise the position update lives in the local
  // store and will be persisted on next "Go Live" / schedulePush.
  if (!isLive.value) return;
  schedulePush({
    round: store.round,
    activeIndex: store.activeIndex,
    combatants: store.combatants,
    eventsFired: store.eventsFired,
  });
}

// ── Fog of war ────────────────────────────────────────────────────────────

type Tool = "pan" | "reveal" | "rehide";
type BrushShape = "round" | "cell";

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "pan", label: "Pan map", icon: "✋" },
  { id: "reveal", label: "Reveal brush", icon: "💡" },
  { id: "rehide", label: "Re-hide brush", icon: "🌑" },
];
const BRUSH_SHAPES: { id: BrushShape; label: string; icon: string }[] = [
  { id: "round", label: "Round brush", icon: "●" },
  { id: "cell", label: "Cell brush", icon: "▦" },
];
const BRUSH_SIZES = [1, 3, 5] as const;

const tool = ref<Tool>("pan");
const brushShape = ref<BrushShape>("round");
const brushSize = ref<1 | 3 | 5>(3);
const previewAsPlayer = ref(false);
const emptyDragSet = new Set<string>();

// Local fog mask, seeded from live state and pushed back on every stroke.
// Mirroring locally lets brush strokes feel instant while the 300ms-debounced
// push catches up.
const fogMask = ref<Set<CellKey>>(new Set());

watch(
  () => liveState.value?.fog_mask,
  (encoded) => {
    fogMask.value = decodeFogMask(encoded ?? null);
  },
  { immediate: true },
);

function brushedCells(clientX: number, clientY: number): Set<CellKey> {
  const host = canvasHost.value;
  if (!host) return new Set();
  const rect = host.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const fn = brushShape.value === "round" ? roundBrushCells : cellBrushCells;
  return fn({
    pixelX: px,
    pixelY: py,
    cellPx: cellPx.value,
    originX: gridOrigin.value.x,
    originY: gridOrigin.value.y,
    brushCells: brushSize.value,
  });
}

function applyStrokeAt(clientX: number, clientY: number) {
  if (tool.value === "pan") return;
  const mode: BrushMode = tool.value === "reveal" ? "reveal" : "rehide";
  fogMask.value = applyBrush(fogMask.value, brushedCells(clientX, clientY), mode);
  pushFog();
}

function pushFog() {
  if (!isLive.value) return;
  schedulePush({
    round: store.round,
    activeIndex: store.activeIndex,
    combatants: store.combatants,
    eventsFired: store.eventsFired,
    fogMask: encodeFogMask(fogMask.value),
  });
}

function resetFog(mode: "reveal" | "hide") {
  // "Reveal all" can't enumerate every theoretical cell on an infinite grid,
  // so it just sets a very large pre-populated rect over the visible map
  // bounds. For practical maps this covers everything the player would see.
  if (mode === "reveal") {
    if (!location.value?.grid_calibration) return;
    const cellsAcross = location.value.grid_calibration.cells_per_image_width;
    if (!cellsAcross || imageNaturalH.value <= 0) return;
    const cellsDown = Math.ceil(
      cellsAcross * (imageNaturalH.value / imageNaturalW.value),
    );
    const next = new Set<CellKey>();
    for (let y = 0; y < cellsDown; y++) {
      for (let x = 0; x < cellsAcross; x++) next.add(`${x},${y}`);
    }
    fogMask.value = next;
  } else {
    fogMask.value = new Set();
  }
  pushFog();
}

const {
  canvasHost,
  hostW,
  hostH,
  imageNaturalW,
  imageNaturalH,
  imageReady,
  panX,
  panY,
  scale,
  onImageLoad,
  onWheel,
  startPan,
  continuePan,
  endPan,
  resetView,
} = useMapCanvas();

const loadingState = computed(() => {
  if (!encounter.value) return "Loading encounter…";
  if (!encounter.value.location_id) {
    return "This encounter is not linked to a location. Set a location with a calibrated map to use the battle view.";
  }
  if (!location.value) return "Loading location…";
  if (!location.value.map_url) {
    return "The linked location has no map. Upload or bake a map for this location first.";
  }
  if (!location.value.is_battle_map) {
    return "This location's map isn't marked as a battle map. Open the location and tick \"Battle map\" to use it in the VTT.";
  }
  if (!location.value.grid_calibration) {
    return "This map is not calibrated yet. Open the location and click \"Calibrate grid\" to set the 5-ft scale.";
  }
  return null;
});

// Brush mode hijacks the host's pointer events: tool != "pan" → brush stroke,
// otherwise defer to the shared composable's pan handlers.
const brushing = ref(false);

function onPointerDown(e: PointerEvent) {
  if (!imageReady.value) return;
  if (tool.value !== "pan") {
    brushing.value = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    applyStrokeAt(e.clientX, e.clientY);
    return;
  }
  startPan(e);
}

function onPointerMove(e: PointerEvent) {
  if (brushing.value) {
    applyStrokeAt(e.clientX, e.clientY);
    return;
  }
  continuePan(e);
}

function onPointerUp() {
  brushing.value = false;
  endPan();
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
const gridStrokeOpacity = computed(
  () => location.value?.grid_calibration?.grid_opacity ?? DEFAULT_GRID_OPACITY,
);
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

.fog-toolbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.fog-label {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.55);
}
.tool-group {
  display: inline-flex;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.25rem;
  overflow: hidden;
}
.tool-btn {
  width: 1.75rem;
  height: 1.75rem;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 0.875rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tool-btn:hover {
  color: #fff;
}
.tool-btn-active {
  background: rgba(255, 255, 255, 0.15);
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
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
