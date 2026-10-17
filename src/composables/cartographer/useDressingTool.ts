// The Place tool's prop interaction (epic #1062): place the armed prop, pick up
// and move a placed one, turn it, delete it.
//
// Pulled out of useMapCanvasEditor.ts the way useCartographerStructureTools
// was: the editor owns the canvas, the viewport and the undo stack, and hands
// this module the few things it needs (the snapshot/pushCommand pair every
// one-shot tool there shares, and the three refs MapWorkbench owns). What a
// gesture MEANS lives here; the editor only routes pointer events to it.
//
// Undo is the editor's whole-state snapshot, so each gesture here is one
// before/after pair: a click places one prop, a drag moves one, a key turns
// one, however many pointer-move events the drag took.
//
// A press that places or grabs a prop stays open until its release, and only
// the release commits it (dirty flag, undo step). On a phone the second finger
// of a pinch can land after the editor's touch hold has already handed the
// first finger's press to this tool; `cancelGesture` then takes the placement
// back, or puts the dragged prop down where it was, and the map is left as
// clean as it was before the press.

import { ref, watch, type Ref } from "vue";
import type { Tool } from "@/cartographer/tools";
import type { DressingCatalog } from "@/cartographer/dressing";
import { hitTestDressing } from "@/cartographer/dressing";
import * as paintOps from "@/cartographer/paintOps";
import type { DressingPlacement, DungeonMapLayers } from "@/types/dungeonMap.types";

/** Ghost opacity for the armed prop under the cursor: readable, but plainly not placed yet. */
const GHOST_ALPHA = 0.55;

export interface DressingToolOptions {
  layers: Ref<DungeonMapLayers>;
  catalog: Ref<DressingCatalog>;
  activeTool: Ref<Tool>;
  /** The prop picked in the panel ("armed"); null when none is. */
  brushId: Ref<string | null>;
  /** Rotation a newly placed prop gets, 0-359. */
  brushRotation: Ref<number>;
  selectedId: Ref<string | null>;
  /** False in view mode and while the Plan layer owns the canvas. */
  isActive: () => boolean;
  snapshotStr: () => string;
  pushCommand: (before: string, after: string) => void;
  markDirty: () => void;
}

export interface DressingPointer {
  /** Whole cell under the pointer. */
  cell: [number, number];
  /** Fractional cell coordinates, for hit-testing a rotated footprint. */
  frac: [number, number];
  button: number;
  altKey: boolean;
  shiftKey: boolean;
}

interface PlaceState {
  id: string;
  before: string;
  /** What was selected before the press, restored if the placement is taken back. */
  previousSelection: string | null;
}

interface DragState {
  id: string;
  /** Anchor minus pointer cell, in whole cells, fixed at grab time. */
  offset: [number, number];
  origin: [number, number];
  before: string;
  moved: boolean;
}

