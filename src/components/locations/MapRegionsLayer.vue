<template>
  <canvas
    v-if="calibration"
    ref="canvasEl"
    class="absolute inset-0 h-full w-full"
    :class="mode === 'browse' && activeRegionId ? 'cursor-crosshair' : 'cursor-pointer'"
    @pointerdown="pointer.onPointerDown"
    @pointermove="pointer.onPointerMove"
    @pointerleave="pointer.onPointerLeave"
    @dblclick="pointer.onDoubleClick"
  />
</template>

<script setup lang="ts">
/**
 * The region overlay — a sibling of `MapPinsLayer` inside `MapFrame`'s slot,
 * so it inherits zoom/pan the same way pins and the image do (moved out of
 * `SiteMapView.vue`, #807). Deliberately no TanStack import for reads:
 * `regions`/`calibration` arrive as props from the composite
 * (`LocationMap.vue`), keeping this a pure renderer + interaction layer. It
 * does own the one write a canvas gesture needs — committing a stroke's
 * cells — the same split `SiteMapRegionList.vue` draws for bind/unbind.
 *
 * The pointer/gesture state machine (paint stroke, pen node drag, template
 * drop, tap-vs-drag, hover) lives in `useRegionPointer` (#868 wave 3, split
 * out once this file crossed the 600-line soft cap): this component supplies
 * it plain callbacks onto its own props/emits/mutation and gets back the
 * handlers the canvas binds to, plus the reactive state `renderOverlay` draws.
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useUpdateLocationMapRegion } from "@/composables/locations/useLocationMapRegions";
import { useRegionPointer, type UseRegionPointerOptions } from "@/composables/locations/useRegionPointer";
import { canvasToGridPoint, gridPointToCanvas } from "@/composables/locations/useRegionPen";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useUiStore } from "@/stores/ui";
import { cellAtImageFraction } from "@/lib/locations/gridCalibration";
import { cellsInsideRing, templateRing } from "@/lib/locations/polygon";
import {
  drawGridPass,
  drawPenOverlay,
  drawSpacesPass,
  drawTemplatePreview,
  drawWaysPass,
  drawZonesPass,
  type RenderGeometry,
} from "@/lib/locations/planCanvas";
import { isCellOnImageGrid } from "@/lib/locations/siteMap";
import type { CellKey } from "@/types/dungeonMap.types";
import type { DoorKind, SourceEdgeKey } from "@/types/locationDoor.types";
import type { GridCalibration } from "@/types/location.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";

const activeRegionId = defineModel<string | null>("activeRegionId", { default: null });

const {
  regions,
  calibration,
  imageNaturalWidth,
  imageNaturalHeight,
  mode,
  partyRoomId = null,
  reachableRoomIds = null,
  toImageFraction,
  showSpaces = true,
  showZones = false,
  showGrid = true,
  ways = [],
  showWays = true,
  nestedSiteIds = new Set<string>(),
} = defineProps<{
  regions: LocationMapRegion[];
  calibration: GridCalibration | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** Browse: tracing/select/navigate (the sheet, the Atlas pane). Run:
   *  click-to-move-party (`SiteRunSurface`). */
  mode: "browse" | "run";
  /** The room the party currently occupies. Only meaningful in run mode. */
  partyRoomId?: string | null;
  /** Rooms reachable from `partyRoomId` per the site's door graph. `null`
   *  means "nothing to be unreachable from yet" — every bound region renders
   *  and behaves as reachable. Only meaningful in run mode. */
  reachableRoomIds?: ReadonlySet<string> | null;
  /** The frame's client-coordinates → image-fraction conversion — the same
   *  one `MapPinsLayer` uses, so a click lands on the same cell the grid was
   *  drawn onto. See `MapFrame.vue`. */
  toImageFraction: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** The `Spaces` layer bar pill (#868). Spaces are the map's original
   *  content, so this defaults on. */
  showSpaces?: boolean;
  /** The `Zones` layer bar pill (#868). Off by default — a zone is DM ink
   *  first, and most plans have none traced yet. */
  showZones?: boolean;
  /** The `Grid` layer bar pill (#868). */
  showGrid?: boolean;
  /** Doors on this site, drawn as bars across their edge (frame 03) — only
   *  ones with a `source_edge_key` actually draw. `LocationMap.vue` passes
   *  this next wave; optional here so the prop can land ahead of that. */
  ways?: ReadonlyArray<{
    id: string;
    source_edge_key: SourceEdgeKey | null;
    door_kind: DoorKind;
    starts_locked: boolean;
    is_secret: boolean;
  }>;
  /** The `Ways` layer bar pill (#868). On by default — a door is structural,
   *  not DM ink, the way a zone is. */
  showWays?: boolean;
  /** Bound spaces that are themselves a nested site rather than a room
   *  (#818) — clicking one descends into it instead of pushing to its
   *  sheet. Derived by `LocationMap.vue` from the same `spaces` prop that
   *  feeds `SiteMapRegionList`. */
  nestedSiteIds?: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  "move-party": [roomId: string];
  /** A bound space is a nested site (#818) — `LocationMap.vue`'s caller
   *  decides what "descend" means (the Atlas pane re-centres, the sheet
   *  navigates); this layer only knows it isn't a plain room push. */
  descend: [spaceId: string];
  /** The region under the pointer changed — including to `null` on leaving
   *  it. Fired on hover, not on click; a later story uses it for a caption
   *  chip and nothing here reacts to it itself. */
  "hover-region": [regionId: string | null];
}>();

