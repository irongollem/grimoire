<template>
  <canvas
    v-if="calibration"
    ref="canvasEl"
    class="absolute inset-0 h-full w-full"
    :class="mode === 'browse' && activeRegionId ? 'cursor-crosshair' : 'cursor-pointer'"
    @pointerdown="onPointerDown"
    @pointermove="onCanvasHoverMove"
    @pointerleave="onCanvasHoverLeave"
    @dblclick="onCanvasDoubleClick"
  />
</template>

<script setup lang="ts">
/**
 * The region overlay — a sibling of `MapPinsLayer` inside `MapFrame`'s slot,
 * so it inherits zoom/pan the same way pins and the image do. Moved out of
 * `SiteMapView.vue` (#807), which drew this same canvas in its own unzoomed
 * wrapper; the geometry (grid lines, cell rects, drag-to-paint) is carried
 * over unchanged from that component, only the coordinate source and mount
 * point differ — see `cellFromEvent` below.
 *
 * Deliberately no TanStack import for reads: `regions`/`calibration` arrive
 * as props from the composite (`LocationMap.vue`), which is what lets this
 * component stay a pure renderer + interaction layer, like `MapPinsLayer`.
 * It does own the one write that belongs to a canvas gesture rather than a
 * list button — committing a drag stroke's cells — the same split
 * `SiteMapRegionList.vue` already draws for bind/unbind/label/delete.
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useUpdateLocationMapRegion } from "@/composables/locations/useLocationMapRegions";
import {
  canvasToGridPoint,
  deleteRingVertex,
  gridPointToCanvas,
  insertRingVertex,
  isNearFirstNode,
  moveRingVertex,
  useRegionPen,
  useTemplateShape,
} from "@/composables/locations/useRegionPen";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useUiStore } from "@/stores/ui";
import { cellAtImageFraction } from "@/lib/locations/gridCalibration";
import { cellsInsideRing, nearestEdge, nearestVertex, snapPoint, templateCells, templateRing } from "@/lib/locations/polygon";
import {
  drawGridPass,
  drawPenOverlay,
  drawSpacesPass,
  drawTemplatePreview,
  drawWaysPass,
  drawZonesPass,
  type RenderGeometry,
} from "@/lib/locations/planCanvas";
import { isCellOnImageGrid, toggleCell } from "@/lib/locations/siteMap";
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
const templateShape = useTemplateShape();
const pen = useRegionPen();

const canvasEl = ref<HTMLCanvasElement | null>(null);

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  resizeObserver = new ResizeObserver(() => renderOverlay());
  window.addEventListener("keydown", onKeyDown);
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("keydown", onKeyDown);
});
// The canvas is sized in CSS to exactly cover the rendered image box, so
// observing the canvas itself is sufficient to catch every resize that would
// move it out of alignment.
watch(canvasEl, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) resizeObserver?.observe(el);
});

/** An in-flight drag stroke (#805 slice 2, carried over from `SiteMapView`).
 *  Kept outside Vue's reactivity — mutated by a pointer handler and read back
 *  by an explicit `renderOverlay()` call in that same handler, every time. */
interface Stroke {
  regionId: string;
  mode: "paint" | "erase";
  cells: CellKey[];
}
let stroke: Stroke | null = null;

/** An in-flight node drag on a pen ring — the draft ring while it's still
 *  unsaved, or a persisted region's `vertices` once it's closed. Mirrors
 *  `Stroke` above: mutated by a pointer handler, read back by an explicit
 *  `renderOverlay()` call in that same handler. */
interface PenDrag {
  regionId: string;
  persisted: boolean;
  index: number;
}
let penDrag: PenDrag | null = null;
const liveDragRing = ref<GridPoint[] | null>(null);

/** The site this drag's eventual template region belongs to — captured at
 *  pointerdown since the drag itself only knows shape/centre/radius. */
let templateDragRegionId: string | null = null;

/** True while a pointerdown handler is mid-`await` (a confirm dialog, a
 *  mutation) with no `stroke`/`penDrag`/`templateDrag` yet set to show for
 *  it. The corresponding `pointerup` can arrive before that await resolves
 *  — a real click's down/up pair is not guaranteed to straddle a network
 *  round trip — and without this flag `onWindowPointerUp` would read no
 *  gesture in flight and misread the release as a plain tap-click. */
let pendingAsyncGesture = false;

