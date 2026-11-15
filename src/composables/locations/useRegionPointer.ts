// The pointer/gesture state machine `MapRegionsLayer.vue` drove inline until
// it crossed the 600-line soft cap (#868 wave 3). Everything here is *how a
// gesture unfolds* — round-brush stroke, lasso, pen node, template drag, tap-vs-drag,
// hover — never *what a gesture means to the app*: every effect (write a
// ring, navigate, select, move the party) is a callback the component
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
//
// This module now owns tracing only — #884 moved every trace gesture off
// `MapRegionsLayer.vue` onto the Cartographer's Plan palette, and that
// component's read-only click/hover needs live in `useRegionNavPointer.ts`
// instead (it no longer satisfies this file's tracing contract with
// no-op/lying stubs). Click routing itself isn't duplicated between the two:
// `handleClick` below composes `useRegionNavPointer` — see its docblock —
// and adds only the one thing tracing needs on top, a guard against a click
// that's already mid-trace resolving as a fresh selection.

import { onMounted, ref, type Ref } from "vue";
import { useRegionPen, useTemplateShape } from "@/composables/locations/useRegionPen";
import { useRegionNavPointer, type UseRegionNavPointerOptions } from "@/composables/locations/useRegionNavPointer";
import {
  deleteRingVertex,
  insertRingVertex,
  isNearFirstNode,
  moveRingVertex,
  type TemplateDragState,
} from "@/lib/map/gestures/pen";
import { nearestEdge, nearestVertex, snapPoint, templateCells, templateRing, type TraceTool } from "@/lib/locations/polygon";
import { lassoRing, regionLoops, strokeZoneShape, type ZoneShape } from "@/lib/locations/zoneBrush";
import type { Disc } from "@/cartographer/area";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";

/** How many grid units a click may miss a node/edge by and still hit it —
 *  moved from `MapRegionsLayer.vue` unchanged; only the hit-testing gestures
 *  that live here need it now. */
const SNAP_HIT_RADIUS_CELLS = 0.4;

/** A lasso point closer than this to the last one adds nothing the smoothing would keep. */
const LASSO_MIN_STEP_CELLS = 0.05;

/** The in-flight brush shape is recomputed at most this often (a raster union per recompute), and once more on release. */
const BRUSH_PREVIEW_MS = 60;

/** The shape a lasso or brush stroke shows while it is still being drawn: an open path for a lasso, the closed
 *  result so far for a brush. Only ever a preview: nothing is stored until release. */
export interface StrokePreview {
  regionId: string;
  ring: GridPoint[];
  closed: boolean;
}

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

export interface UseRegionPointerOptions extends UseRegionNavPointerOptions {
  /** Whether a cell `cellAt` resolved is one of the whole cells the
   *  calibration actually lays across the image — the brush's own
   *  addressability guard. */
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
  tool(): TraceTool;
  /** The round brush's radius in cells (Zoning's Brush tool). */
  brushRadius(): number;
  /** Fire-and-forget: write a region's squares with no ring. Only a brush or lasso that leaves nothing needs it
   *  here: a zone drawn by hand is a ring, and its squares are derived from that. */
  commitCells(regionId: string, cells: CellKey[]): void;
  /** Write a ring (a pen edit, a lasso, a finished brush stroke, or a closing draft). Must
   *  reject on failure — the draft-close gesture needs that signal to put
   *  its ring back; every other call site swallows it, since the host has
   *  already toasted. */
  commitRing(regionId: string, ring: GridPoint[]): Promise<void>;
  /** Write a finished template drop. Kept separate from `commitRing`
   *  because a template's cell fill (`templateCells`) is its own algorithm,
   *  not the generic ring-fill `commitRing`'s host uses for a pen shape. */
  commitTemplate(regionId: string, ring: GridPoint[], cells: CellKey[]): void;
}

