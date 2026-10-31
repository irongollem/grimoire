<template>
  <div class="relative flex h-full min-h-0 flex-col overflow-hidden play-map-ground">
    <div
      ref="canvasHost"
      data-testid="play-map-host"
      class="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerUp"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div
        v-if="state.loadingState.value"
        class="absolute inset-0 mx-auto flex max-w-lg items-center justify-center p-8 text-center text-body text-muted-foreground"
      >
        {{ state.loadingState.value }}
      </div>

      <!-- Ground, water, grid, standing, top live layer (#1073), under room focus, tokens and fog. -->
      <BattleMapStack
        v-else-if="location && surface && imageReady"
        :host-w="hostW"
        :host-h="hostH"
        :layers="surface"
        :pan-x="panX"
        :pan-y="panY"
        :image-w="imageNaturalW * scale"
        :image-h="imageNaturalH * scale"
        :show-grid="view.showGrid"
        :grid-verticals="gridVerticals"
        :grid-horizontals="gridHorizontals"
        :grid-stroke-opacity="gridStrokeOpacity"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :zones="state.darknessZones.value"
        :door-states="state.doorStates.value"
      />

      <!-- Dims the plan outside the encounter's room and outlines it + its terrain zones (frame 13). -->
      <BattleMapRoomFocusLayer
        v-if="surface?.focusRoomId && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :focus-cells="surface.focusCells"
        :zones="view.showZones ? state.terrainZones.value : []"
      />

      <!-- Every token drags under every tool; a press anywhere else is the tool's. A follower reads only. -->
      <BattleMapTokenLayer
        v-if="view.showTokens && location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="view.asPlayer ? revealedCombatants(state.placed.value, state.fogMask.value) : state.placed.value"
        :hide-hidden="view.asPlayer"
        :silhouette-unseen="view.asPlayer"
        :factions="state.factions.value"
        :monsters="state.monsters.value"
        :npcs="store.availableNpcs"
        :active-instance-id="state.activeInstanceId.value"
        :draggable-instance-ids="canEdit ? null : READ_ONLY"
        :portrait-overrides="portraitOverrides"
        :figures="dollFigures"
        :on-position-change="state.moveCombatant"
      />

      <!-- "As player" is the whole player view: fogged-out combatants dropped, hidden ones omitted,
           unseen ones a silhouette (found by the #884 review pass), and the fog opaque. -->
      <BattleMapFogLayer
        v-if="(view.showFog || view.asPlayer) && location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :mask="state.fogMask.value"
        :opaque="view.asPlayer"
      />

      <img v-if="surface?.imageUrl && !imageReady" :src="surface.imageUrl" class="hidden-loader" @load="onImageLoad" />
    </div>

    <BattleMapLegend :zones="state.terrainZones.value" />

    <p
      v-if="hint"
      data-testid="play-map-hint"
      class="pointer-events-none absolute bottom-3 left-3 max-w-[40%] rounded-md bg-card/85 px-2 py-1 text-caption text-muted-foreground"
    >
      {{ hint }}
    </p>

    <PlayToolbelt
      v-if="canEdit && imageReady"
      v-model:tool="tool"
      v-model:fog-kind="fogKind"
      v-model:shape="shape"
      v-model:size="size"
      v-model:radius="radius"
      class="absolute bottom-3 left-1/2 -translate-x-1/2"
      @reveal-all="state.revealAll(imageNaturalW, imageNaturalH)"
      @hide-all="state.hideAll()"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import { useCombatantMinis } from "@/composables/encounters/useCombatantMinis";
import { useCombatantDollFigures } from "@/composables/encounters/useCombatantDollFigures";
import { useHotkeys } from "@/composables/useHotkeys";
import { useEncounterRunStore } from "@/stores/encounterRun";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import BattleMapStack from "@/components/encounters/BattleMapStack.vue";
import BattleMapRoomFocusLayer from "@/components/encounters/BattleMapRoomFocusLayer.vue";
import BattleMapLegend from "@/components/encounters/BattleMapLegend.vue";
import { cellSizeInDisplay, gridLinePositions, gridOriginInDisplay } from "@/lib/battlemap/battleMapGeometry";
import { cellBrushCells, revealedCombatants, roundBrushCells, type FogCellKey } from "@/lib/battlemap/fogMask";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import PlayToolbelt from "./PlayToolbelt.vue";
import { usePlayMapState } from "./usePlayMapState";
import { resolvePointerAction } from "./playPointer";
import { cellOnMap, dropCell } from "./playRoster";
import {
  DEFAULT_PLAY_VIEW,
  PLAY_DRAG_TYPE,
  PLAY_TOOL_KEYS,
  type BrushShape,
  type BrushSize,
  type DarknessRadius,
  type FogBrushKind,
  type PlayMapMode,
  type PlayTool,
  type PlayViewState,
} from "./playTypes";
import type { RunCombatant } from "@/types/encounter.types";

/**
 * The battle map of the Play screen (#1125 decision 9) and of the Table screen window: the stack,
 * its layers, the pointer router and the toolbelt. What it shows and writes (fog, darkness, doors,
 * tokens) lives in usePlayMapState; this file turns pixels into cells.
 */
const {
  encounterId,
  mode = "dm",
  view = DEFAULT_PLAY_VIEW,
  placingId = null,
} = defineProps<{
  encounterId: string;
  mode?: PlayMapMode;
  view?: PlayViewState;
  /** A portrait armed in the unplaced tray: the next press on the map seats it. */
  placingId?: string | null;
}>();

const emit = defineEmits<{
  /** The combatants with no square, whenever they change: the tray lists exactly these. */
  unplaced: [combatants: RunCombatant[]];
  placed: [instanceId: string];
  "cancel-placing": [];
}>();

const store = useEncounterRunStore();
const state = usePlayMapState(
  computed(() => encounterId),
  () => mode,
);
const { surface, location } = state;
const canEdit = computed(() => mode === "dm");
const READ_ONLY = new Set<string>();

const portraitOverrides = useCombatantMinis(state.combatants);
const dollFigures = useCombatantDollFigures(state.combatants);

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

// ── Geometry ──────────────────────────────────────────────────────────────

const cellPx = computed(() =>
  surface.value
    ? cellSizeInDisplay({
        imageNaturalWidth: imageNaturalW.value,
        cellsPerImageWidth: surface.value.calibration.cells_per_image_width,
        scale: scale.value,
      })
    : 0,
);
const gridOrigin = computed(() =>
  surface.value
    ? gridOriginInDisplay({
        panX: panX.value,
        panY: panY.value,
        scale: scale.value,
        imageNaturalWidth: imageNaturalW.value,
        imageNaturalHeight: imageNaturalH.value,
        originXPct: surface.value.calibration.origin_x_pct,
        originYPct: surface.value.calibration.origin_y_pct,
      })
    : { x: 0, y: 0 },
);
const gridVerticals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.x, hostW.value, cellPx.value) : [],
);
const gridHorizontals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.y, hostH.value, cellPx.value) : [],
);
const gridStrokeOpacity = computed(() => surface.value?.calibration.grid_opacity ?? DEFAULT_GRID_OPACITY);

