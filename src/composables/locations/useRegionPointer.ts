// The pointer/gesture state machine `MapRegionsLayer.vue` drove inline until
// it crossed the 600-line soft cap (#868 wave 3). Everything here is *how a
// gesture unfolds* — paint stroke, pen node, template drag, tap-vs-drag,
// hover — never *what a gesture means to the app*: every effect (write a
// cell set, navigate, select, move the party) is a callback the component
// supplies via `options`, so this module never touches `regions`, routing,
// toasts or the mutation composable directly. That split is also why the
// window-level pointermove/pointerup idiom moves here unchanged: `MapFrame`
// calls `setPointerCapture` on its own root and would retarget listeners
// bound to the canvas itself, but every retargeted event still bubbles
// through `window` (see the docstring on `onPointerDown` below).
//
// `useRegionPen` (the draft-ring/template reducers) is owned internally
// rather than threaded through `options` — it's pure gesture state with no
// host dependency, the same reason `useTemplateShape`'s singleton is read
// here directly rather than passed in.

import { onMounted, ref, type Ref } from "vue";
import {
  deleteRingVertex,
  insertRingVertex,
  isNearFirstNode,
  moveRingVertex,
  useRegionPen,
  useTemplateShape,
  type TemplateDragState,
} from "@/composables/locations/useRegionPen";
import { nearestEdge, nearestVertex, snapPoint, templateCells, templateRing } from "@/lib/locations/polygon";
import { toggleCell } from "@/lib/locations/siteMap";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";

/** How many grid units a click may miss a node/edge by and still hit it —
 *  moved from `MapRegionsLayer.vue` unchanged; only the hit-testing gestures
 *  that live here need it now. */
const SNAP_HIT_RADIUS_CELLS = 0.4;

/** A live node drag on a *persisted* ring, keyed by the region it belongs
 *  to. The key exists only to reproduce a narrow edge case exactly: a pen
 *  drag can only ever start on the currently active region, but nothing
 *  stops `activeRegionId` changing mid-drag (a keyboard shortcut, say), and
 *  the original component only ever showed the live ring under the region
 *  it actually belongs to — never under whatever became active meanwhile. */
export interface LiveDrag {
  regionId: string;
  ring: GridPoint[];
}

export interface UseRegionPointerOptions {
  /** The map cell under an event's client coordinates — the general lookup
   *  hover and click routing use. No grid-bound filtering: a cell that
   *  isn't actually laid across the image simply matches no region's
   *  `cells`, which is why only painting needs `isPaintable` below. */
  cellAt(clientX: number, clientY: number): CellKey | null;
  /** Whether a cell `cellAt` resolved is one of the whole cells the
   *  calibration actually lays across the image — painting's own
   *  addressability guard (`isCellOnImageGrid`). */
  isPaintable(cell: CellKey): boolean;
  /** The same event as a continuous, unsnapped grid point (pen/template
   *  space) — callers here snap it themselves via the pure `snapPoint`. */
  gridPointAt(clientX: number, clientY: number): GridPoint | null;
  /** The region named by `activeRegionId`, or `null` if there is none or it
   *  no longer resolves. */
  activeRegion(): LocationMapRegion | null;
  /** Whether an active region id is set at all — distinct from
   *  `activeRegion()` returning non-null: a click while a (possibly
   *  dangling) selection exists is still "already tracing something",
   *  never a fresh selection. */
  hasActiveRegionId(): boolean;
  tool(): "paint" | "pen" | "template";
  mode(): "browse" | "run";
  /** The bound *space* at a cell, for click routing. Zones are excluded on
   *  purpose — see `MapRegionsLayer`'s own `handleClick` docstring: a click
   *  can only ever mean something for the space underneath a zone, never
   *  the zone itself. */
  regionAt(cell: CellKey): LocationMapRegion | null;
  /** The topmost region at a cell, for hover. Zones paint above spaces, so
   *  hover follows the same stacking a DM actually sees. */
  hoverRegionAt(cell: CellKey): LocationMapRegion | null;
  /** Fire-and-forget: write a finished paint stroke's cells. */
  commitCells(regionId: string, cells: CellKey[]): void;
  /** Write a pen-ring edit (drag/delete/insert, or a closing draft). Must
   *  reject on failure — the draft-close gesture needs that signal to put
   *  its ring back; every other call site swallows it, since the host has
   *  already toasted. */
  commitRing(regionId: string, ring: GridPoint[]): Promise<void>;
  /** Write a finished template drop. Kept separate from `commitRing`
   *  because a template's cell fill (`templateCells`) is its own algorithm,
   *  not the generic ring-fill `commitRing`'s host uses for a pen shape. */
  commitTemplate(regionId: string, ring: GridPoint[], cells: CellKey[]): void;
  /** Confirms, and performs, the one-way vertices→cells conversion a paint
   *  stroke needs before it can start on a pen-traced region. `false` on
   *  cancel or failure (already toasted). */
  confirmConvert(region: LocationMapRegion): Promise<boolean>;
  onSelect(regionId: string): void;
  onNavigate(spaceId: string): void;
  onDescend(spaceId: string): void;
  onMoveParty(roomId: string): void;
  isReachable(roomId: string): boolean;
  /** Whether a bound space is itself a nested site (#818) rather than a
   *  room — decides `onDescend` vs. `onNavigate`. */
  isNestedSite(spaceId: string): boolean;
  onHover(regionId: string | null): void;
}