export interface UseRegionPointerReturn {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerLeave: () => void;
  onDoubleClick: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  /** The lasso or brush stroke being drawn, `null` between strokes. */
  strokePreview: Ref<StrokePreview | null>;
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
  /** Abandons whatever gesture is in flight — brush or lasso stroke, a live
   *  drag on a persisted pen ring, a template drag, or an unsaved pen draft
   *  — without committing it, and detaches the `window` listeners the
   *  gesture attached. `Escape` already abandons an unsaved pen draft
   *  (`onKeyDown` below); this is the same abandonment applied to every
   *  gesture kind, for a caller that needs to cut one short from outside a
   *  keypress — the Cartographer's Plan layer calls this when the DM
   *  switches the active layer away from Plan mid-gesture (#884 review
   *  finding 2): nothing used to stop these `window` listeners on a layer
   *  switch, so the eventual pointerup would still commit the abandoned
   *  gesture onto whatever region was active when it started. */
  abandonGesture: () => void;
}

export function useRegionPointer(options: UseRegionPointerOptions): UseRegionPointerReturn {
  const pen = useRegionPen();
  const templateShape = useTemplateShape();
  // `options` already satisfies `UseRegionNavPointerOptions` structurally
  // (this interface extends it), so this reuses that module's click routing
  // verbatim rather than keeping a second copy. Only `nav.handleClick` is
  // ever called below — never `nav.onPointerDown`/`onPointerMove` — so this
  // never attaches a second set of `window` listeners or duplicates hover.
  const nav = useRegionNavPointer(options);

  const strokePreview = ref<StrokePreview | null>(null) as Ref<StrokePreview | null>;
  /** The live lasso or brush stroke. A brush keeps the region's own shape as loops (`base`, worked out once at the
   *  start) and the discs stamped so far; Alt at the start makes it a carve. */
  type ActiveStroke =
    | { kind: "lasso"; regionId: string; points: GridPoint[] }
    | {
        kind: "brush";
        regionId: string;
        base: GridPoint[][];
        discs: Disc[];
        last: GridPoint;
        erase: boolean;
        radius: number;
        lastComputeAt: number;
        timer: ReturnType<typeof setTimeout> | null;
      };
  let activeStroke: ActiveStroke | null = null;

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

  /** True while a pointerdown handler is mid-`await` (a mutation) with no
   *  `penDrag`/`templateDrag` yet set to show for it. The corresponding
   *  `pointerup` can arrive before that await resolves, and without this flag
   *  `onWindowPointerUp` would read no gesture in flight and misread the
   *  release as a plain tap-click. */
  let pendingAsyncGesture = false;

  let lastHoverRegionId: string | null = null;

  /**
   * Everything that isn't painting: selecting an unbound shape to trace,
   * navigating to a bound room's sheet, or — in run mode — moving the
   * party. The routing itself is `useRegionNavPointer`'s `handleClick`
   * (see its docblock for the zones-excluded-from-`regionAt` rationale);
   * the only thing added here is tracing's own guard — a click while a
   * (possibly dangling) selection exists is still "already tracing
   * something", never a fresh selection. Selecting a *new* shape to trace
   * (from `ZoningList`'s Reshape button) never goes through a tap
   * on the map at all, which is why this guard is safe to apply whenever an
   * active region id is set.
   */
  function handleClick(e: PointerEvent): void {
    if (options.mode() === "browse" && options.hasActiveRegionId()) return;
    nav.handleClick(e);
  }

  /** Recomputes the shape a brush stroke has made so far. */
  function brushResult(stroke: Extract<ActiveStroke, { kind: "brush" }>): ZoneShape | null {
    stroke.lastComputeAt = Date.now();
    return strokeZoneShape(stroke.base, stroke.discs, stroke.erase);
  }

  /** Shows the stroke so far as a closed ring. A shape in several pieces has no one ring, so the preview leaves the
   *  region's stored shape on screen until the release writes its squares; a carve that leaves nothing shows nothing. */
  function showBrush(stroke: Extract<ActiveStroke, { kind: "brush" }>): void {
    const shape = brushResult(stroke);
    if (shape !== null && "cells" in shape && shape.cells.length > 0) {
      strokePreview.value = null;
      return;
    }
    // `null` = the stroke has changed nothing yet, so the region's own shape is what it still is.
    const ring = shape === null ? flattenBase(stroke.base) : "ring" in shape ? shape.ring : [];
    strokePreview.value = { regionId: stroke.regionId, ring, closed: true };
  }

  function flattenBase(base: GridPoint[][]): GridPoint[] {
    return base.length > 0 ? base[0] : [];
  }

  /** Stamps discs from the last one to `to`, at most a third of a radius apart, so a fast drag is one smooth stroke
   *  rather than a string of dots (the Drawing's round brush spaces its discs the same way). */
  function stampBrush(stroke: Extract<ActiveStroke, { kind: "brush" }>, to: GridPoint): void {
    const r = stroke.radius;
    const [fx, fy] = stroke.last;
    const dist = Math.hypot(to[0] - fx, to[1] - fy);
    const n = Math.max(1, Math.ceil(dist / (r / 3)));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      stroke.discs.push({ x: fx + (to[0] - fx) * t, y: fy + (to[1] - fy) * t, r });
    }
    stroke.last = to;
  }

  /** Throttled live preview: at most one recompute per `BRUSH_PREVIEW_MS`; between recomputes the last ring stays,
   *  and a trailing timer makes sure the last move is shown. */
  function scheduleBrushPreview(stroke: Extract<ActiveStroke, { kind: "brush" }>): void {
    if (stroke.timer !== null) return;
    const wait = BRUSH_PREVIEW_MS - (Date.now() - stroke.lastComputeAt);
    if (wait <= 0) {
      showBrush(stroke);
      return;
    }
    stroke.timer = setTimeout(() => {
      stroke.timer = null;
      if (activeStroke === stroke) showBrush(stroke);
    }, wait);
  }

  /** The brush paints a smooth shape (#1197, frame 05): round discs along the stroke, unioned into the region's
   *  current shape on release, or carved out of it with Alt. With no active region the click only selects. */
  function handleBrushPointerDown(e: PointerEvent, region: LocationMapRegion): void {
    const key = options.cellAt(e.clientX, e.clientY);
    const gp = options.gridPointAt(e.clientX, e.clientY);
    if (!key || !options.isPaintable(key) || !gp) return;
    const stroke: Extract<ActiveStroke, { kind: "brush" }> = {
      kind: "brush",
      regionId: region.id,
      base: regionLoops(region.vertices, region.cells),
      discs: [],
      last: gp,
      erase: e.altKey,
      radius: options.brushRadius(),
      lastComputeAt: Number.NEGATIVE_INFINITY,
      timer: null,
    };
    activeStroke = stroke;
    stampBrush(stroke, gp);
    showBrush(stroke);
  }

  /** The lasso (#1197, frame 05): one freehand drag round the area, closed and smoothed on release. Never snapped. */
  function handleLassoPointerDown(e: PointerEvent, region: LocationMapRegion): void {
    const gp = options.gridPointAt(e.clientX, e.clientY);
    if (!gp) return;
    activeStroke = { kind: "lasso", regionId: region.id, points: [gp] };
    strokePreview.value = { regionId: region.id, ring: [gp], closed: false };
  }

  /** Ends a lasso or brush stroke: stores what it made. A lasso REPLACES the region's shape, as closing a pen ring
   *  does; a brush that leaves nothing empties the region, and one that leaves several pieces stores their squares. */
  function finishStroke(): void {
    const stroke = activeStroke;
    if (!stroke) return;
    activeStroke = null;
    strokePreview.value = null;
    if (stroke.kind === "lasso") {
      const ring = lassoRing(stroke.points);
      if (ring) void options.commitRing(stroke.regionId, ring).catch(() => {});
      return;
    }
    if (stroke.timer !== null) clearTimeout(stroke.timer);
    const shape = brushResult(stroke);
    if (shape === null) return;
    if ("cells" in shape) options.commitCells(stroke.regionId, shape.cells);
    else void options.commitRing(stroke.regionId, shape.ring).catch(() => {});
  }

  function cancelStroke(): void {
    if (activeStroke?.kind === "brush" && activeStroke.timer !== null) clearTimeout(activeStroke.timer);
    activeStroke = null;
    strokePreview.value = null;
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
    // the network — `handlePenPointerDown` `await`s a mutation partway through
    // (the ring close). A real click's `pointerup` can arrive before that
    // await resolves, and this function returning a pending promise doesn't
    // delay the browser's own event dispatch — so registering the listeners
    // after the `await` risked losing that pointerup entirely, leaving the
    // next gesture reading a stale `pointerDownAt`.
    //
    // `pendingAsyncGesture` tells `onWindowPointerUp` there's an awaiting
    // handler to defer to (so it doesn't misread the release as a plain
    // tap-click). The pen's two async branches (alt-click delete, draft-close)
    // each commit directly inside their own `await` rather than deferring to
    // a later pointerup, so a pointerup landing mid-flight has nothing left
    // to finish.
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp, { once: true });

    if (options.mode() === "browse") {
      const region = options.activeRegion();
      if (region) {
        const tool = options.tool();
        if (tool === "paint") handleBrushPointerDown(e, region);
        else if (tool === "lasso") handleLassoPointerDown(e, region);
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

    const stroke = activeStroke;
    if (stroke) {
      const gp = options.gridPointAt(e.clientX, e.clientY);
      if (!gp) return;
      if (stroke.kind === "lasso") {
        const last = stroke.points[stroke.points.length - 1];
        if (Math.hypot(gp[0] - last[0], gp[1] - last[1]) < LASSO_MIN_STEP_CELLS) return;
        stroke.points.push(gp);
        strokePreview.value = { regionId: stroke.regionId, ring: [...stroke.points], closed: false };
        return;
      }
      const key = options.cellAt(e.clientX, e.clientY);
      if (!key || !options.isPaintable(key)) return;
      stampBrush(stroke, gp);
      scheduleBrushPreview(stroke);
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

  /** Commits whichever gesture was in flight — a brush or lasso stroke, a pen node
   *  drag, or a template drop — or, when none started, resolves a plain,
   *  unmoved tap into a click on whatever region is under it. */
  function onWindowPointerUp(e: PointerEvent): void {
    window.removeEventListener("pointermove", onWindowPointerMove);
    pointerDownAt = null;

    if (activeStroke) {
      finishStroke();
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

    if (pendingAsyncGesture) {
      // Nothing to commit yet — the awaiting handler finishes by itself, so
      // this pointerup must not be misread as a click.
      return;
    }

    if (movedBeyondTapThreshold) return;
    handleClick(e);
  }

  // ── Hover ───────────────────────────────────────────────────────────────
  // Plain mouse movement, not a gesture — suppressed mid-stroke: the window
  // handler above already owns the pointer for the duration of a paint, and
  // hovering would otherwise report whatever's under the cursor as it drags
  // across several regions rather than the one actually being painted.

  function onPointerMove(e: PointerEvent): void {
    if (activeStroke) return;

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

  /** `Escape` drops a lasso or brush stroke in flight, and abandons an unsaved pen draft (frame 12) — a no-op
   *  once the ring has already been persisted, since there is nothing left to abandon. */
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    if (activeStroke) {
      abandonGesture();
      return;
    }
    if (options.mode() !== "browse" || options.tool() !== "pen") return;
    const region = options.activeRegion();
    if (!region || region.vertices !== null || pen.draftRing.value.length === 0) return;
    pen.abandon();
  }

  function dispose(): void {
    cancelStroke();
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("keydown", onKeyDown);
  }

  function abandonGesture(): void {
    // The window listeners `onPointerDown` attaches outlive a layer switch
    // (only `dispose()` on unmount removes them) — detach them here too, or
    // the physical pointerup still in flight would fall through to
    // `handleClick` once every gesture branch below reports nothing left to
    // commit (#884 review finding 2).
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    pointerDownAt = null;
    movedBeyondTapThreshold = false;

    cancelStroke();
    if (penDrag) {
      penDrag = null;
      liveDrag.value = null;
    }
    if (pen.templateDrag.value) pen.endTemplate();
    if (pen.draftRing.value.length > 0) pen.abandon();
  }

  onMounted(() => window.addEventListener("keydown", onKeyDown));

  return {
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    onDoubleClick,
    onKeyDown,
    strokePreview,
    draftRing: pen.draftRing,
    templateDraft: pen.templateDrag,
    liveDrag,
    penHoverPoint,
    dispose,
    abandonGesture,
  };
}
