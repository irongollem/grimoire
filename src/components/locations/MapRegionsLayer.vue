<template>
  <canvas
    v-if="calibration"
    ref="canvasEl"
    class="absolute inset-0 h-full w-full"
    @pointerdown="pointer.onPointerDown"
    @pointermove="pointer.onPointerMove"
    @pointerleave="pointer.onPointerLeave"
  />
</template>

<script setup lang="ts">
/**
 * The region overlay — a sibling of `MapPinsLayer` inside `MapFrame`'s slot,
 * so it inherits zoom/pan the same way pins and the image do (moved out of
 * `SiteMapView.vue`, #807). Deliberately no TanStack import for reads:
 * `regions`/`calibration` arrive as props from the composite
 * (`LocationMap.vue`), keeping this a pure renderer + interaction layer.
 *
 * Read-only + click-to-navigate/descend (browse) and click-to-move-party
 * (run) ONLY, as of #884 S11 — tracing (paint/pen/template) and the door
 * tool both moved to `MapWorkbench`'s embedded Plan palette, which is the
 * ONLY place Build mode mounts now (`AtlasSiteMapMode.vue`/`LocationSheet.vue`
 * no longer render this component with editing affordances at all — Browse
 * and Run are the only two modes left here). This surface uses
 * `useRegionNavPointer`, the read/navigate half of what `useRegionPointer`
 * used to be alone — that composable still exists for the Cartographer's
 * Plan canvas (`usePlanCanvasTools.ts`), which still traces, but this
 * component no longer satisfies its tracing contract with no-op/lying
 * stubs (`activeRegion` always null, `commitCells` a no-op, …); it just
 * never had anything to trace with in the first place.
 */
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useRegionNavPointer, type UseRegionNavPointerOptions } from "@/composables/locations/useRegionNavPointer";
import { gridPointToCanvas } from "@/composables/locations/useRegionPen";
import { cellAtImageFraction } from "@/lib/locations/gridCalibration";
import {
  drawFogPass,
  drawGridPass,
  drawSpacesPass,
  drawWaysPass,
  drawZonesPass,
  type RenderGeometry,
  type RoomFacts,
} from "@/lib/locations/planCanvas";
import type { CellKey } from "@/types/dungeonMap.types";
import type { DoorKind, SourceEdgeKey } from "@/types/locationDoor.types";
import type { GridCalibration } from "@/types/location.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";

const {
  regions,
  calibration,
  imageNaturalWidth,
  imageNaturalHeight,
  mode,
  partyRoomId = null,
  reachableRoomIds = null,
  roomState,
  toImageFraction,
  showSpaces = true,
  showZones = false,
  showGrid = true,
  ways = [],
  showWays = true,
  nestedSiteIds = new Set<string>(),
  showFog = false,
  fogGlimpsedCells = [],
} = defineProps<{
  regions: LocationMapRegion[];
  calibration: GridCalibration | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  /** Browse: select/navigate (the sheet, the Atlas pane). Run:
   *  click-to-move-party (`SiteRunSurface`). Tracing/editing both moved to
   *  `MapWorkbench` (#884 S11) — neither mode here ever edits. */
  mode: "browse" | "run";
  /** The room the party currently occupies. Only meaningful in run mode. */
  partyRoomId?: string | null;
  /** Rooms reachable from `partyRoomId` per the site's door graph. `null`
   *  means "nothing to be unreachable from yet" — every bound region renders
   *  and behaves as reachable. Only meaningful in run mode. */
  reachableRoomIds?: ReadonlySet<string> | null;
  /** A bound space's durable world-state facts (#868, frame 01) — shades a
   *  space's fill once the DM has asserted anything about it. Browse mode
   *  only; `LocationMap.vue` builds it from `useLocationStateForRooms`. */
  roomState?: ReadonlyMap<string, RoomFacts>;
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
   *  ones with a `edge_key` actually draw. */
  ways?: ReadonlyArray<{
    id: string;
    edge_key: SourceEdgeKey | null;
    door_kind: DoorKind;
    starts_locked: boolean;
    is_secret: boolean;
    to_location_id: string | null;
  }>;
  /** The `Ways` layer bar pill (#868). On by default — a door is structural,
   *  not DM ink, the way a zone is. */
  showWays?: boolean;
  /** Bound spaces that are themselves a nested site rather than a room
   *  (#818) — clicking one descends into it instead of pushing to its
   *  sheet. Derived by `LocationMap.vue` from the same `spaces` prop that
   *  feeds `SiteMapRegionList`. */
  nestedSiteIds?: ReadonlySet<string>;
  /** The DM's own site-fog hint (#884 S11) — drawn over the plan rather
   *  than beside it as a second `PlayerSitePlan`. Each entry is one
   *  unexplored space's own traced cells; `SiteRunSurface` builds this off
   *  `siteFog.ts`'s `buildDmFogPlan` (its `.glimpsed`). Off by default —
   *  only the run surface's Fog toggle turns it on. */
  showFog?: boolean;
  fogGlimpsedCells?: readonly (readonly CellKey[])[];
}>();