const router = useRouter();
const { error: toastError, fromError } = useToast();
const { confirm } = useConfirm();
const updateRegion = useUpdateLocationMapRegion();

// Trace tool (#868, frame 12) — `paint` is the default, so browse mode is
// unchanged until a DM deliberately switches. Read straight from the store
// rather than as a prop: `SiteMapRegionList` writes the same field, and
// `LocationMap.vue` doesn't otherwise mediate between these two siblings.
const uiStore = useUiStore();
const tool = computed(() => uiStore.siteMapTraceTool);

const canvasEl = ref<HTMLCanvasElement | null>(null);

// ── Interaction ──────────────────────────────────────────────────────────
// `useRegionPointer` owns the gesture state machine; below is this
// component's side of that contract: resolving an event to app state and
// committing a finished gesture through `updateRegion`. `pointer` is built
// before the render watch further down, which reads its state immediately.

// Geometry/lookup helpers the composable can't do itself (calibration, the
// canvas element, the `regions` prop — all host-only). `regionAt` (click
// routing) excludes zones on purpose — a click only ever means the space
// underneath one, never traced from a plain tap; `hoverRegionAt` follows the
// zone-over-space stacking a DM sees (`renderOverlay`).
function cellAt(clientX: number, clientY: number): CellKey | null {
  const cal = calibration;
  if (!cal || imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null;
  const frac = toImageFraction(clientX, clientY);
  return frac ? cellAtImageFraction(frac.x, frac.y, cal, imageNaturalWidth, imageNaturalHeight) : null;
}
function isPaintable(cell: CellKey): boolean {
  return !!calibration && isCellOnImageGrid(cell, calibration, imageNaturalWidth, imageNaturalHeight);
}
function gridPointAt(clientX: number, clientY: number): GridPoint | null {
  const cal = calibration;
  const canvas = canvasEl.value;
  if (!cal || !canvas || imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null;
  const frac = toImageFraction(clientX, clientY);
  return frac
    ? canvasToGridPoint(frac.x * canvas.width, frac.y * canvas.height, cal, imageNaturalWidth, imageNaturalHeight, canvas.width, canvas.height)
    : null;
}
function activeRegion(): LocationMapRegion | null {
  return regions.find((r) => r.id === activeRegionId.value) ?? null;
}
function hasActiveRegionId(): boolean {
  return !!activeRegionId.value;
}
function regionAt(cell: CellKey): LocationMapRegion | null {
  return regions.find((r) => r.region_role === "space" && r.cells.includes(cell)) ?? null;
}
function hoverRegionAt(cell: CellKey): LocationMapRegion | null {
  const zone = regions.find((r) => r.region_role === "zone" && r.cells.includes(cell));
  return zone ?? regions.find((r) => r.region_role === "space" && r.cells.includes(cell)) ?? null;
}

function commitCells(regionId: string, cells: CellKey[]): void {
  pendingStroke.value = { regionId, cells };
  updateRegion.mutate(
    { id: regionId, update: { cells } },
    {
      onError: (err) => {
        if (pendingStroke.value?.regionId === regionId) pendingStroke.value = null;
        toastError(fromError(err));
        renderOverlay();
      },
    },
  );
}

// A ring edit (drag/alt-delete/double-click-insert/draft-close), re-deriving
// `cells` alongside so the two never drift. Rethrows after toasting — the
// draft-close gesture needs that signal to put its ring back; every other
// caller swallows it.
async function commitRing(regionId: string, ring: GridPoint[]): Promise<void> {
  try {
    await updateRegion.mutateAsync({ id: regionId, update: { vertices: ring, cells: cellsInsideRing(ring) } });
  } catch (err) {
    toastError(fromError(err));
    throw err;
  }
}

// A finished template drop — separate from `commitRing` since a template's
// cell fill (`templateCells`) is its own algorithm, not the generic
// ring-fill `commitRing` uses for a hand-traced pen shape.
function commitTemplate(regionId: string, ring: GridPoint[], cells: CellKey[]): void {
  updateRegion.mutate({ id: regionId, update: { vertices: ring, cells } }, { onError: (err) => toastError(fromError(err)) });
}

// Converting a pen-traced region to painted cells is one-way and lossy (the
// diagonal is gone once `vertices` is null), so it's confirmed once here
// rather than silently on the first paint stroke.
async function confirmConvert(region: LocationMapRegion): Promise<boolean> {
  const ok = await confirm("Painting converts this pen-traced shape to cells — the diagonal edges are lost. Continue?", { danger: true });
  if (!ok) return false;
  try {
    await updateRegion.mutateAsync({ id: region.id, update: { vertices: null, cells: region.cells } });
    return true;
  } catch (err) {
    toastError(fromError(err));
    return false;
  }
}

// The nested-site case (#818) is `onDescend` in `pointerOptions` below
// instead — `useRegionPointer` picks between the two via `isNestedSite`.
function onNavigate(spaceId: string): void {
  router.push(`/locations/${spaceId}`);
}

const pointerOptions: UseRegionPointerOptions = {
  cellAt,
  isPaintable,
  gridPointAt,
  activeRegion,
  hasActiveRegionId,
  tool: () => tool.value,
  mode: () => mode,
  regionAt,
  hoverRegionAt,
  commitCells,
  commitRing,
  commitTemplate,
  confirmConvert,
  onSelect: (regionId) => (activeRegionId.value = regionId),
  onNavigate,
  onDescend: (spaceId) => emit("descend", spaceId),
  onMoveParty: (roomId) => emit("move-party", roomId),
  isReachable: (roomId) => !reachableRoomIds || reachableRoomIds.has(roomId),
  isNestedSite: (spaceId) => nestedSiteIds.has(spaceId),
  onHover: (regionId) => emit("hover-region", regionId),
};

const pointer = useRegionPointer(pointerOptions);

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  resizeObserver = new ResizeObserver(() => renderOverlay());
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  pointer.dispose();
});
// The canvas is sized in CSS to exactly cover the rendered image box, so
// observing the canvas itself is sufficient to catch every resize that would
// move it out of alignment.
watch(canvasEl, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) resizeObserver?.observe(el);
});

