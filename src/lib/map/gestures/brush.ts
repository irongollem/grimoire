// The brush gesture (epic #884 S7a, decision 6 — "merge the two paint
// systems"): drag to paint or erase a set of cells, one cell per touch.
//
// Two implementations existed before this story:
//   - The Cartographer's floor/solid/stamp tools (useMapCanvasEditor.ts)
//     painted whatever cell was under the pointer on every move, with no
//     memory of the stroke — always the same fixed direction (the active
//     tool decides paint vs. erase, never the cell's own content).
//   - The Atlas's region paint tool (useRegionPointer.ts) inferred paint vs.
//     erase from the FIRST cell touched — already in the region means the
//     whole stroke erases, else it paints — and locked to that direction for
//     the rest of the stroke, using a toggle-with-guard so dragging back
//     over an already-touched cell can't flip it back.
//
// The Atlas's version won: direction lock is strictly better (a stroke that
// crosses its own path can't flicker), and it subsumes the Cartographer's
// fixed-direction case exactly — pass a `mode` that ignores the cell's
// content (`startBrushStroke(cell, "paint")`) and every touch is unconditionally
// additive, which is what the Cartographer's tools need.
//
// Pure: no Vue, no canvas. `touched` records first-touch order (not sorted),
// because `applyBrushStroke` needs it to rebuild the result the same way the
// original array-based `toggleCell` stroke did — callers that render a live
// preview also want touch order over canonical order.

import type { CellKey } from "@/types/dungeonMap.types";

export type BrushMode = "paint" | "erase";

export interface BrushStroke {
  readonly mode: BrushMode;
  /** Distinct cells touched this stroke, in first-touch order. */
  readonly touched: readonly CellKey[];
}

/**
 * Starts a stroke at `cell`. `mode` is either fixed (the Cartographer's
 * case — the active tool already says paint or erase) or inferred from
 * whether `cell` is already filled (the Atlas's case — pass a predicate;
 * true means the stroke erases).
 */
export function startBrushStroke(cell: CellKey, mode: BrushMode | ((cell: CellKey) => boolean)): BrushStroke {
  const resolved = typeof mode === "function" ? (mode(cell) ? "erase" : "paint") : mode;
  return { mode: resolved, touched: [cell] };
}

/**
 * Touches another cell in an active stroke. A cell already touched this
 * stroke is a no-op — this is the direction lock: once a cell's fate for
 * this stroke is decided, revisiting it (dragging back over your own path)
 * changes nothing.
 */
export function touchBrushStroke(stroke: BrushStroke, cell: CellKey): BrushStroke {
  if (stroke.touched.includes(cell)) return stroke;
  return { mode: stroke.mode, touched: [...stroke.touched, cell] };
}

/**
 * Applies a stroke (finished or still in progress) to the filled-cell set it
 * started from, returning the next full set. Paint unions the touched cells
 * in; erase subtracts them out — touching a cell that was never in
 * `baseFilled` during an erase is already a no-op by construction.
 */
export function applyBrushStroke(stroke: BrushStroke, baseFilled: readonly CellKey[]): CellKey[] {
  if (stroke.mode === "paint") {
    const out = [...baseFilled];
    for (const cell of stroke.touched) if (!out.includes(cell)) out.push(cell);
    return out;
  }
  return baseFilled.filter((cell) => !stroke.touched.includes(cell));
}