/** The cursor's current grid point while the pen tool is armed, snapped the
 *  same way a click would be — drives the rubber-band and the first-node
 *  gold highlight (frame 12). `null` whenever the cursor isn't over the
 *  canvas or the pen tool isn't the one in play. */
const penHoverPoint = ref<GridPoint | null>(null);

/** How many grid units a click may miss a node/edge by and still hit it —
 *  generous enough for a coarse pointer, small enough not to swallow
 *  clicks meant for a neighbouring vertex on a tightly-traced ring. */
const SNAP_HIT_RADIUS_CELLS = 0.4;
const NODE_SIZE_PX = 9;

/** The cells a finished stroke committed, drawn in place of the server's copy
 *  until the refetch carries them back — see `SiteMapView`'s original
 *  docstring for why (`useUpdateLocationMapRegion` invalidates rather than
 *  writing through, so the cache is stale by exactly one fetch). */
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

/** The cells a finished stroke committed, or a pending region's own stored
 *  cells — one map, keyed by region id, fed to both the space and zone
 *  passes so an active trace never disagrees with itself depending on which
 *  layer it belongs to. Built once per frame rather than per-region, since
 *  at most one region is ever mid-stroke or mid-refetch-lag at a time. */
function cellsOverride(): ReadonlyMap<string, readonly CellKey[]> | undefined {
  const overrides = new Map<string, readonly CellKey[]>();
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
      const dragging = penDrag && penDrag.regionId === region.id ? liveDragRing.value : null;
      const ring = dragging ?? (persisted ? region.vertices! : pen.draftRing.value);
      drawPenOverlay(ctx, pointToCanvas, ring, persisted, penHoverPoint.value, NODE_SIZE_PX, SNAP_HIT_RADIUS_CELLS);
    }
  }

  // ── Template preview (#868, frame 12: "dropped in one drag") ─────────────
  if (mode === "browse" && tool.value === "template" && pen.templateDrag.value && pen.templateDrag.value.radius > 0) {
    const { shape, center, radius } = pen.templateDrag.value;
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
    () => pen.draftRing.value,
    () => pen.templateDrag.value,
    penHoverPoint,
    () => liveDragRing.value,
  ],
  () => renderOverlay(),
  { flush: "post", immediate: true },
);

// ── Interaction ───────────────────────────────────────────────────────────────

/** The map cell under a pointer event, in image-fraction space via the
 *  frame's own `toImageFraction` — the exact inverse of how the overlay
 *  draws a cell's rect back onto that same box. Null before an image has
 *  loaded, or when there is nothing calibrated to resolve against. */
