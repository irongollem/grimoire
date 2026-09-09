// The pen + template interaction state machine (#868, frame 12 "Three ways
// to trace a space"), split out of `MapRegionsLayer.vue` to keep that file
// under the 600-line soft max once tracing joined drag-to-paint there.
//
// A ring being traced with the pen is *unsaved* until it closes — clicking
// the first node is the only thing that ever writes a fresh `vertices` for
// the first time, which is what makes `Escape` a real "abandon" rather than
// a partial commit. Once a region has vertices at all, every further edit
// (drag, alt-click delete, double-click insert) mutates the *persisted* ring
// directly and commits immediately — there is no separate edit mode, per
// frame 12's own caption. `MapRegionsLayer.vue` owns which case applies (it
// knows the active region's `vertices`); this module only knows how to fold
// one gesture into a ring.
//
// The reducers below are pure and exported for their own tests; the
// `useRegionPen` composable at the bottom is the thin reactive wrapper
// `MapRegionsLayer.vue` actually holds, so the component doesn't re-derive
// "is the draft ring closeable" or "which node is under the cursor" itself.
//
// The actual canvas drawing (the pen/template overlay, the persisted-ring
// outline) moved on to `src/lib/locations/planCanvas.ts` (#868 wave 2) —
// that module holds every render pass `MapRegionsLayer.vue` composes, this
// one keeps only the gesture state and its pure reducers.

import { ref, type Ref } from "vue";
import {
  insertVertex,
  isClosed,
  moveVertex,
  nearestVertex,
  removeVertex,
  simplifyRing,
  type TemplateShape,
} from "@/lib/locations/polygon";
import type { GridPoint } from "@/types/locationMapRegion.types";
import type { GridCalibration } from "@/types/location.types";

// ── Draft ring reducers (a pen trace not yet closed) ─────────────────────────

/** Click adds a node (frame 12). Refused once the caller has already closed
 *  the draft — closing hands the ring off to the DB copy, and a draft has no
 *  further use for its own points afterward. */
export function addDraftPoint(ring: readonly GridPoint[], point: GridPoint): GridPoint[] {
  return [...ring, point];
}

/** A draft can close once it has ≥3 distinct points — the same rule
 *  `isClosed` already encodes for a persisted ring. */
export function canCloseDraft(ring: readonly GridPoint[]): boolean {
  return isClosed(ring);
}

/** Clicking the first node closes the draft (frame 12) — `null` when there
 *  aren't enough points yet, so the caller knows the click didn't land. */
export function closeDraft(ring: readonly GridPoint[]): GridPoint[] | null {
  if (!canCloseDraft(ring)) return null;
  return simplifyRing(ring);
}

/** `Escape` abandons an unsaved ring (frame 12). */
export function abandonDraft(): GridPoint[] {
  return [];
}

// ── Persisted-ring reducers (editing a region that already has vertices) ────
// Thin re-exports of `polygon.ts`'s own vertex ops under names that match the
// gesture they serve here, so a reader of this file doesn't have to jump to
// `polygon.ts` to see what "move a node" means for a pen trace.

/** Drag a node to reshape (frame 12). */
export const moveRingVertex = moveVertex;

/** Alt-click deletes a node (frame 12) — refuses below 3 points. */
export const deleteRingVertex = removeVertex;

/** Double-click an edge inserts a node there (frame 12). */
export const insertRingVertex = insertVertex;

/** The gold-highlight test: is the cursor within snap range of the ring's
 *  first node, with enough points already placed that closing is possible?
 *  (frame 12: "it highlights gold when the cursor is on it.") */
export function isNearFirstNode(
  ring: readonly GridPoint[],
  x: number,
  y: number,
  withinCells: number,
): boolean {
  if (!canCloseDraft(ring)) return false;
  return nearestVertex(ring, x, y, withinCells) === 0;
}

// ── Template drag (frame 12: "click a centre, drag a radius, done.") ────────

export interface TemplateDragState {
  shape: TemplateShape;
  center: GridPoint;
  radius: number;
}

export function startTemplateDrag(shape: TemplateShape, center: GridPoint): TemplateDragState {
  return { shape, center, radius: 0 };
}

/** The live preview radius while dragging — whole cells, since the template
 *  shapes (`cellsForTemplate`) are themselves defined on integer radii. */
export function updateTemplateDrag(state: TemplateDragState, point: GridPoint): TemplateDragState {
  const radius = Math.round(Math.hypot(point[0] - state.center[0], point[1] - state.center[1]));
  return { ...state, radius };
}

// ── Grid-point <-> canvas-pixel conversion ───────────────────────────────────
// The inverse pair `gridCalibration.ts` doesn't have: that module converts
// *cells* to image-fraction *rects* (`cellRectInImageFractions`); the pen
// draws *points* (a ring's vertices, a template's centre and rubber-band),
// which sit at cell corners and halves rather than inside a cell. Both
// derive the same per-cell fraction size, so a vertex the pen drops lines up
// exactly with the cell grid `MapRegionsLayer` already renders.

export function cellFractionSize(
  calibration: GridCalibration,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
): { cellWFrac: number; cellHFrac: number } | null {
  if (imageNaturalWidth <= 0 || imageNaturalHeight <= 0 || calibration.cells_per_image_width <= 0) return null;
  const cellWFrac = 1 / calibration.cells_per_image_width;
  const cellHFrac = cellWFrac * (imageNaturalWidth / imageNaturalHeight);
  return { cellWFrac, cellHFrac };
}