export function useDressingTool(opts: DressingToolOptions) {
  const { layers, catalog, activeTool, brushId, brushRotation, selectedId, isActive, snapshotStr, pushCommand, markDirty } = opts;

  /** Whole cell the pointer is over, for the ghost. Null once it leaves the canvas. */
  const hover = ref<[number, number] | null>(null);
  let place: PlaceState | null = null;
  let drag: DragState | null = null;

  // Leaving the tool drops the selection (its outline would hang on a canvas
  // that no longer offers to do anything with it); the brush is kept.
  watch(activeTool, (tool) => {
    if (tool !== "place") selectedId.value = null;
  });
  // Undo, redo or an erase can remove the selected prop: never keep a handle
  // on something that is gone.
  watch(
    () => layers.value.dressing,
    (dressing) => {
      if (selectedId.value && !dressing[selectedId.value]) selectedId.value = null;
    },
  );

  function setHover(cell: [number, number]): void {
    hover.value = cell;
  }

  function clearHover(): void {
    hover.value = null;
  }

  /** Runs `edit` against the layers and files it as one undo step when it changed anything. */
  function commit(edit: () => boolean): boolean {
    const before = snapshotStr();
    if (!edit()) return false;
    markDirty();
    pushCommand(before, snapshotStr());
    return true;
  }

  /** Takes the topmost prop under the pointer away as one undo step; false when there is none. */
  function removeTopAt(frac: [number, number]): boolean {
    const id = hitTestDressing(layers.value.dressing, catalog.value, frac[0], frac[1]);
    if (!id) return false;
    commit(() => paintOps.removeDressing(layers.value, id));
    if (selectedId.value === id) selectedId.value = null;
    return true;
  }

  /**
   * The Place tool's press for a prop. Returns whether it consumed the event: a middle
   * button or Shift press is left to the editor's pan, everything else
   * (including a right-click that hits nothing) is the tool's, so a right-click
   * never also drags the map.
   */
  function onPointerDown(p: DressingPointer): boolean {
    if (p.button === 1 || (p.shiftKey && p.button === 0)) return false;
    // A press whose release never arrived is finished as if it had.
    onPointerUp();

    // Right button, or Alt with the left: take the topmost prop under the pointer away.
    if (p.button === 2 || p.altKey) {
      removeTopAt(p.frac);
      return true;
    }

    const armed = brushId.value;
    if (armed) {
      const id = crypto.randomUUID();
      const before = snapshotStr();
      const placement = { prop_id: armed, x: p.cell[0], y: p.cell[1], rotation: brushRotation.value };
      if (paintOps.placeDressing(layers.value, placement, id)) {
        place = { id, before, previousSelection: selectedId.value };
        selectedId.value = id;
      }
      return true;
    }

    const hit = hitTestDressing(layers.value.dressing, catalog.value, p.frac[0], p.frac[1]);
    if (!hit) {
      selectedId.value = null;
      return true;
    }
    selectedId.value = hit;
    const placement = layers.value.dressing[hit];
    drag = {
      id: hit,
      offset: [placement.x - p.cell[0], placement.y - p.cell[1]],
      origin: [placement.x, placement.y],
      before: snapshotStr(),
      moved: false,
    };
    return true;
  }

  /** True between a press that placed or grabbed a prop and its release: the editor captures the pointer for it. */
  function isHolding(): boolean {
    return place !== null || drag !== null;
  }

  function onPointerMove(cell: [number, number]): void {
    if (!drag) return;
    if (paintOps.moveDressing(layers.value, drag.id, cell[0] + drag.offset[0], cell[1] + drag.offset[1])) {
      drag.moved = true;
    }
  }

  /** Ends the press: a placement is one undo step, a drag one if the prop actually moved. */
  function onPointerUp(): void {
    const done = place ?? (drag?.moved ? drag : null);
    place = null;
    drag = null;
    if (!done) return;
    markDirty();
    pushCommand(done.before, snapshotStr());
  }

  /** A second finger landed mid-press (a pinch): take a placement back, or put a dragged prop down where it was picked up. */
  function cancelGesture(): void {
    if (place) {
      const { id, previousSelection } = place;
      place = null;
      paintOps.removeDressing(layers.value, id);
      selectedId.value = previousSelection;
    }
    if (drag) {
      const { id, origin } = drag;
      drag = null;
      paintOps.moveDressing(layers.value, id, origin[0], origin[1]);
    }
  }

  /**
   * The Eraser's reach into this layer: the topmost prop under the pointer
   * goes before any object beneath it. No undo step of its own: the Eraser's
   * stroke snapshot covers it.
   */
  function eraseTopAt(frac: [number, number]): boolean {
    const id = hitTestDressing(layers.value.dressing, catalog.value, frac[0], frac[1]);
    if (!id) return false;
    paintOps.removeDressing(layers.value, id);
    markDirty();
    if (selectedId.value === id) selectedId.value = null;
    return true;
  }

  /** Turns the selected prop to `rotation`, and the brush with it: the next prop placed keeps the last turn. */
  function rotateSelected(rotation: number): void {
    const id = selectedId.value;
    if (!id) return;
    commit(() => paintOps.rotateDressing(layers.value, id, rotation));
    const placement = layers.value.dressing[id];
    if (placement) brushRotation.value = placement.rotation;
  }

  function deleteSelected(): void {
    const id = selectedId.value;
    if (!id) return;
    commit(() => paintOps.removeDressing(layers.value, id));
    selectedId.value = null;
  }

  /** Q / E / [ / ]: turns the selected prop if there is one, else the brush. */
  function turn(delta: number): void {
    const id = selectedId.value;
    const placement = id ? layers.value.dressing[id] : undefined;
    if (placement) rotateSelected(placement.rotation + delta);
    else brushRotation.value = (brushRotation.value + delta) % 360;
  }

  function disarm(): void {
    brushId.value = null;
  }

  /** What renderMap needs on top of the layers: the ghost under the cursor and the selection outline. */
  function renderScene(): { dressingGhost: { placement: DressingPlacement; alpha: number } | null; selectedDressingId: string | null } {
    const live = isActive() && activeTool.value === "place";
    const cell = hover.value;
    const armed = brushId.value;
    return {
      dressingGhost:
        live && armed && cell
          ? { placement: { prop_id: armed, x: cell[0], y: cell[1], rotation: brushRotation.value, z: 0 }, alpha: GHOST_ALPHA }
          : null,
      selectedDressingId: live ? selectedId.value : null,
    };
  }

  return {
    hover,
    setHover,
    clearHover,
    onPointerDown,
    removeTopAt,
    onPointerMove,
    onPointerUp,
    isHolding,
    cancelGesture,
    eraseTopAt,
    rotateSelected,
    deleteSelected,
    turn,
    disarm,
    renderScene,
  };
}
