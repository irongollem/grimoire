<template>
  <div class="explore-map-ground relative flex h-full min-h-0 flex-col overflow-hidden">
    <div
      ref="canvasHost"
      data-testid="explore-map-host"
      class="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
    >
      <BattleMapStack
        v-if="imageReady"
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
      />

      <ExploreRoomLayer
        v-if="imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :shaded="shadedCells"
        :entering="enteringCells"
        :rooms="view.showZones ? rooms : []"
      />

      <BattleMapTokenLayer
        v-if="view.showTokens && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="tokens"
        :factions="DEFAULT_FACTIONS"
        :selected-instance-ids="selection"
        :on-position-change="moves.commitMove"
        :on-select="moves.onTokenSelect"
        :on-drag-preview="moves.onDragPreview"
      />

      <PlayMovePath
        v-if="preview && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :lines="preview.lines"
        :label-text="preview.text"
        :label-state="preview.state"
        :label-at="preview.labelAt"
      />

      <div v-if="boxStyle" class="select-box" :style="boxStyle" aria-hidden="true"></div>

      <img v-if="surface.imageUrl && !imageReady" :src="surface.imageUrl" class="hidden-loader" @load="onImageLoad" />
    </div>

    <p
      data-testid="explore-map-hint"
      class="pointer-events-none absolute bottom-3 left-3 max-w-[40%] rounded-md bg-card/85 px-2 py-1 text-caption text-muted-foreground"
    >
      Click a square and the party moves together, in order. Click one token to send it alone, and again to bring everyone back.
    </p>

    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import BattleMapStack from "@/components/encounters/BattleMapStack.vue";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import PlayMovePath from "@/components/encounters/play/PlayMovePath.vue";
import { isClick } from "@/components/encounters/play/playPointer";
import { usePlayTokenMoves, type MoveMapState, type MoveTurnBook } from "@/components/encounters/play/usePlayTokenMoves";
import { cellSizeInDisplay, gridLinePositions, gridOriginInDisplay } from "@/lib/battlemap/battleMapGeometry";
import { occludersOf } from "@/lib/battlemap/occlusion";
import type { BattleSurface } from "@/lib/battlemap/roomBridge";
import type { ExploreCell } from "@/lib/locations/explore";
import { DEFAULT_PLAY_VIEW, type PlayViewState } from "@/components/encounters/play/playTypes";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import { DEFAULT_FACTIONS, type RunCombatant } from "@/types/encounter.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { Monster } from "@/types/monster.types";
import ExploreRoomLayer from "./ExploreRoomLayer.vue";

/**
 * The site's map while the party explores it (#1125 decision 9, frame 09): the same battle-map stack, token layer and
 * movement rules a fight uses, with the party's tokens, the unexplored rooms shaded for the DM and the room being
 * entered outlined. It writes nothing itself: a move is handed up as the squares the characters now stand on.
 */
const {
  surface,
  tokens,
  rooms,
  shadedCells,
  enteringCells,
  view = DEFAULT_PLAY_VIEW,
  selectedId = null,
  groupIds = [],
} = defineProps<{
  surface: BattleSurface;
  tokens: RunCombatant[];
  rooms: readonly { id: string; name: string; cells: readonly CellKey[] }[];
  shadedCells: readonly CellKey[];
  enteringCells: readonly CellKey[];
  view?: PlayViewState;
  /** The token moved on its own, or the lead of the group. */
  selectedId?: string | null;
  /** Several tokens moving together; empty when only `selectedId` is selected. */
  groupIds?: string[];
}>();

const emit = defineEmits<{
  /** Characters that now stand on new squares, by party member id. */
  move: [positions: Record<string, ExploreCell>];
  select: [instanceId: string | null];
  "update:groupIds": [instanceIds: string[]];
}>();

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

const cellPx = computed(() =>
  cellSizeInDisplay({
    imageNaturalWidth: imageNaturalW.value,
    cellsPerImageWidth: surface.calibration.cells_per_image_width,
    scale: scale.value,
  }),
);
const gridOrigin = computed(() =>
  gridOriginInDisplay({
    panX: panX.value,
    panY: panY.value,
    scale: scale.value,
    imageNaturalWidth: imageNaturalW.value,
    imageNaturalHeight: imageNaturalH.value,
    originXPct: surface.calibration.origin_x_pct,
    originYPct: surface.calibration.origin_y_pct,
  }),
);
const gridVerticals = computed(() => (cellPx.value > 0 ? gridLinePositions(gridOrigin.value.x, hostW.value, cellPx.value) : []));
const gridHorizontals = computed(() => (cellPx.value > 0 ? gridLinePositions(gridOrigin.value.y, hostH.value, cellPx.value) : []));
const gridStrokeOpacity = computed(() => surface.calibration.grid_opacity ?? DEFAULT_GRID_OPACITY);

