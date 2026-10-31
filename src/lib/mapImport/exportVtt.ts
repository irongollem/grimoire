/**
 * A Drawing as a Universal VTT file for another tool (#1125, frame 07 "Export for another VTT"). The picture is
 * the bake; the walls, doors and lights are what the app itself uses for sight and light, in the bake's grid units.
 */
import type { DressingCatalog } from "@/cartographer/dressing";
import { gatherLightSources } from "@/cartographer/drawLights";
import { collectOcclusion } from "@/cartographer/mapOcclusion";
import { FEET_PER_CELL } from "@/cartographer/packSchema";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";
import type { UvttDoor, UvttLight, UvttSegment, UvttWriteInput } from "@/lib/mapImport/universalVtt";
import type { TilePackRuntime } from "@/cartographer/packLoader";

export interface DrawingExportInput {
  layers: DungeonMapLayers;
  runtimes: Map<string, TilePackRuntime>;
  dressing: DressingCatalog;
  /** The map cell that is the bake's top-left cell (`computeBakedDimensions`). */
  originCellX: number;
  originCellY: number;
  cols: number;
  rows: number;
  pixelsPerGrid: number;
  imageBase64: string;
}

export function drawingToUvttInput(input: DrawingExportInput): UvttWriteInput {
  const { walls, doors } = collectOcclusion(input.layers, input.originCellX, input.originCellY);

  const segments: UvttSegment[] = walls.map((w) => ({ a: [w.a[0], w.a[1]], b: [w.b[0], w.b[1]] }));
  const portals: UvttDoor[] = doors.map((d) => ({ a: [d.a[0], d.a[1]], b: [d.b[0], d.b[1]], open: d.open }));

  const lights: UvttLight[] = gatherLightSources(
    input.layers,
    (packId) => input.runtimes.get(packId) ?? null,
    input.dressing,
    null,
  ).map(({ x, y, light }) => ({
    x: x - input.originCellX,
    y: y - input.originCellY,
    // A light's reach is its bright radius and its dim ring together; the file has one number.
    rangeCells: (light.bright + light.dim) / FEET_PER_CELL,
    intensity: light.intensity === undefined ? 1 : light.intensity,
    color: light.color,
  }));

  return {
    imageBase64: input.imageBase64,
    cols: input.cols,
    rows: input.rows,
    pixelsPerGrid: input.pixelsPerGrid,
    walls: segments,
    doors: portals,
    lights,
  };
}