/** A grid point (a ring vertex, in map-cell space) to canvas pixels — the
 *  same canvas the overlay already draws cell rects onto. Degenerate inputs
 *  (see `gridExtent`) return the canvas origin, since no cell size can be
 *  computed to place the point with. */
export function gridPointToCanvas(
  point: GridPoint,
  calibration: GridCalibration,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const size = cellFractionSize(calibration, imageNaturalWidth, imageNaturalHeight);
  if (!size) return { x: 0, y: 0 };
  const origin = { x: calibration.origin_cell_x ?? 0, y: calibration.origin_cell_y ?? 0 };
  const fx = calibration.origin_x_pct + (point[0] - origin.x) * size.cellWFrac;
  const fy = calibration.origin_y_pct + (point[1] - origin.y) * size.cellHFrac;
  return { x: fx * canvasWidth, y: fy * canvasHeight };
}

/** The exact inverse of `gridPointToCanvas` — a canvas pixel (a pointer
 *  event, already through the frame's `toImageFraction`) back to a grid
 *  point, unsnapped. The caller runs it through `snapPoint` afterward.
 *  Degenerate inputs fall back to the origin cell, mirroring
 *  `cellAtImageFraction`. */
export function canvasToGridPoint(
  canvasX: number,
  canvasY: number,
  calibration: GridCalibration,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): GridPoint {
  const size = cellFractionSize(calibration, imageNaturalWidth, imageNaturalHeight);
  const origin = { x: calibration.origin_cell_x ?? 0, y: calibration.origin_cell_y ?? 0 };
  if (!size || canvasWidth <= 0 || canvasHeight <= 0) return [origin.x, origin.y];
  const fx = canvasX / canvasWidth;
  const fy = canvasY / canvasHeight;
  const gx = (fx - calibration.origin_x_pct) / size.cellWFrac + origin.x;
  const gy = (fy - calibration.origin_y_pct) / size.cellHFrac + origin.y;
  return [gx, gy];
}

// ── The reactive wrapper `MapRegionsLayer.vue` holds ─────────────────────────

export interface UseRegionPenReturn {
  /** The in-progress, unsaved ring — empty until the first click, discarded
   *  by `abandon()` or handed off (via `close()`) once it commits. */
  draftRing: Ref<GridPoint[]>;
  /** Set only while a template drag (pointerdown-to-pointerup) is live. */
  templateDrag: Ref<TemplateDragState | null>;
  addPoint: (point: GridPoint) => void;
  /** Attempts to close the draft; returns the closed ring on success so the
   *  caller can commit it, or `null` if there weren't enough points yet
   *  (the click simply didn't land on a valid close). */
  close: () => GridPoint[] | null;
  abandon: () => void;
  startTemplate: (shape: TemplateShape, center: GridPoint) => void;
  dragTemplate: (point: GridPoint) => void;
  /** Ends the drag and returns its final state for the caller to commit and
   *  persist, or `null` if no drag was in progress. */
  endTemplate: () => TemplateDragState | null;
}

export function useRegionPen(): UseRegionPenReturn {
  const draftRing = ref<GridPoint[]>([]) as Ref<GridPoint[]>;
  const templateDrag = ref<TemplateDragState | null>(null);

  function addPoint(point: GridPoint): void {
    draftRing.value = addDraftPoint(draftRing.value, point);
  }

  function close(): GridPoint[] | null {
    const closed = closeDraft(draftRing.value);
    if (!closed) return null;
    draftRing.value = [];
    return closed;
  }

  function abandon(): void {
    draftRing.value = abandonDraft();
  }

  function startTemplate(shape: TemplateShape, center: GridPoint): void {
    templateDrag.value = startTemplateDrag(shape, center);
  }

  function dragTemplate(point: GridPoint): void {
    if (!templateDrag.value) return;
    templateDrag.value = updateTemplateDrag(templateDrag.value, point);
  }

  function endTemplate(): TemplateDragState | null {
    const final = templateDrag.value;
    templateDrag.value = null;
    return final;
  }

  return { draftRing, templateDrag, addPoint, close, abandon, startTemplate, dragTemplate, endTemplate };
}

// ── The template shape picker's selection ────────────────────────────────────
// A module-level singleton, the same idiom `useConfirm`'s dialog state uses:
// the picker (`SiteMapRegionList`'s header, frame 12) and the drag it feeds
// (`MapRegionsLayer`) are sibling components, both mounted by `LocationMap.vue`
// — which does not otherwise mediate this value, and touching it is outside
// this story. A single "currently selected shape" is exactly the shape of
// state a singleton fits: only one tracing session can be live at a time.

export const TEMPLATE_SHAPES: readonly TemplateShape[] = ["circle", "octagon", "hex"];

export const TEMPLATE_SHAPE_LABELS: Record<TemplateShape, string> = {
  circle: "Circle",
  octagon: "Octagon",
  hex: "Hex",
};

const templateShapeState: Ref<TemplateShape> = ref("octagon");

export function useTemplateShape(): Ref<TemplateShape> {
  return templateShapeState;
}
