import { bakeMapAsPng, computeBakedDimensions } from "@/cartographer/bake";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { PackCategory } from "@/cartographer/packSchema";
import { downloadBlob } from "@/lib/downloadBlob";
import { drawingToUvttInput } from "@/lib/mapBring/exportVtt";
import { writeUniversalVtt } from "@/lib/mapImport/universalVtt";
import { paintedCellCount, type CellKey, type DungeonMap } from "@/types/dungeonMap.types";

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The picture could not be read for export."));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Bakes the Drawing to a picture and downloads it with its walls, doors and lights as `<name>.dd2vtt`, the format
 * Foundry, Roll20 importers and Owlbear read (#1125 decision 7). The grid is the bake's: one square is the bake's
 * pixels per cell.
 */
export async function exportDrawingAsVtt(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  dressing: DressingCatalog,
  glyphs: Record<CellKey, PackCategory>,
  fileName: string,
): Promise<void> {
  if (paintedCellCount(map.layers) === 0) throw new Error("Draw something first, then export it.");
  const dims = computeBakedDimensions(map, dressing);
  const png = await bakeMapAsPng(map, runtimes, dressing, {}, glyphs);
  const bitmap = await createImageBitmap(png);
  const pixelsPerGrid = bitmap.width / dims.cols;
  bitmap.close();
  const input = drawingToUvttInput({
    layers: map.layers,
    runtimes,
    dressing,
    originCellX: dims.originCellX,
    originCellY: dims.originCellY,
    cols: dims.cols,
    rows: dims.rows,
    pixelsPerGrid,
    imageBase64: await toBase64(png),
  });
  downloadBlob(new Blob([JSON.stringify(writeUniversalVtt(input))], { type: "application/json" }), `${fileName}.dd2vtt`);
}