function cellFromEvent(e: PointerEvent): CellKey | null {
  const cal = calibration;
  if (!cal || imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null;
  const frac = toImageFraction(e.clientX, e.clientY);
  if (!frac) return null;
  return cellAtImageFraction(frac.x, frac.y, cal, imageNaturalWidth, imageNaturalHeight);
}

/** The same event, as a continuous grid point rather than a whole cell — what
 *  the pen and template tools place their vertices/centres at. Unsnapped;
 *  callers run it through `snapPoint` (or `Math.round` for a template
 *  centre) themselves. */
function gridPointFromEvent(e: { clientX: number; clientY: number }): GridPoint | null {
  const cal = calibration;
  const canvas = canvasEl.value;
  if (!cal || !canvas || imageNaturalWidth <= 0 || imageNaturalHeight <= 0) return null;
  const frac = toImageFraction(e.clientX, e.clientY);
  if (!frac) return null;
  return canvasToGridPoint(
    frac.x * canvas.width,
    frac.y * canvas.height,
    cal,
    imageNaturalWidth,
    imageNaturalHeight,
    canvas.width,
    canvas.height,
  );
}

// ── Hover (#868) ──────────────────────────────────────────────────────────────
// Plain mouse movement, not a gesture — a separate template listener rather
// than folded into the window-level drag tracking above, so it keeps working
// whether or not a pointer is down. Suppressed mid-stroke: the window
// handler already owns the pointer for the duration of a paint, and hovering
// would otherwise report whatever's under the cursor as it drags across
// several regions rather than the one actually being painted.
let lastHoverRegionId: string | null = null;

function regionAtEvent(e: PointerEvent): LocationMapRegion | null {
  const key = cellFromEvent(e);
  if (!key) return null;
  // Zones paint above spaces (see `renderOverlay`), so hover follows the
  // same stacking: whatever the DM would actually see under the cursor wins.
  return (
    regions.find((r) => r.region_role === "zone" && r.cells.includes(key)) ??
    regions.find((r) => r.region_role === "space" && r.cells.includes(key)) ??
    null
  );
}

function onCanvasHoverMove(e: PointerEvent): void {
  if (stroke) return;

  // The pen tool's own cursor tracking (rubber-band + first-node gold
  // highlight) — kept in step with whatever the next click would snap to.
  if (mode === "browse" && tool.value === "pen" && activeRegionId.value) {
    const gp = gridPointFromEvent(e);
    penHoverPoint.value = gp ? snapPoint(gp[0], gp[1], e.altKey ? "half" : "intersection") : null;
  } else if (penHoverPoint.value !== null) {
    penHoverPoint.value = null;
  }

  const id = regionAtEvent(e)?.id ?? null;
  if (id === lastHoverRegionId) return;
  lastHoverRegionId = id;
  emit("hover-region", id);
}

function onCanvasHoverLeave(): void {
  penHoverPoint.value = null;
  if (lastHoverRegionId === null) return;
  lastHoverRegionId = null;
  emit("hover-region", null);
}

/**
 * Pointer tracking lives on `window`, not on the canvas's own template
 * bindings — the same idiom `MapPinsLayer`'s drag-to-reposition uses to
 * survive `MapFrame`'s `setPointerCapture`. The frame captures the pointer
 * to itself on every pointerdown it doesn't recognise as `placing`, which
 * retargets subsequent pointermove/pointerup away from any descendant's own
 * listeners — but not away from `window`, which every retargeted event still
 * bubbles through. This needs nothing new from the frame: unlike pin
 * placement, painting a region never needs to suppress the frame's own
 * pan/pinch handling, it just needs to keep tracking regardless of it.
 */
let pointerDownAt: { x: number; y: number } | null = null;
let movedBeyondTapThreshold = false;

/** Converting a pen-traced region to painted cells is one-way and lossy (the
 *  diagonal is gone once `vertices` is null), so it is confirmed once here
 *  rather than silently on the first paint stroke (#868 Build step 2). Keeps
 *  the same cell set — only `vertices` drops — so the stroke that follows
 *  starts from exactly what the DM was already looking at. */
async function handlePaintPointerDown(e: PointerEvent, region: LocationMapRegion, cal: GridCalibration): Promise<void> {
  const key = cellFromEvent(e);
  if (!key || !isCellOnImageGrid(key, cal, imageNaturalWidth, imageNaturalHeight)) return;

  if (region.vertices !== null) {
    pendingAsyncGesture = true;
    try {
      const ok = await confirm(
        "Painting converts this pen-traced shape to cells — the diagonal edges are lost. Continue?",
        { danger: true },
      );
      if (!ok) return;
      await updateRegion.mutateAsync({ id: region.id, update: { vertices: null, cells: region.cells } });
    } catch (err) {
      toastError(fromError(err));
      return;
    } finally {
      pendingAsyncGesture = false;
    }
  }

  stroke = { regionId: region.id, mode: region.cells.includes(key) ? "erase" : "paint", cells: toggleCell(region.cells, key) };
  renderOverlay();
}

/** Writes a ring edit through to the region it belongs to — used by every
 *  pen gesture that touches an already-*persisted* ring (move/delete/insert;
 *  closing a fresh draft is its own call, since that one also introduces
 *  `vertices` for the first time). `cells` is always re-derived alongside,
 *  so the two never drift apart in storage. */
async function commitRingChange(regionId: string, ring: GridPoint[]): Promise<void> {
  try {
    await updateRegion.mutateAsync({ id: regionId, update: { vertices: ring, cells: cellsInsideRing(ring) } });
  } catch (err) {
    toastError(fromError(err));
  }
}

/**
 * The pen tool (#868, frame 12). A region with `vertices === null` is still
 * an unsaved draft — clicks build `pen.draftRing` locally and nothing is
 * written until the first node closes it. Once `vertices` exists, every
 * further edit (drag/delete/insert) commits immediately; there is no
 * separate edit mode, so a plain click elsewhere on an already-closed ring
 * does nothing — the only sanctioned way to grow a closed ring is the
 * double-click-an-edge gesture (`onCanvasDoubleClick`).
 */
async function handlePenPointerDown(e: PointerEvent, region: LocationMapRegion): Promise<void> {
  const gridPt = gridPointFromEvent(e);
  if (!gridPt) return;
  const persisted = region.vertices !== null;
  const ring = persisted ? region.vertices! : pen.draftRing.value;

  const hitIndex = nearestVertex(ring, gridPt[0], gridPt[1], SNAP_HIT_RADIUS_CELLS);

  if (hitIndex !== null && e.altKey) {
    if (persisted) {
      pendingAsyncGesture = true;
      try {
        await commitRingChange(region.id, deleteRingVertex(ring, hitIndex));
      } finally {
        pendingAsyncGesture = false;
      }
    } else {
      pen.draftRing.value = deleteRingVertex(ring, hitIndex);
    }
    renderOverlay();
    return;
  }

  if (!persisted && hitIndex === 0 && isNearFirstNode(ring, gridPt[0], gridPt[1], SNAP_HIT_RADIUS_CELLS)) {
    const closed = pen.close();
    if (closed) {
      pendingAsyncGesture = true;
      try {
        await updateRegion.mutateAsync({ id: region.id, update: { vertices: closed, cells: cellsInsideRing(closed) } });
      } catch (err) {
        pen.draftRing.value = closed; // nothing lost — the ring goes back to being a draft
        toastError(fromError(err));
      } finally {
        pendingAsyncGesture = false;
      }
    }
    renderOverlay();
    return;
  }

  if (hitIndex !== null) {
    penDrag = { regionId: region.id, persisted, index: hitIndex };
    liveDragRing.value = [...ring];
    return;
  }

  if (persisted) return; // adding a node mid-ring is the double-click-edge gesture only

  const snapped = snapPoint(gridPt[0], gridPt[1], e.altKey ? "half" : "intersection");
  pen.addPoint(snapped);
  renderOverlay();
}

/** The template tool (#868, frame 12: "click a centre, drag a radius,
 *  done."). The centre snaps to a whole cell index — templates are defined
 *  on integer centres the same way `cellsForTemplate` already requires. */
function handleTemplatePointerDown(e: PointerEvent, region: LocationMapRegion): void {
  const gridPt = gridPointFromEvent(e);
  if (!gridPt) return;
  templateDragRegionId = region.id;
  pen.startTemplate(templateShape.value, [Math.round(gridPt[0]), Math.round(gridPt[1])]);
  renderOverlay();
}

function onPointerDown(e: PointerEvent): void {
  pointerDownAt = { x: e.clientX, y: e.clientY };
  movedBeyondTapThreshold = false;

  // Listeners attach synchronously, before any of the branches below touch
  // the network — `handlePaintPointerDown` and `handlePenPointerDown` both
  // `await` a mutation partway through (the conversion confirm, the ring
  // close). A real click's `pointerup` can arrive before that await
  // resolves, and this function returning a pending promise doesn't delay
  // the browser's own event dispatch — so registering the listeners after
  // the `await` risked losing that pointerup entirely, leaving the next
  // gesture reading a stale `pointerDownAt`.
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp, { once: true });

  if (mode === "browse" && activeRegionId.value) {
    const region = regions.find((r) => r.id === activeRegionId.value);
    const cal = calibration;
    if (region && cal) {
      if (tool.value === "paint") void handlePaintPointerDown(e, region, cal);
      else if (tool.value === "pen") void handlePenPointerDown(e, region);
      else if (tool.value === "template") handleTemplatePointerDown(e, region);
    }
  }
}