export interface UseRegionPointerReturn {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerLeave: () => void;
  onDoubleClick: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  /** The in-progress paint stroke's cells, `null` between strokes — the
   *  transient half of the render override; the host merges it with its own
   *  `pendingStroke` (the after-commit-before-refetch half), since only the
   *  host can compare a stroke's cells against the live `regions` prop. */
  strokeCells: Ref<{ regionId: string; cells: CellKey[] } | null>;
  /** The pen tool's unsaved ring, from the `useRegionPen` instance this
   *  composable owns. */
  draftRing: Ref<GridPoint[]>;
  templateDraft: Ref<TemplateDragState | null>;
  liveDrag: Ref<LiveDrag | null>;
  /** The pen tool's cursor-tracking point (rubber-band + first-node gold
   *  highlight) — `null` off-canvas or off the pen tool. */
  penHoverPoint: Ref<GridPoint | null>;
  /** Detaches the `window` listeners a gesture may have left attached and
   *  the mount-lifetime `keydown` listener. The host calls this from its own
   *  `onUnmounted` (which already removes its resize observer there), the
   *  same place the original component's cleanup always ran. */
  dispose: () => void;
}

export function useRegionPointer(options: UseRegionPointerOptions): UseRegionPointerReturn {
  const pen = useRegionPen();
  const templateShape = useTemplateShape();

  const strokeCells = ref<{ regionId: string; cells: CellKey[] } | null>(null) as Ref<{
    regionId: string;
    cells: CellKey[];
  } | null>;
  let strokeMode: "paint" | "erase" | null = null;

  const liveDrag = ref<LiveDrag | null>(null) as Ref<LiveDrag | null>;
  /** Mirrors `liveDrag` but also remembers whether the ring it's dragging
   *  was already persisted — only known at drag start, and only needed at
   *  drag end to decide `commitRing` vs. handing the result back to the
   *  draft. Not reactive: nothing renders off it directly. */
  let penDrag: { regionId: string; persisted: boolean; index: number } | null = null;

  /** The site this drag's eventual template region belongs to — captured at
   *  pointerdown since the drag itself only knows shape/centre/radius. */
  let templateDragRegionId: string | null = null;

  const penHoverPoint = ref<GridPoint | null>(null) as Ref<GridPoint | null>;

  /**
   * Pointer tracking lives on `window`, not on the canvas's own template
   * bindings — the idiom `MapPinsLayer`'s drag-to-reposition also uses to
   * survive `MapFrame`'s `setPointerCapture`. The frame captures the
   * pointer to itself on every pointerdown it doesn't recognise as
   * `placing`, which retargets subsequent pointermove/pointerup away from
   * any descendant's own listeners — but not away from `window`, which
   * every retargeted event still bubbles through.
   */
  let pointerDownAt: { x: number; y: number } | null = null;
  let movedBeyondTapThreshold = false;

  /** True while a pointerdown handler is mid-`await` (a confirm dialog, a
   *  mutation) with no `strokeCells`/`penDrag`/`templateDrag` yet set to
   *  show for it. The corresponding `pointerup` can arrive before that
   *  await resolves — a real click's down/up pair is not guaranteed to
   *  straddle a network round trip — and without this flag `onWindowPointerUp`
   *  would read no gesture in flight and misread the release as a plain
   *  tap-click. */
  let pendingAsyncGesture = false;

  let lastHoverRegionId: string | null = null;

  function goToSpace(spaceId: string): void {
    if (options.isNestedSite(spaceId)) options.onDescend(spaceId);
    else options.onNavigate(spaceId);
  }

  /**
   * Everything that isn't painting: selecting an unbound shape to trace,
   * navigating to a bound room's sheet, or — in run mode — moving the
   * party.
   *
   * Zones are excluded from `regionAt` on purpose: they bind to nothing, so
   * a click can only ever mean something for the space underneath one, and
   * a DM's tap on an overlapping zone+space cell would otherwise resolve
   * unpredictably depending on array order. Zones are only ever traced —
   * selected for it from `SiteMapZoneList`'s Draw/Trace buttons, never from
   * a plain tap on the map.
   */
  function handleClick(e: PointerEvent): void {
    if (options.mode() === "browse" && options.hasActiveRegionId()) return;
    const key = options.cellAt(e.clientX, e.clientY);
    if (!key) return;
    const found = options.regionAt(key);
    if (!found) return;

    if (!found.space_location_id) {
      if (options.mode() === "browse") options.onSelect(found.id);
      return;
    }

    if (options.mode() === "run") {
      if (options.isReachable(found.space_location_id)) {
        options.onMoveParty(found.space_location_id);
      } else {
        goToSpace(found.space_location_id);
      }
      return;
    }

    goToSpace(found.space_location_id);
  }

  /** Converting a pen-traced region to painted cells is one-way and lossy
   *  (the diagonal is gone once `vertices` is null), so it's confirmed once
   *  here rather than silently on the first paint stroke (#868 Build step
   *  2). Keeps the same cell set — only `vertices` drops — so the stroke
   *  that follows starts from exactly what the DM was already looking at. */
  async function handlePaintPointerDown(e: PointerEvent, region: LocationMapRegion): Promise<void> {
    const key = options.cellAt(e.clientX, e.clientY);
    if (!key || !options.isPaintable(key)) return;

    if (region.vertices !== null) {
      pendingAsyncGesture = true;
      try {
        const ok = await options.confirmConvert(region);
        if (!ok) return;
      } finally {
        pendingAsyncGesture = false;
      }
    }

    strokeMode = region.cells.includes(key) ? "erase" : "paint";
    strokeCells.value = { regionId: region.id, cells: toggleCell(region.cells, key) };
  }

  /**
   * The pen tool (#868, frame 12). A region with `vertices === null` is
   * still an unsaved draft — clicks build `pen.draftRing` locally and
   * nothing is written until the first node closes it. Once `vertices`
   * exists, every further edit (drag/delete/insert) commits immediately;
   * there is no separate edit mode, so a plain click elsewhere on an
   * already-closed ring does nothing — the only sanctioned way to grow a
   * closed ring is the double-click-an-edge gesture (`onDoubleClick`).
   */
  async function handlePenPointerDown(e: PointerEvent, region: LocationMapRegion): Promise<void> {
    const gridPt = options.gridPointAt(e.clientX, e.clientY);
    if (!gridPt) return;
    const persisted = region.vertices !== null;
    const ring = persisted ? region.vertices! : pen.draftRing.value;

    const hitIndex = nearestVertex(ring, gridPt[0], gridPt[1], SNAP_HIT_RADIUS_CELLS);

    if (hitIndex !== null && e.altKey) {
      if (persisted) {
        pendingAsyncGesture = true;
        try {
          await options.commitRing(region.id, deleteRingVertex(ring, hitIndex));
        } catch {
          // already toasted by the host; nothing to roll back for an edit
          // to an already-persisted ring
        } finally {
          pendingAsyncGesture = false;
        }
      } else {
        pen.draftRing.value = deleteRingVertex(ring, hitIndex);
      }
      return;
    }

    if (!persisted && hitIndex === 0 && isNearFirstNode(ring, gridPt[0], gridPt[1], SNAP_HIT_RADIUS_CELLS)) {
      const closed = pen.close();
      if (closed) {
        pendingAsyncGesture = true;
        try {
          await options.commitRing(region.id, closed);
        } catch {
          pen.draftRing.value = closed; // nothing lost — the ring goes back to being a draft
        } finally {
          pendingAsyncGesture = false;
        }
      }
      return;
    }

    if (hitIndex !== null) {
      penDrag = { regionId: region.id, persisted, index: hitIndex };
      liveDrag.value = { regionId: region.id, ring: [...ring] };
      return;
    }

    if (persisted) return; // adding a node mid-ring is the double-click-edge gesture only

    const snapped = snapPoint(gridPt[0], gridPt[1], e.altKey ? "half" : "intersection");
    pen.addPoint(snapped);
  }

  /** The template tool (#868, frame 12: "click a centre, drag a radius,
   *  done."). The centre snaps to a whole cell index — templates are
   *  defined on integer centres the same way `cellsForTemplate` already
   *  requires. */
  function handleTemplatePointerDown(e: PointerEvent, region: LocationMapRegion): void {
    const gridPt = options.gridPointAt(e.clientX, e.clientY);
    if (!gridPt) return;
    templateDragRegionId = region.id;
    pen.startTemplate(templateShape.value, [Math.round(gridPt[0]), Math.round(gridPt[1])]);
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

    if (options.mode() === "browse") {
      const region = options.activeRegion();
      if (region) {
        const tool = options.tool();
        if (tool === "paint") void handlePaintPointerDown(e, region);
        else if (tool === "pen") void handlePenPointerDown(e, region);
        else if (tool === "template") handleTemplatePointerDown(e, region);
      }
    }
  }

  function onWindowPointerMove(e: PointerEvent): void {
    if (!pointerDownAt) return;
    if (Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y) > 6) {
      movedBeyondTapThreshold = true;
    }

    if (strokeCells.value) {
      const key = options.cellAt(e.clientX, e.clientY);
      if (!key || !options.isPaintable(key)) return;
      const current = strokeCells.value;
      const alreadyInStrokeDirection = strokeMode === "paint" ? current.cells.includes(key) : !current.cells.includes(key);
      if (alreadyInStrokeDirection) return;
      strokeCells.value = { regionId: current.regionId, cells: toggleCell(current.cells, key) };
      return;
    }

    if (penDrag) {
      const gp = options.gridPointAt(e.clientX, e.clientY);
      const current = liveDrag.value;
      if (!gp || !current) return;
      const snapped = snapPoint(gp[0], gp[1], e.altKey ? "half" : "intersection");
      liveDrag.value = { regionId: current.regionId, ring: moveRingVertex(current.ring, penDrag.index, snapped) };
      return;
    }

    if (pen.templateDrag.value) {
      const gp = options.gridPointAt(e.clientX, e.clientY);
      if (gp) pen.dragTemplate(gp);
    }
  }

  /** Commits whichever gesture was in flight — a paint stroke, a pen node
   *  drag, or a template drop — or, when none started, resolves a plain,
   *  unmoved tap into a click on whatever region is under it. */
  function onWindowPointerUp(e: PointerEvent): void {
    window.removeEventListener("pointermove", onWindowPointerMove);
    pointerDownAt = null;

    if (strokeCells.value) {
      const { regionId, cells } = strokeCells.value;
      strokeCells.value = null;
      strokeMode = null;
      options.commitCells(regionId, cells);
      return;
    }

    if (penDrag) {
      const drag = penDrag;
      const final = liveDrag.value?.ring ?? null;
      penDrag = null;
      liveDrag.value = null;
      if (final) {
        if (drag.persisted) void options.commitRing(drag.regionId, final).catch(() => {});
        else pen.draftRing.value = final;
      }
      return;
    }

    if (pen.templateDrag.value) {
      const regionId = templateDragRegionId;
      const final = pen.endTemplate();
      templateDragRegionId = null;
      if (final && final.radius > 0 && regionId) {
        const ring = templateRing(final.shape, final.center, final.radius);
        const cells = templateCells(final.shape, final.center, final.radius);
        options.commitTemplate(regionId, ring, cells);
      }
      return;
    }

    if (movedBeyondTapThreshold || pendingAsyncGesture) return;
    handleClick(e);
  }

  // ── Hover ───────────────────────────────────────────────────────────────
  // Plain mouse movement, not a gesture — suppressed mid-stroke: the window
  // handler above already owns the pointer for the duration of a paint, and
  // hovering would otherwise report whatever's under the cursor as it drags
  // across several regions rather than the one actually being painted.

  function onPointerMove(e: PointerEvent): void {
    if (strokeCells.value) return;

    // The pen tool's own cursor tracking (rubber-band + first-node gold
    // highlight) — kept in step with whatever the next click would snap to.
    if (options.mode() === "browse" && options.tool() === "pen" && options.activeRegion()) {
      const gp = options.gridPointAt(e.clientX, e.clientY);
      penHoverPoint.value = gp ? snapPoint(gp[0], gp[1], e.altKey ? "half" : "intersection") : null;
    } else if (penHoverPoint.value !== null) {
      penHoverPoint.value = null;
    }

    const key = options.cellAt(e.clientX, e.clientY);
    const id = key ? (options.hoverRegionAt(key)?.id ?? null) : null;
    if (id === lastHoverRegionId) return;
    lastHoverRegionId = id;
    options.onHover(id);
  }

  function onPointerLeave(): void {
    penHoverPoint.value = null;
    if (lastHoverRegionId === null) return;
    lastHoverRegionId = null;
    options.onHover(null);
  }

  /** Double-click an edge inserts a node there (frame 12) — only meaningful
   *  on the pen tool's own ring, draft or persisted alike. */
  function onDoubleClick(e: MouseEvent): void {
    if (options.mode() !== "browse" || options.tool() !== "pen") return;
    const region = options.activeRegion();
    if (!region) return;
    const gridPt = options.gridPointAt(e.clientX, e.clientY);
    if (!gridPt) return;

    const persisted = region.vertices !== null;
    const ring = persisted ? region.vertices! : pen.draftRing.value;
    const found = nearestEdge(ring, gridPt[0], gridPt[1], SNAP_HIT_RADIUS_CELLS);
    if (!found) return;

    const next = insertRingVertex(ring, found.index, found.point);
    if (persisted) void options.commitRing(region.id, next).catch(() => {});
    else pen.draftRing.value = next;
  }

  /** `Escape` abandons an unsaved pen draft (frame 12) — a no-op once the
   *  ring has already been persisted, since there is nothing left to
   *  abandon. */
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    if (options.mode() !== "browse" || options.tool() !== "pen") return;
    const region = options.activeRegion();
    if (!region || region.vertices !== null || pen.draftRing.value.length === 0) return;
    pen.abandon();
  }

  function dispose(): void {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("keydown", onKeyDown);
  }

  onMounted(() => window.addEventListener("keydown", onKeyDown));

  return {
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    onDoubleClick,
    onKeyDown,
    strokeCells,
    draftRing: pen.draftRing,
    templateDraft: pen.templateDrag,
    liveDrag,
    penHoverPoint,
    dispose,
  };
}
