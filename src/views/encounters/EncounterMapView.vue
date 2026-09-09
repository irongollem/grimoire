<template>
  <div class="map-root">
    <BattleMapToolbar
      v-model:tool="tool"
      v-model:brush-shape="brushShape"
      v-model:brush-size="brushSize"
      v-model:show-zones="showZones"
      v-model:preview-as-player="previewAsPlayer"
      :title="title"
      :caption="caption"
      :site-target="siteTarget"
      :site-tooltip="siteTooltip"
      :token-count="store.combatants.length"
      :calibration-from-publish="calibrationFromPublish"
      :scale-percent="Math.round(scale * 100)"
      @reset-fog="resetFog"
      @reset-view="resetView"
    />

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

      <!-- Room focus layer: dims the plan outside the encounter's room and
           outlines it + its terrain zones (frame 13). Only when the map is a
           site plan the encounter is anchored to a room on — a plain
           location map has nothing to focus around. -->
      <BattleMapRoomFocusLayer
        v-if="surface?.focusRoomId && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :focus-cells="surface.focusCells"
        :zones="showZones ? terrainZones : []"
      />

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

    <BattleMapLegend :zones="terrainZones" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useEncounterRoom } from "@/composables/encounters/useEncounterRoom";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive, liveState } from "@/composables/encounters/useEncounterLive";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import BattleMapRoomFocusLayer from "@/components/encounters/BattleMapRoomFocusLayer.vue";
import BattleMapLegend from "@/components/encounters/BattleMapLegend.vue";
import BattleMapToolbar, {
  type BattleMapTool,
  type BattleMapBrushShape,
} from "@/components/encounters/BattleMapToolbar.vue";
import { seedFogMask, seedTokenPositions } from "@/lib/battlemap/roomBridge";
import {
  gridLinePositions,
  cellSizeInDisplay,
  gridOriginInDisplay,
} from "@/lib/battlemap/battleMapGeometry";
import {
  applyBrush,
  cellBrushCells,
  decodeFogMask,
  encodeFogMask,
  roundBrushCells,
  type BrushMode,
  type CellKey,
} from "@/lib/battlemap/fogMask";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";

const route = useRoute();
const encounterId = computed(() => route.params.id as string);
// `location` here is the map-bearing location — the encounter's own map, or
// (a room with none of its own) its site's published plan; `encounterLocation`
// is the encounter's own location, kept only for the diagnostic messages
// below, which need to tell a room apart from a plain map.
const {
  encounter,
  location: encounterLocation,
  mapLocation: location,
  surface,
  focusRoom,
  terrainZones,
} = useEncounterRoom(encounterId);
const store = useEncounterRunStore();
const { schedulePush, isLive } = useEncounterLive(encounterId.value);
const showZones = ref(true);

// Header (frame 13): "<focus room> — <encounter>" over a status line — the
// segmented control's Site option is what used to be the "← Back to the
// site" / "← Back to Runner" link, so its target and tooltip keep that same
// branch (a plain, non-room-anchored map still goes back to the Runner, not
// to a site page it was never on).
const siteTarget = computed(() =>
  surface.value?.focusRoomId
    ? { path: `/locations/${surface.value.mapLocation.id}`, query: { run: "true" } }
    : `/encounters/${encounterId.value}/run`,
);
const siteTooltip = computed(() => (surface.value?.focusRoomId ? "Back to the site" : "Back to Runner"));
const title = computed(() => {
  const encounterName = encounter.value?.name ?? "Loading…";
  return focusRoom.value ? `${focusRoom.value.name} — ${encounterName}` : encounterName;
});
const caption = computed(() => {
  if (!isLive.value) return "Encounter ready";
  const n = store.combatants.length;
  return `Encounter running · round ${store.round} · ${n} combatant${n === 1 ? "" : "s"}`;
});
const calibrationFromPublish = computed(() => location.value?.map_published_rev != null);

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

const tool = ref<BattleMapTool>("pan");
const brushShape = ref<BattleMapBrushShape>("round");
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

// Whether this go-live session has already seeded the room's fog. Tracked
// separately from the mask itself: inferring "not yet seeded" from
// `fogMask.size === 0` (the old approach) meant a DM's "Hide all" — which IS
// an empty mask — got silently re-seeded by the next surface recompute
// (regions refetching, etc.), undoing the DM's own action. Reset only on the
// false→true transition, i.e. a genuine new go-live, not on every recompute.
const seededForLive = ref(false);
watch(isLive, (live, wasLive) => {
  if (live && !wasLive) seededForLive.value = false;
});

// Entering combat seeds the party into the room they already occupy, and
// starts the room's own cells revealed — "you are standing in it" (frame
// 13/16). Token placement is idempotent on its own (only fills combatants
// with no position yet), so it re-runs every call; the fog seed is gated on
// `seededForLive` instead, so it fires exactly once per go-live.
function seedRoomIfNeeded() {
  const s = surface.value;
  if (!s || s.focusCells.length === 0) return;
  let changed = false;

  const seeded = seedTokenPositions(store.combatants, s.focusCells, {
    footprintOf: (c) => c.footprint ?? 1,
  });
  seeded.forEach((c, i) => {
    if (c.position && !store.combatants[i].position) {
      store.combatants[i].position = c.position;
      changed = true;
    }
  });

  if (!seededForLive.value) {
    fogMask.value = seedFogMask(s.focusCells);
    seededForLive.value = true;
    changed = true;
  }

  if (changed) pushFog();
}

watch(
  () => [isLive.value, surface.value] as const,
  ([live]) => {
    if (live) seedRoomIfNeeded();
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
  if (!encounterLocation.value) return "Loading location…";
  if (!surface.value) {
    // Check map_url first: a room can have its own uncalibrated map even
    // while its site's plan is also uncalibrated, and that case needs
    // "calibrate", not "no map of its own" — the room does have one.
    if (encounterLocation.value.location_type === "room") {
      return encounterLocation.value.map_url
        ? "This room's map is not calibrated yet. Open the location and click \"Calibrate grid\" to set the 5-ft scale."
        : "This room has no map of its own, and its site isn't calibrated either. Trace and publish a plan for the site first.";
    }
    return encounterLocation.value.map_url
      ? "This map is not calibrated yet. Open the location and click \"Calibrate grid\" to set the 5-ft scale."
      : "The linked location has no map. Upload or bake a map for this location first.";
  }
  // A room rides its site's own publish — already a legal battle map at
  // combat's cell scale (frame 13) — so only a plain, non-room-anchored map
  // still needs the explicit flag that hides tactical art from players.
  if (surface.value.focusRoomId === null && !surface.value.mapLocation.is_battle_map) {
    return "This location's map isn't marked as a battle map. Open the location and tick \"Battle map\" to use it in the VTT.";
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
