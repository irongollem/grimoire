import { BASE_TILE_SIZE } from "./packSchema.ts";
import { canvasToWebp } from "./imageCodec.ts";

/**
 * Turn a normalized tile a quarter, half or three-quarter turn.
 *
 * How a vertical wall is made: not by rendering one, but by rotating the
 * horizontal wall that was. Generating both lets them drift —
 * `celestial-observatory` was authored tile by tile with a human approving
 * each, and its horizontal walls measure 22px against its vertical walls'
 * 14px. Rotation makes them identical by construction.
 *
 * Safe only while the art carries no light direction. The art bible forbids
 * directional cast shadows and the base references shade symmetrically across
 * the band for this reason: a gradient running light-to-dark across a
 * horizontal wall would, once turned, light every vertical wall from the side
 * and disagree with its neighbour at every corner.
 *
 * Square tiles only, so width and height never swap and the caller's slot
 * geometry still holds.
 */
export async function rotateTile(source: Blob, degrees: 90 | 180 | 270): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = BASE_TILE_SIZE;
  canvas.height = BASE_TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.translate(BASE_TILE_SIZE / 2, BASE_TILE_SIZE / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -BASE_TILE_SIZE / 2, -BASE_TILE_SIZE / 2, BASE_TILE_SIZE, BASE_TILE_SIZE);
  bitmap.close();
  return canvasToWebp(canvas, 0.9);
}
