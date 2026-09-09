// Structure tools (#868): the Space and Zone tools' own pointer dispatch,
// their render-prep for the map canvas, and the room-rename handler.
//
// Pulled out of CartographerEditorView.vue to keep the view under its line
// cap (CLAUDE.md "Component Granularity") — `structure` (the return value of
// useCartographerStructure) already derives WHAT the drawing means; this
// composable is only about ROUTING pointer events and render state to it,
// never about deriving structure itself.

import type { Ref } from "vue";
import { cellKey, type CellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { Tool } from "@/cartographer/tools";
import type { useCartographerStructure } from "./useCartographerStructure";

export interface StructureRenderScene {
  /** Only set while the Space tool is active — every other tool leaves the
   *  outline/name overlay off, same convention as previewCells/hoveredEdge. */
  derivedSpaces?: { key: string; cells: CellKey[]; displayName: string; nameSource: "annotation" | null }[];
  selectedSpaceKey: string | null;
}

export interface StructureToolsOptions {
  activeTool: Ref<Tool>;
  dirty: Ref<boolean>;
  layers: Ref<DungeonMapLayers>;
  /** The same snapshot/pushCommand pair every one-shot action in the view
   *  uses, so a zone right-click erase groups into one undo step exactly
   *  like a stamp right-click erase does. */
  snapshotStr: () => string;
  pushCommand: (before: string, after: string) => void;
}

export function useCartographerStructureTools(
  structure: ReturnType<typeof useCartographerStructure>,
  { activeTool, dirty, layers, snapshotStr, pushCommand }: StructureToolsOptions,
) {
  /**
   * The Space tool's click-to-select and the Zone tool's right-click erase —
   * the two Structure actions that fire immediately on pointerdown, before
   * the view's generic per-stroke setup (isPainting, pointer capture,
   * strokeSnapshot) runs. Returns whether it handled the event.
   *
   * Deliberately does NOT handle the Zone tool's left-click paint: that needs
   * the generic stroke setup to run first (so dragging keeps painting), so
   * it goes through handleStructurePointerMove instead, called from the
   * view's own tool-dispatch chain — the same call site paintCell /
   * paintSolidAt already use for their own first-cell paint.
   */
  function handleStructurePointerDown(x: number, y: number, button: number): boolean {
    const tool = activeTool.value;
    if (tool === "space") {
      if (button === 2) return false; // RMB falls through to pan, same as link/annotate
      structure.selectSpaceAt(x, y);
      return true;
    }
    if (tool === "zone" && button === 2) {
      const before = snapshotStr();
      structure.eraseZoneAt(x, y);
      const after = snapshotStr();
      if (before !== after) pushCommand(before, after);
      return true;
    }
    return false;
  }

  /**
   * The Zone tool's paint dispatch — one cell, called for the first cell of
   * a stroke AND for every cell during a drag, same as paintCell /
   * paintSolidAt / paintObjectAt — and the Eraser tool's zone-over-floor
   * priority check. Returns whether it handled the cell, so the Eraser's own
   * if/else chain can fall through to solidBlock/floor exactly as before
   * when there's no zone here.
   */
  function handleStructurePointerMove(x: number, y: number): boolean {
    const tool = activeTool.value;
    if (tool === "zone") {
      if (structure.paintZoneAt(x, y)) dirty.value = true;
      return true;
    }
    if (tool === "eraser" && layers.value.zone?.[cellKey(x, y)]) {
      if (structure.eraseZoneAt(x, y)) dirty.value = true;
      return true;
    }
    return false;
  }

  /** The Space tool's outline+label preview and which space is selected —
   *  read by render() every frame. */
  function renderStructureScene(): StructureRenderScene {
    return {
      derivedSpaces: activeTool.value === "space"
        ? structure.structure.value.spaces.map((s, i) => ({
            key: s.key,
            cells: s.cells,
            displayName: structure.spaceRows.value[i]!.displayName,
            nameSource: s.nameSource,
          }))
        : undefined,
      selectedSpaceKey: structure.selectedSpaceKey.value,
    };
  }

  function onRenameSpace(name: string): void {
    if (structure.renameSpace(name)) dirty.value = true;
  }

  return { handleStructurePointerDown, handleStructurePointerMove, renderStructureScene, onRenameSpace };
}
