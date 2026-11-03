// The round Brush's running stroke: its discs, the footprint drawn while the pointer is down, and the
// room-fitting result computed from them. Split out of useMapCanvasEditor, which routes pointer events here.

import { shallowRef, toRaw, type ComputedRef, type Ref } from "vue";
import type { BrushRegionMode, DungeonMapLayers, GroundRegion, GroundWallMode } from "@/types/dungeonMap.types";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { Disc } from "@/cartographer/area";
import { applyBrushStroke } from "@/cartographer/groundRegions";

export function useEditorBrush(inputs: {
  layers: Ref<DungeonMapLayers>;
  packRuntime: ComputedRef<TilePackRuntime | null>;
  currentPackId: Ref<string>;
  brushRadius: Ref<number>;
  brushRegionMode: Ref<BrushRegionMode>;
  brushWallMode: Ref<GroundWallMode>;
  brushCategory: Ref<GroundRegion["category"]>;
  /** The ground region Select has picked: a stroke in "grow" mode extends it. */
  selectedGroundId: Ref<string | null>;
  activePackVersion: () => number;
  pickFloorVariant: (x: number, y: number) => number;
  markDirty: () => void;
  scheduleRender: () => void;
}) {
  const {
    layers, packRuntime, currentPackId, brushRadius, brushRegionMode, brushWallMode, brushCategory, selectedGroundId,
    activePackVersion, pickFloorVariant, markDirty, scheduleRender,
  } = inputs;

  // Round brush: the last disc centre of the running stroke (fractional cells)
  // and the floor variant the stroke paints with, fixed at its first cell so
  // one stroke is one look.
  let brushLast: [number, number] | null = null;
  let brushVariant = 0;
  // The stroke is applied from the layers as they stood at pointer-down with ALL its discs on every move: the room's
  // run is re-fitted each time, so stacking segment on segment would let its nodes drift. Alt is read once, at press.
  let brushBase: DungeonMapLayers | null = null;
  let brushDiscs: Disc[] = [];
  let brushErase = false;
  let brushMode: BrushRegionMode = "new";
  let brushTarget: string | null = null;
  let brushWalls: GroundWallMode = "none";
  let brushMaterial: { pack_id: string; pack_version: number; variant: number } | null = null;
  let brushName = "";
  let brushGroundCategory: GroundRegion["category"] = "floor";
  let brushFootprint: Path2D | null = null;
  let brushPause: ReturnType<typeof setTimeout> | undefined;
  const brushResult = shallowRef<DungeonMapLayers | null>(null);

  /** A stroke begins at a cell: everything it will apply is fixed from here, Alt read once. */
  function begin(cx: number, cy: number, erase: boolean): void {
    brushLast = null;
    brushVariant = pickFloorVariant(cx, cy);
    brushBase = toRaw(layers.value);
    brushFootprint = new Path2D();
    brushDiscs = [];
    brushErase = erase;
    brushMode = brushRegionMode.value;
    brushTarget = selectedGroundId.value;
    brushWalls = brushWallMode.value;
    brushGroundCategory = brushCategory.value;
    brushName = `${packRuntime.value?.manifest.name ?? currentPackId.value} ${brushGroundCategory === "terrainWater" ? "water" : "ground"}`;
    brushMaterial = { pack_id: currentPackId.value, pack_version: activePackVersion(), variant: brushVariant };
  }

  // Round brush: discs at most radius / 3 apart along the pointer path, so a
  // fast drag leaves one smooth stroke instead of a string of dots. Positions
  // are fractional cells. The stroke makes walls (brushWalls.ts): it grows the
  // room it starts in, or makes a new one on empty ground; Alt carves.
  function brushTo(x: number, y: number): void {
    if (!packRuntime.value || !brushBase) return;
    const r = brushRadius.value;
    const from = brushLast;
    const step = r / 3;
    const dist = from ? Math.hypot(x - from[0], y - from[1]) : 0;
    const n = from ? Math.max(1, Math.ceil(dist / step)) : 1;
    for (let i = 1; i <= n; i++) {
      const t = from ? i / n : 1;
      const disc = { x: from ? from[0] + (x - from[0]) * t : x, y: from ? from[1] + (y - from[1]) * t : y, r };
      brushDiscs.push(disc);
      brushFootprint!.moveTo(disc.x + r, disc.y);
      brushFootprint!.arc(disc.x, disc.y, r, 0, Math.PI * 2);
    }
    brushLast = [x, y];
    brushResult.value = null;
    clearTimeout(brushPause);
    brushPause = setTimeout(() => {
      brushResult.value = computeBrush();
      scheduleRender();
    }, 150);
    scheduleRender();
  }

  function computeBrush(): DungeonMapLayers {
    const pack = brushMaterial!;
    return applyBrushStroke(brushBase!, { discs: brushDiscs }, {
      erase: brushErase, pack, wall: { ...pack, variant: 0 }, newKey: () => crypto.randomUUID(),
      mode: brushMode, targetId: brushTarget, walls: brushWalls, category: brushGroundCategory, name: brushName,
    });
  }

  function clearBrush(): void {
    clearTimeout(brushPause);
    brushBase = null;
    brushDiscs = [];
    brushFootprint = null;
    brushResult.value = null;
    scheduleRender();
  }

  function commitBrush(): void {
    const next = brushResult.value ?? computeBrush();
    if (next !== brushBase) {
      layers.value = next;
      if (brushMode === "new" && !brushErase) {
        selectedGroundId.value = Object.entries(next.ground).find(([id]) => brushBase?.ground[id] === undefined)?.[0] ?? selectedGroundId.value;
      }
      markDirty();
    }
  }

  return {
    begin,
    to: brushTo,
    clear: clearBrush,
    commit: commitBrush,
    /** A stroke is under way (its base layers are held). */
    isActive: (): boolean => brushBase !== null,
    /** Where the last disc went, in fractional cells; null before the first. */
    last: (): [number, number] | null => brushLast,
    erase: (): boolean => brushErase,
    footprint: (): Path2D | null => brushFootprint,
    /** The fitted layers shown while the stroke runs; null while the pointer is still moving. */
    result: brushResult,
    dispose(): void { clearTimeout(brushPause); },
  };
}

export type EditorBrush = ReturnType<typeof useEditorBrush>;