/** A pointer position in the fractional image cells the fog, tokens, darkness and doors share; null before the map has a size. */
function imageCellAt(clientX: number, clientY: number): { x: number; y: number } | null {
  const host = canvasHost.value;
  if (!host || cellPx.value <= 0) return null;
  const rect = host.getBoundingClientRect();
  return {
    x: (clientX - rect.left - gridOrigin.value.x) / cellPx.value,
    y: (clientY - rect.top - gridOrigin.value.y) / cellPx.value,
  };
}

// ── Tools ─────────────────────────────────────────────────────────────────

const tool = ref<PlayTool>("move");
const fogKind = ref<FogBrushKind>("reveal");
const shape = ref<BrushShape>("round");
const size = ref<BrushSize>(3);
const radius = ref<DarknessRadius>(15);

useHotkeys(
  () => [
    { combo: PLAY_TOOL_KEYS.move, description: "Move tool", handler: () => (tool.value = "move") },
    { combo: PLAY_TOOL_KEYS.fog, description: "Fog tool", handler: () => (tool.value = "fog") },
    { combo: PLAY_TOOL_KEYS.darkness, description: "Darkness tool", handler: () => (tool.value = "darkness") },
    { combo: "escape", description: "Stop placing", hidden: true, handler: () => emit("cancel-placing") },
  ],
  { enabled: () => canEdit.value },
);

