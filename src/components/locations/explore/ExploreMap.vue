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
        :entering="enteringCells"
        :rooms="view.showZones ? rooms : []"
      />

      <!-- What the party has seen and sees: the DM's translucent hint, never opaque (epic #1133). -->
      <BattleMapFogLayer
        v-if="fogMask && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :mask="fogMask"
        :seen="fogSeen"
        class="pointer-events-none"
      />

      <BattleMapTokenLayer
        v-if="view.showTokens && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="placed"
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

      <!-- Pings, measure lines and drawings from the whole table (#1125 decision 12). -->
      <PlayTableMarks
        v-if="imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :pings="table.pings.value"
        :measures="table.measures.value"
        :drawings="table.drawings.value"
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

    <!-- Fog is the map's memory while exploring, so no Fog, Area or Darkness tools here (#1125 frame 11, epic #1133). -->
    <PlayToolbelt
      v-if="imageReady"
      v-model:tool="tool"
      v-model:draw-pinned="drawPinned"
      :tools="EXPLORE_TOOLS"
      class="absolute bottom-3 left-1/2 -translate-x-1/2"
      @clear-drawings="table.clearAll()"
    />

    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import BattleMapStack from "@/components/encounters/BattleMapStack.vue";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import PlayMovePath from "@/components/encounters/play/PlayMovePath.vue";
import PlayTableMarks from "@/components/encounters/play/PlayTableMarks.vue";
import PlayToolbelt from "@/components/encounters/play/PlayToolbelt.vue";
import { usePlayTableTools } from "@/components/encounters/play/usePlayTableTools";
import { useTableChannel } from "@/composables/table/useTableChannel";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { senderColor } from "@/lib/table/identity";
import { useHotkeys } from "@/composables/useHotkeys";
import { isClick } from "@/components/encounters/play/playPointer";
import { usePlayTokenMoves, type MoveMapState, type MoveTurnBook } from "@/components/encounters/play/usePlayTokenMoves";
import { cellSizeInDisplay, gridLinePositions, gridOriginInDisplay } from "@/lib/battlemap/battleMapGeometry";
import type { FogCellKey } from "@/lib/battlemap/fogMask";
import { occludersOf } from "@/lib/battlemap/occlusion";
import type { BattleSurface } from "@/lib/battlemap/roomBridge";
import type { ExploreCell, ExploreFrame } from "@/lib/locations/explore";
import { DEFAULT_PLAY_VIEW, PLAY_TOOL_KEYS, type ExploreTool, type PlayTool, type PlayViewState } from "@/components/encounters/play/playTypes";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import { DEFAULT_FACTIONS, type RunCombatant } from "@/types/encounter.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { Monster } from "@/types/monster.types";
import ExploreRoomLayer from "./ExploreRoomLayer.vue";

/**
 * The site's map while the party explores it (#1125 decision 9, frame 09): the same battle-map stack, token layer and
 * movement rules a fight uses, with the party's tokens, the party's remembered sight as fog for the DM and the room being
 * entered outlined. It writes nothing itself: a move is handed up as the squares the characters now stand on.
 */
const {
  surface,
  tokens,
  rooms,
  enteringCells,
  view = DEFAULT_PLAY_VIEW,
  selectedId = null,
  groupIds = [],
  fogMask = null,
  fogSeen = null,
} = defineProps<{
  surface: BattleSurface;
  tokens: RunCombatant[];
  rooms: readonly { id: string; name: string; cells: readonly CellKey[] }[];
  enteringCells: readonly CellKey[];
  view?: PlayViewState;
  /** The token moved on its own, or the lead of the group. */
  selectedId?: string | null;
  /** Several tokens moving together; empty when only `selectedId` is selected. */
  groupIds?: string[];
  /** The squares the party has seen or sees (map memory plus sight); null draws no fog. */
  fogMask?: Set<FogCellKey> | null;
  /** The squares in view right now; a revealed square outside it keeps a partial fog. */
  fogSeen?: ReadonlySet<FogCellKey> | null;
}>();

const emit = defineEmits<{
  /** Characters that now stand on new squares, by party member id. */
  move: [positions: Record<string, ExploreCell>];
  select: [instanceId: string | null];
  "update:groupIds": [instanceIds: string[]];
  /** Characters with no square yet, picked when a square was clicked: seat them there in formation. */
  seat: [memberIds: string[], at: ExploreCell];
  /** The picture's size in image cells, once it has loaded. */
  frame: [frame: ExploreFrame];
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

const tool = ref<PlayTool>("move");
const EXPLORE_TOOLS: readonly ExploreTool[] = ["move", "measure", "ping", "draw"];

const auth = useAuthStore();
const campaignStore = useCampaignStore();
const identity = computed(() =>
  auth.user ? { id: auth.user.id, name: auth.publicName ?? "The DM", color: senderColor(auth.user.id) } : null,
);
const table = useTableChannel(() => campaignStore.activeCampaign?.id ?? null, { identity });
const drawPinned = ref(false);
const tableTools = usePlayTableTools({
  channel: table,
  tool,
  color: () => (identity.value ? identity.value.color : senderColor("")),
  pinned: drawPinned,
});
watch(tool, () => tableTools.cancel());
useHotkeys(() => [
  ...EXPLORE_TOOLS.map((id) => ({ combo: PLAY_TOOL_KEYS[id], description: `${id[0].toUpperCase()}${id.slice(1)} tool`, handler: () => (tool.value = id) })),
  // Lets go of a measure line being held; the page's own Esc still re-selects the party.
  { combo: "escape", description: "Let go of the line", hidden: true, handler: () => tableTools.cancel() },
]);

const moves = usePlayTokenMoves({
  state: mapState,
  store: noTurns,
  selectedId: () => selectedId,
  groupIds: () => groupIds,
  partyMembers: () => [],
  canEdit: computed(() => true),
  tool,
  placing: () => false,
  select: (id) => emit("select", id),
  selectGroup: (ids) => emit("update:groupIds", ids),
});
const { selection, preview } = moves;

// The picture's size in squares, for seating a party on a site with no room to stand in.
watch(
  [imageReady, imageNaturalW, imageNaturalH],
  ([ready, w, h]) => {
    if (ready && w > 0 && h > 0) emit("frame", { across: surface.calibration.cells_per_image_width, down: (surface.calibration.cells_per_image_width * h) / w });
  },
  { immediate: true },
);

// A click on a square seats whoever of the selection has no square yet; the placed ones move as usual.
function clickSquare(at: { x: number; y: number } | null) {
  if (at && tool.value === "move") {
    const ids = tokens.flatMap((t) => (!t.position && t.party_member_id !== undefined && selection.value.has(t.instance_id) ? [t.party_member_id] : []));
    if (ids.length > 0) emit("seat", ids, { x: Math.floor(at.x), y: Math.floor(at.y) });
  }
  moves.clickSquare(at);
}

// ── Pointer: pan, click a square, Shift-drag a box ───────────────────────────
const press = ref<{ x: number; y: number; kind: "pan" | "box" } | null>(null);
const boxEnd = ref<{ x: number; y: number } | null>(null);

function onPointerDown(e: PointerEvent) {
  if (!imageReady.value) return;
  moves.hover.value = null;
  if (tableTools.owns.value) {
    const at = imageCellAt(e.clientX, e.clientY);
    if (!at) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    tableTools.down(at, { x: e.clientX, y: e.clientY });
    return;
  }
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
  if (tableTools.live.value) {
    const at = imageCellAt(e.clientX, e.clientY);
    if (at) tableTools.move(at);
    return;
  }
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
  if (tableTools.live.value) {
    const at = imageCellAt(e.clientX, e.clientY);
    if (at) tableTools.up(at, { x: e.clientX, y: e.clientY });
    else tableTools.cancel();
    return;
  }
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
  if (pressed?.kind === "pan" && isClick(pressed, { x: e.clientX, y: e.clientY })) clickSquare(imageCellAt(e.clientX, e.clientY));
}

function onPointerLeave(e: PointerEvent) {
  tableTools.release();
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