function onWindowPointerMove(e: PointerEvent): void {
  if (!pointerDownAt) return;
  if (Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y) > 6) {
    movedBeyondTapThreshold = true;
  }

  if (stroke) {
    const cal = calibration;
    if (!cal) return;
    const key = cellFromEvent(e);
    if (!key || !isCellOnImageGrid(key, cal, imageNaturalWidth, imageNaturalHeight)) return;
    const alreadyInStrokeDirection = stroke.mode === "paint" ? stroke.cells.includes(key) : !stroke.cells.includes(key);
    if (alreadyInStrokeDirection) return;
    stroke.cells = toggleCell(stroke.cells, key);
    renderOverlay();
    return;
  }

  if (penDrag) {
    const gp = gridPointFromEvent(e);
    if (!gp || !liveDragRing.value) return;
    const snapped = snapPoint(gp[0], gp[1], e.altKey ? "half" : "intersection");
    liveDragRing.value = moveRingVertex(liveDragRing.value, penDrag.index, snapped);
    renderOverlay();
    return;
  }

  if (pen.templateDrag.value) {
    const gp = gridPointFromEvent(e);
    if (gp) pen.dragTemplate(gp);
    renderOverlay();
  }
}

/** Commits whichever gesture was in flight — a paint stroke, a pen node drag,
 *  or a template drop — or, when none started, resolves a plain, unmoved tap
 *  into a click on whatever region is under it. */