function brushedCells(clientX: number, clientY: number): Set<FogCellKey> {
  const host = canvasHost.value;
  if (!host) return new Set();
  const rect = host.getBoundingClientRect();
  const fn = shape.value === "round" ? roundBrushCells : cellBrushCells;
  return fn({
    pixelX: clientX - rect.left,
    pixelY: clientY - rect.top,
    cellPx: cellPx.value,
    originX: gridOrigin.value.x,
    originY: gridOrigin.value.y,
    brushCells: size.value,
  });
}

// ── Pointer router ────────────────────────────────────────────────────────
// A draggable token takes its own press (BattleMapTokenLayer stops it), so this only sees presses on
// the bare map. A stroke that starts here is a brush stroke for as long as the pointer is down.
const brushing = ref(false);

function onPointerDown(e: PointerEvent) {
  const at = imageCellAt(e.clientX, e.clientY);
  const action = resolvePointerAction({
    imageReady: imageReady.value,
    canEdit: canEdit.value,
    tool: tool.value,
    onDoor: at !== null && state.doorIdAt(at.x, at.y) !== null,
    placing: placingId !== null,
  });
  if (action === "none") return;
  if (action === "pan") {
    startPan(e);
    return;
  }
  if (action === "brush") {
    brushing.value = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    state.paintFog(brushedCells(e.clientX, e.clientY), fogKind.value);
    return;
  }
  if (!at) return;
  if (action === "toggle-door") state.toggleDoorAt(at.x, at.y);
  else if (action === "darkness") state.toggleDarknessAt(at.x, at.y, radius.value);
  else if (placingId !== null) placeAt(placingId, at);
}

function onPointerMove(e: PointerEvent) {
  if (brushing.value) {
    state.paintFog(brushedCells(e.clientX, e.clientY), fogKind.value);
    return;
  }
  continuePan(e);
}

function onPointerUp(e: PointerEvent) {
  brushing.value = false;
  endPan(e);
}

// ── Placing a combatant that has no square ────────────────────────────────

function placeAt(instanceId: string, at: { x: number; y: number }) {
  const s = surface.value;
  if (!s || imageNaturalW.value <= 0) return;
  const cellsAcross = s.calibration.cells_per_image_width;
  const cell = dropCell(at);
  if (!cellOnMap(cell, cellsAcross, Math.ceil(cellsAcross * (imageNaturalH.value / imageNaturalW.value)))) return;
  state.moveCombatant(instanceId, cell);
  emit("placed", instanceId);
}

function onDrop(e: DragEvent) {
  const id = e.dataTransfer?.getData(PLAY_DRAG_TYPE);
  const at = imageCellAt(e.clientX, e.clientY);
  if (!canEdit.value || !id || !at) return;
  placeAt(id, at);
}

watch(state.unplaced, (list) => emit("unplaced", list), { immediate: true });

const hint = computed(() => {
  if (!canEdit.value) return "";
  const armed = placingId ? state.combatants.value.find((c) => c.instance_id === placingId) : null;
  if (armed) return `Click a square to place ${armed.name}. Esc to cancel.`;
  return state.unplaced.value.length > 0 ? "Drag a portrait onto the map to place it." : "";
});

// ── Follow the turn ───────────────────────────────────────────────────────
// Centres the map on whoever's turn it starts. Only when the DM asked for it: a map that jumps
// by itself while a DM is brushing fog is worse than one that does not follow.
watch(
  () => [state.activeInstanceId.value, view.followTurn] as const,
  ([id, follow]) => {
    if (!follow || !id || cellPx.value <= 0) return;
    const at = state.combatants.value.find((c) => c.instance_id === id)?.position;
    if (!at) return;
    panX.value += hostW.value / 2 - (gridOrigin.value.x + (at.x + 0.5) * cellPx.value);
    panY.value += hostH.value / 2 - (gridOrigin.value.y + (at.y + 0.5) * cellPx.value);
  },
);

defineExpose({ resetView });
</script>

<style scoped>
.play-map-ground {
  background: color-mix(in oklab, var(--color-background), black 45%);
}

.hidden-loader {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
