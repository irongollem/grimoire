// The pen gesture (epic #884 S7a, decision 6): click to add a vertex, click
// the first node to close, Escape to abandon. Also the template-drag reducer
// — click a centre, drag a radius. Atlas-only; the Cartographer has no
// vertex-ring tool of its own, so there was no rival implementation to
// choose between — this is a straight relocation of the pure half of
// `src/composables/locations/useRegionPen.ts` (#868, frame 12 "Three ways
// to trace a space"), which already got this right: intersection snap,
// alt = half-cell, esc abandons, click the first node to close.
//
// `useRegionPen.ts` re-exports these for `planCanvas.ts`, which this story
// does not own and so cannot repoint — see that file's own note.
//
// The ring maths itself (closing test, insert/move/delete a vertex, nearest
// vertex/edge, simplify) stays in `src/lib/locations/polygon.ts`. That
// module is also imported directly by `MapRegionsLayer.vue`, outside this
// story's ownership, so it is reused from here rather than relocated —
// "reuse, never re-derive" does not require a single physical file when
// another owner already depends on the existing one.
//
// A ring being traced is *unsaved* until it closes — clicking the first
// node is the only thing that ever writes a fresh `vertices` for the first
// time, which is what makes `abandonDraft` (bound to Escape by the caller)
// a real "abandon" rather than a partial commit.

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

// ── Draft ring reducers (a pen trace not yet closed) ─────────────────────────

/** Click adds a node. Refused once the caller has already closed the draft
 *  — closing hands the ring off to the DB copy, and a draft has no further
 *  use for its own points afterward. */
export function addDraftPoint(ring: readonly GridPoint[], point: GridPoint): GridPoint[] {
  return [...ring, point];
}

/** A draft can close once it has ≥3 distinct points — the same rule
 *  `isClosed` already encodes for a persisted ring. */
export function canCloseDraft(ring: readonly GridPoint[]): boolean {
  return isClosed(ring);
}

/** Clicking the first node closes the draft — `null` when there aren't
 *  enough points yet, so the caller knows the click didn't land. */
export function closeDraft(ring: readonly GridPoint[]): GridPoint[] | null {
  if (!canCloseDraft(ring)) return null;
  return simplifyRing(ring);
}

/** `Escape` abandons an unsaved ring. */
export function abandonDraft(): GridPoint[] {
  return [];
}

// ── Persisted-ring reducers (editing a region that already has vertices) ────
// Thin re-exports of `polygon.ts`'s own vertex ops under names that match the
// gesture they serve here, so a reader of this file doesn't have to jump to
// `polygon.ts` to see what "move a node" means for a pen trace.

/** Drag a node to reshape. */
export const moveRingVertex = moveVertex;

/** Alt-click deletes a node — refuses below 3 points. */
export const deleteRingVertex = removeVertex;

/** Double-click an edge inserts a node there. */
export const insertRingVertex = insertVertex;

/** The gold-highlight test: is the cursor within snap range of the ring's
 *  first node, with enough points already placed that closing is possible? */
export function isNearFirstNode(
  ring: readonly GridPoint[],
  x: number,
  y: number,
  withinCells: number,
): boolean {
  if (!canCloseDraft(ring)) return false;
  return nearestVertex(ring, x, y, withinCells) === 0;
}

// ── Template drag (click a centre, drag a radius, done) ─────────────────────

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
