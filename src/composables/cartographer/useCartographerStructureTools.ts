// Structure tools (#868): the Space tool's own pointer dispatch, its
// render-prep for the map canvas, and the room-rename handler. The Zone tool
// was retired (#884 S11) — a zone is now a Plan region authored once in the
// Plan palette.
//
// Pulled out of CartographerEditorView.vue to keep the view under its line
// cap (CLAUDE.md "Component Granularity") — `structure` (the return value of
// useCartographerStructure) already derives WHAT the drawing means; this
// composable is only about ROUTING pointer events and render state to it,
// never about deriving structure itself.

import type { Ref } from "vue";
import type { CellKey } from "@/types/dungeonMap.types";
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
}

export function useCartographerStructureTools(
  structure: ReturnType<typeof useCartographerStructure>,
  { activeTool, dirty }: StructureToolsOptions,
) {
  /**
   * The Space tool's click-to-select — fires immediately on pointerdown,
   * before the view's generic per-stroke setup (isPainting, pointer capture,
   * strokeSnapshot) runs. Returns whether it handled the event.
   */
  function handleStructurePointerDown(x: number, y: number, button: number): boolean {
    const tool = activeTool.value;
    if (tool === "space") {
      if (button === 2) return false; // RMB falls through to pan, same as link/annotate
      structure.selectSpaceAt(x, y);
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

  return { handleStructurePointerDown, renderStructureScene, onRenameSpace };
}