const emit = defineEmits<{
  "move-party": [roomId: string];
  /** A bound space is a nested site (#818) — `LocationMap.vue`'s caller
   *  decides what "descend" means (the Atlas pane re-centres, the sheet
   *  navigates); this layer only knows it isn't a plain room push. */
  descend: [spaceId: string];
  /** The region under the pointer changed — including to `null` on leaving
   *  it. Fired on hover, not on click; used for a caption chip. */
  "hover-region": [regionId: string | null];
}>();

const router = useRouter();

const canvasEl = ref<HTMLCanvasElement | null>(null);

// ── Interaction ──────────────────────────────────────────────────────────
// `useRegionNavPointer` owns hover and click routing (tap-vs-drag, select
// an unbound shape, navigate/descend, move the party in run mode) — the
// only gestures this read-only surface has.

function cellAt(clientX: number, clientY: number): CellKey | null {
  const cal = calibration;
  if (!cal || imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null;
  const frac = toImageFraction(clientX, clientY);
  return frac ? cellAtImageFraction(frac.x, frac.y, cal, imageNaturalWidth, imageNaturalHeight) : null;
}
function regionAt(cell: CellKey): LocationMapRegion | null {
  return regions.find((r) => r.region_role === "space" && r.cells.includes(cell)) ?? null;
}
function hoverRegionAt(cell: CellKey): LocationMapRegion | null {
  const zone = regions.find((r) => r.region_role === "zone" && r.cells.includes(cell));
  return zone ?? regions.find((r) => r.region_role === "space" && r.cells.includes(cell)) ?? null;
}

// The nested-site case (#818) is `onDescend` in `pointerOptions` below
// instead — `useRegionNavPointer` picks between the two via `isNestedSite`.
function onNavigate(spaceId: string): void {
  router.push(`/locations/${spaceId}`);
}

const pointerOptions: UseRegionNavPointerOptions = {
  cellAt,
  mode: () => mode,
  regionAt,
  hoverRegionAt,
  onSelect: () => {},
  onNavigate,
  onDescend: (spaceId) => emit("descend", spaceId),
  onMoveParty: (roomId) => emit("move-party", roomId),
  isReachable: (roomId) => !reachableRoomIds || reachableRoomIds.has(roomId),
  isNestedSite: (spaceId) => nestedSiteIds.has(spaceId),
  onHover: (regionId) => emit("hover-region", regionId),
};

const pointer = useRegionNavPointer(pointerOptions);

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

  /** A door bar's endpoint (grid-point space) to this canvas's own pixels. */
  function pointToCanvas(point: GridPoint): { x: number; y: number } {
    return gridPointToCanvas(point, cal!, w, h, canvas!.width, canvas!.height);
  }

  if (showGrid) drawGridPass(ctx, geometry);

  if (showSpaces) {
    drawSpacesPass(
      ctx,
      geometry,
      regions,
      { mode, activeRegionId: null, partyRoomId, reachableRoomIds, roomState },
      pointToCanvas,
      undefined,
    );
  }

  // Doors on the plan (#868, frame 03) — a bar across the door's own cell
  // edge, drawn over the space fill so it reads as a gap in the wall.
  if (showWays) drawWaysPass(ctx, geometry, ways, pointToCanvas);

  // Zones paint above spaces — a room is a floor to stand on, a zone is an
  // overlay ON that floor (water, ash, darkness) — and always dashed, so a
  // zone reads as an area effect rather than a second, competing room shape.
  if (showZones) drawZonesPass(ctx, geometry, regions, null, dpr, undefined);

  // The DM's own site-fog hint (#884 S11) — drawn last, over everything
  // else, so it reads as a shade over the plan rather than under it.
  if (showFog && fogGlimpsedCells.length > 0) drawFogPass(ctx, geometry, fogGlimpsedCells);
}

watch(
  [
    () => regions,
    () => calibration,
    () => imageNaturalWidth,
    () => imageNaturalHeight,
    () => mode,
    () => partyRoomId,
    () => reachableRoomIds,
    () => roomState,
    () => showSpaces,
    () => showZones,
    () => showGrid,
    () => ways,
    () => showWays,
    () => showFog,
    () => fogGlimpsedCells,
  ],
  () => renderOverlay(),
  { flush: "post", immediate: true },
);
</script>