function imageCellAt(clientX: number, clientY: number): { x: number; y: number } | null {
  const host = canvasHost.value;
  if (!host || cellPx.value <= 0) return null;
  const rect = host.getBoundingClientRect();
  return {
    x: (clientX - rect.left - gridOrigin.value.x) / cellPx.value,
    y: (clientY - rect.top - gridOrigin.value.y) / cellPx.value,
  };
}

// ── Moving: the fight's own rules, with nobody's turn to charge ──────────────

const placed = computed(() => tokens.filter((c) => c.position));
const mapState: MoveMapState = {
  placed,
  monsters: computed<Monster[]>(() => []),
  activeInstanceId: computed<string | null>(() => null),
  // Walls stop a path as they do in a fight; a door drawn open or shut stays as drawn, as nothing here toggles one.
  moveTerrain: computed(() => ({
    difficult: new Set<string>(),
    walls: surface.live ? occludersOf(surface.live, []).segments : [],
  })),
  moveCombatant: (instanceId, position) => {
    const memberId = tokens.find((c) => c.instance_id === instanceId)?.party_member_id;
    if (memberId !== undefined) emit("move", { [memberId]: position });
  },
};
const noTurns: MoveTurnBook = {
  availableMonsters: [],
  availableNpcs: [],
  started: false,
  combatants: [],
  recordMove: () => {},
  undoMove: () => null,
};

const moves = usePlayTokenMoves({
  state: mapState,
  store: noTurns,
  selectedId: () => selectedId,
  groupIds: () => groupIds,
  partyMembers: () => [],
  canEdit: computed(() => true),
  tool: ref("move"),
  placing: () => false,
  select: (id) => emit("select", id),
  selectGroup: (ids) => emit("update:groupIds", ids),
});
const { selection, preview } = moves;

// ── Pointer: pan, click a square, Shift-drag a box ───────────────────────────
const press = ref<{ x: number; y: number; kind: "pan" | "box" } | null>(null);
const boxEnd = ref<{ x: number; y: number } | null>(null);

function onPointerDown(e: PointerEvent) {
  if (!imageReady.value) return;
  moves.hover.value = null;
  if (e.shiftKey) {
    press.value = { x: e.clientX, y: e.clientY, kind: "box" };
    boxEnd.value = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    return;
  }
  press.value = { x: e.clientX, y: e.clientY, kind: "pan" };
  startPan(e);
}

function onPointerMove(e: PointerEvent) {
  if (press.value?.kind === "box") {
    boxEnd.value = { x: e.clientX, y: e.clientY };
    return;
  }
  if (e.buttons === 0) {
    moves.hover.value = imageCellAt(e.clientX, e.clientY);
    return;
  }
  moves.hover.value = null;
  continuePan(e);
}

function onPointerUp(e: PointerEvent) {
  const pressed = press.value;
  press.value = null;
  boxEnd.value = null;
  if (pressed?.kind === "box") {
    if (isClick(pressed, { x: e.clientX, y: e.clientY })) moves.addWaypoint(imageCellAt(e.clientX, e.clientY));
    else moves.selectBox(imageCellAt(pressed.x, pressed.y), imageCellAt(e.clientX, e.clientY));
    return;
  }
  endPan(e);
  // A press on a square that never moved is a move there; a pan that travelled is only a pan.
  if (pressed?.kind === "pan" && isClick(pressed, { x: e.clientX, y: e.clientY })) moves.clickSquare(imageCellAt(e.clientX, e.clientY));
}

function onPointerLeave(e: PointerEvent) {
  moves.hover.value = null;
  press.value = null;
  boxEnd.value = null;
  endPan(e);
}

const boxStyle = computed(() => {
  const start = press.value;
  const end = boxEnd.value;
  const host = canvasHost.value;
  if (start?.kind !== "box" || !end || !host || isClick(start, end)) return null;
  const rect = host.getBoundingClientRect();
  return {
    left: `${Math.min(start.x, end.x) - rect.left}px`,
    top: `${Math.min(start.y, end.y) - rect.top}px`,
    width: `${Math.abs(end.x - start.x)}px`,
    height: `${Math.abs(end.y - start.y)}px`,
  };
});

defineExpose({ resetView });
</script>

<style scoped>
.explore-map-ground {
  background: color-mix(in oklab, var(--color-background), black 45%);
}

.select-box {
  position: absolute;
  pointer-events: none;
  border: 1px dashed var(--color-primary);
  background: color-mix(in oklab, var(--color-primary), transparent 88%);
}

.hidden-loader {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
