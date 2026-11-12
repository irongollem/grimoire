/*
 * The chunk maths of a painted layer (#1181). A layer is stored as PAINT_CHUNK
 * (1024) pixel squares of the document, keyed "cx,cy"; the paint engine edits
 * it in smaller tiles, so the save path needs to know which chunks a set of
 * dirty tiles falls in. Pure: no canvas, no DOM.
 */
import { PAINT_CHUNK } from "./treatment";

export interface ChunkRect { x: number; y: number; w: number; h: number }

export const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

/** The chunk a key names, or null when it is not "cx,cy" of two whole numbers. */
export function parseChunkKey(key: string): { cx: number; cy: number } | null {
  const m = /^(\d+),(\d+)$/.exec(key);
  if (!m) return null;
  const cx = Number(m[1]);
  const cy = Number(m[2]);
  return Number.isSafeInteger(cx) && Number.isSafeInteger(cy) ? { cx, cy } : null;
}

/** How many chunks the document spans each way. */
export function chunkGrid(width: number, height: number): { cols: number; rows: number } {
  return { cols: Math.ceil(width / PAINT_CHUNK), rows: Math.ceil(height / PAINT_CHUNK) };
}

/** The chunks (as keys) that contain any of the tiles, given as `ty * layerCols + tx` keys of `tileSize` squares. */
export function chunksForTiles(tileKeys: Iterable<number>, tileSize: number, layerCols: number): Set<string> {
  const perChunk = PAINT_CHUNK / tileSize;
  const out = new Set<string>();
  for (const key of tileKeys) {
    const tx = key % layerCols;
    const ty = Math.floor(key / layerCols);
    out.add(chunkKey(Math.floor(tx / perChunk), Math.floor(ty / perChunk)));
  }
  return out;
}

/** Where a chunk sits in the document, clipped to the document's edge. */
export function chunkRect(cx: number, cy: number, width: number, height: number): ChunkRect {
  const x = cx * PAINT_CHUNK;
  const y = cy * PAINT_CHUNK;
  return { x, y, w: Math.max(0, Math.min(PAINT_CHUNK, width - x)), h: Math.max(0, Math.min(PAINT_CHUNK, height - y)) };
}
