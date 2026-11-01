// Test-only: one round-brush disc applied the way the editor does (`applyBrushStroke` from the layers at pointer-down),
// with ids that count up so a run is repeatable.

import { applyBrushStroke } from "@/cartographer/brushWalls";
import type { Disc } from "@/cartographer/area";
import type { DungeonMapLayers, PackRef } from "@/types/dungeonMap.types";

export function brushDiscs(layers: DungeonMapLayers, discs: readonly Disc[], pack: PackRef, erase = false): DungeonMapLayers {
  let n = 0;
  return applyBrushStroke(layers, { discs }, { erase, pack, wall: { ...pack, variant: 0 }, newKey: () => `brush-${n++}` });
}

export const brushDisc = (layers: DungeonMapLayers, disc: Disc, pack: PackRef, erase = false): DungeonMapLayers =>
  brushDiscs(layers, [disc], pack, erase);