const NODE_SIZE_PX = 9;
// Mirrors `useRegionPointer`'s own hit-test radius (rendering only, not gesture logic).
const SNAP_HIT_RADIUS_CELLS = 0.4;

// A finished stroke's cells, echoed here until the refetch carries them back
// (the mutation invalidates rather than writing through). The persisted half
// of the override; `pointer.strokeCells` is the transient half — only this
// component can compare either against the live `regions` prop.
const pendingStroke = ref<{ regionId: string; cells: CellKey[] } | null>(null);

function sameCells(a: readonly CellKey[], b: readonly CellKey[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
}

watch(
  () => regions,
  (next) => {
    const pending = pendingStroke.value;
    if (!pending) return;
    const region = next.find((r) => r.id === pending.regionId);
    if (!region || sameCells(region.cells, pending.cells)) pendingStroke.value = null;
  },
);

// The in-flight or pending-echo cells, keyed by region id, fed to both the
// space and zone passes so an active trace never disagrees with itself.
function cellsOverride(): ReadonlyMap<string, readonly CellKey[]> | undefined {
  const overrides = new Map<string, readonly CellKey[]>();
  const stroke = pointer.strokeCells.value;
  if (stroke) overrides.set(stroke.regionId, stroke.cells);
  const pending = pendingStroke.value;
  if (pending && !overrides.has(pending.regionId)) overrides.set(pending.regionId, pending.cells);
  return overrides.size > 0 ? overrides : undefined;
}

function renderOverlay(): void {
  const canvas = canvasEl.value;
  const cal = calibration;
  if (!canvas || !cal) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = imageNaturalWidth;
  const h = imageNaturalHeight;
  const geometry: RenderGeometry = { calibration: cal, imageWidth: w, imageHeight: h, canvasWidth: canvas.width, canvasHeight: canvas.height };

  /** A pen ring vertex (grid-point space) to this canvas's own pixels — the
   *  same conversion the pen tool and the door bars below both need, since
   *  neither draws in whole cells the way the grid/fill passes do. */
  function pointToCanvas(point: GridPoint): { x: number; y: number } {
    return gridPointToCanvas(point, cal!, w, h, canvas!.width, canvas!.height);
  }

  if (showGrid) drawGridPass(ctx, geometry);

  const overrides = cellsOverride();

  if (showSpaces) {
    drawSpacesPass(
      ctx,
      geometry,
      regions,
      { mode, activeRegionId: activeRegionId.value, partyRoomId, reachableRoomIds },
      pointToCanvas,
      overrides,
    );
  }

  // Doors on the plan (#868, frame 03) — a bar across the door's own cell
  // edge, drawn over the space fill so it reads as a gap in the wall.
  if (showWays) drawWaysPass(ctx, geometry, ways, pointToCanvas);

  // Zones paint above spaces — a room is a floor to stand on, a zone is an
  // overlay ON that floor (water, ash, darkness) — and always dashed, so a
  // zone reads as an area effect rather than a second, competing room shape
  // (frame 07: "Zone layer over the space layer — dashed, so a zone never
  // reads as a room.").
  if (showZones) drawZonesPass(ctx, geometry, regions, activeRegionId.value, dpr, overrides);

  // ── Pen tool overlay (#868, frame 12) ────────────────────────────────────
  // The ring being traced or edited right now: a live node drag wins over
  // the persisted/draft ring it's dragging, the same override order
  // `cellsOverride` already uses for the paint stroke above.
  if (mode === "browse" && tool.value === "pen" && activeRegionId.value) {
    const region = regions.find((r) => r.id === activeRegionId.value);
    if (region) {
      const persisted = region.vertices !== null;
      const drag = pointer.liveDrag.value;
      const dragging = drag && drag.regionId === region.id ? drag.ring : null;
      const ring = dragging ?? (persisted ? region.vertices! : pointer.draftRing.value);
      drawPenOverlay(ctx, pointToCanvas, ring, persisted, pointer.penHoverPoint.value, NODE_SIZE_PX, SNAP_HIT_RADIUS_CELLS);
    }
  }

  // ── Template preview (#868, frame 12: "dropped in one drag") ─────────────
  if (mode === "browse" && tool.value === "template" && pointer.templateDraft.value && pointer.templateDraft.value.radius > 0) {
    const { shape, center, radius } = pointer.templateDraft.value;
    drawTemplatePreview(ctx, pointToCanvas, templateRing(shape, center, radius));
  }
}

watch(
  [
    () => regions,
    () => calibration,
    activeRegionId,
    () => imageNaturalWidth,
    () => imageNaturalHeight,
    () => mode,
    () => partyRoomId,
    () => reachableRoomIds,
    () => showSpaces,
    () => showZones,
    () => showGrid,
    () => ways,
    () => showWays,
    tool,
    () => pointer.draftRing.value,
    () => pointer.templateDraft.value,
    () => pointer.penHoverPoint.value,
    () => pointer.liveDrag.value,
    () => pointer.strokeCells.value,
  ],
  () => renderOverlay(),
  { flush: "post", immediate: true },
);
</script>