function onWindowPointerUp(e: PointerEvent): void {
  window.removeEventListener("pointermove", onWindowPointerMove);
  pointerDownAt = null;

  if (stroke) {
    const { regionId, cells } = stroke;
    stroke = null;
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
    renderOverlay();
    return;
  }

  if (penDrag) {
    const drag = penDrag;
    const final = liveDragRing.value;
    penDrag = null;
    liveDragRing.value = null;
    if (final) {
      if (drag.persisted) void commitRingChange(drag.regionId, final);
      else pen.draftRing.value = final;
    }
    renderOverlay();
    return;
  }

  if (pen.templateDrag.value) {
    const regionId = templateDragRegionId;
    const final = pen.endTemplate();
    templateDragRegionId = null;
    if (final && final.radius > 0 && regionId) {
      const ring = templateRing(final.shape, final.center, final.radius);
      const cells = templateCells(final.shape, final.center, final.radius);
      updateRegion.mutate({ id: regionId, update: { vertices: ring, cells } }, { onError: (err) => toastError(fromError(err)) });
    }
    renderOverlay();
    return;
  }

  if (movedBeyondTapThreshold || pendingAsyncGesture) return;
  handleClick(e);
}

/** Double-click an edge inserts a node there (frame 12) — only meaningful on
 *  the pen tool's own ring, draft or persisted alike. */
function onCanvasDoubleClick(e: MouseEvent): void {
  if (mode !== "browse" || tool.value !== "pen" || !activeRegionId.value) return;
  const region = regions.find((r) => r.id === activeRegionId.value);
  if (!region) return;
  const gridPt = gridPointFromEvent(e);
  if (!gridPt) return;

  const persisted = region.vertices !== null;
  const ring = persisted ? region.vertices! : pen.draftRing.value;
  const found = nearestEdge(ring, gridPt[0], gridPt[1], SNAP_HIT_RADIUS_CELLS);
  if (!found) return;

  const next = insertRingVertex(ring, found.index, found.point);
  if (persisted) void commitRingChange(region.id, next);
  else pen.draftRing.value = next;
  renderOverlay();
}

/** `Escape` abandons an unsaved pen draft (frame 12) — a no-op once the ring
 *  has already been persisted, since there is nothing left to abandon. */
function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  if (mode !== "browse" || tool.value !== "pen" || !activeRegionId.value) return;
  const region = regions.find((r) => r.id === activeRegionId.value);
  if (!region || region.vertices !== null || pen.draftRing.value.length === 0) return;
  pen.abandon();
  renderOverlay();
}

/** Pushes to a bound space's sheet, or — when it's a nested site rather
 *  than a room (#818) — emits `descend` instead, so the caller can navigate
 *  the way it already navigates a pin (a re-centred Atlas pane, not a
 *  route push) rather than this layer assuming what "descend" means. */
function goToSpace(spaceId: string): void {
  if (nestedSiteIds.has(spaceId)) emit("descend", spaceId);
  else router.push(`/locations/${spaceId}`);
}

/**
 * Everything that isn't painting: selecting an unbound shape to trace,
 * navigating to a bound room's sheet, or — in run mode — moving the party.
 *
 * Zones are excluded from the search on purpose: they bind to nothing, so a
 * click can only ever mean something for the space underneath one, and a
 * DM's tap on an overlapping zone+space cell would otherwise resolve
 * unpredictably depending on array order. Zones are only ever traced —
 * selected for it from `SiteMapZoneList`'s Draw/Trace buttons, never from a
 * plain tap on the map.
 */
function handleClick(e: PointerEvent): void {
  if (mode === "browse" && activeRegionId.value) return;
  const key = cellFromEvent(e);
  if (!key) return;
  const found = regions.find((r) => r.region_role === "space" && r.cells.includes(key));
  if (!found) return;

  if (!found.space_location_id) {
    if (mode === "browse") activeRegionId.value = found.id;
    return;
  }

  if (mode === "run") {
    if (!reachableRoomIds || reachableRoomIds.has(found.space_location_id)) {
      emit("move-party", found.space_location_id);
    } else {
      goToSpace(found.space_location_id);
    }
    return;
  }

  goToSpace(found.space_location_id);
}

onUnmounted(() => {
  window.removeEventListener("pointermove", onWindowPointerMove);
  window.removeEventListener("pointerup", onWindowPointerUp);
});
</script>
