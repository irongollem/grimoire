// Offline map renderer — produces a full-resolution OffscreenCanvas composite
// from a DungeonMap and its already-loaded TilePackRuntimes.
//
// bakeMap()       → WebP Blob (Atlas upload / Save to Atlas)
// bakeMapAsPng()  → PNG Blob  (client-side Download)
//
// Mirrors the render logic in CartographerEditorView but without viewport/zoom
// dependencies: cells are drawn at 1:1 scale (BASE_TILE_SIZE px per cell).

import { BASE_TILE_SIZE, type PackCategory } from "./packSchema";
import type { TilePackRuntime } from "./packLoader";
import type { DungeonMap } from "@/types/dungeonMap.types";

export interface BakeOptions {
  /** Cells of black padding around the painted extent. Default: 3. */
  paddingCells?: number;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function classifyJoint(
  wH: boolean, eH: boolean, nV: boolean, sV: boolean,
): string | null {
  const count = [wH, eH, nV, sV].filter(Boolean).length;
  if (count === 4) return "CROSS";
  if (count === 3) {
    if (!nV) return "T_N";
    if (!eH) return "T_E";
    if (!sV) return "T_S";
    if (!wH) return "T_W";
  }
  if (count === 2) {
    if (nV && eH) return "L_NE";
    if (sV && eH) return "L_SE";
    if (sV && wH) return "L_SW";
    if (nV && wH) return "L_NW";
  }
  return null;
}

function renderToCanvas(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  paddingCells: number,
): OffscreenCanvas {
  const ts = BASE_TILE_SIZE;
  const layers = map.layers;

  const allKeys = [
    ...Object.keys(layers.floor),
    ...Object.keys(layers.solidBlock),
    ...Object.keys(layers.object),
    ...Object.keys(layers.annotation),
  ];

  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  let any = false;
  for (const k of allKeys) {
    const [xs, ys] = k.split(",");
    const x = Number(xs), y = Number(ys);
    if (!any || x < minX) minX = x;
    if (!any || y < minY) minY = y;
    if (!any || x > maxX) maxX = x;
    if (!any || y > maxY) maxY = y;
    any = true;
  }

  const cols = maxX - minX + 1 + paddingCells * 2;
  const rows = maxY - minY + 1 + paddingCells * 2;
  const canvas = new OffscreenCanvas(cols * ts, rows * ts);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cols * ts, rows * ts);

  const rt = (packId: string): TilePackRuntime | null => runtimes.get(packId) ?? null;
  const dx = (cx: number) => (cx - minX + paddingCells) * ts;
  const dy = (cy: number) => (cy - minY + paddingCells) * ts;
  const halfTile = ts / 2;

  // Floor layer
  for (const [k, cell] of Object.entries(layers.floor)) {
    const [xs, ys] = k.split(",");
    const x = Number(xs), y = Number(ys);
    if (!cell.floor) continue;
    const r = rt(cell.floor.pack_id);
    if (!r) continue;
    const tile = r.getTile("floor", cell.floor.variant);
    ctx.drawImage(tile.source, dx(x), dy(y), ts, ts);
  }

  // Solid block layer
  for (const [k, cell] of Object.entries(layers.solidBlock)) {
    const [xs, ys] = k.split(",");
    const x = Number(xs), y = Number(ys);
    const r = rt(cell.pack_id);
    if (!r) continue;
    const tile = r.getTile("solidBlock", cell.variant);
    ctx.drawImage(tile.source, dx(x), dy(y), ts, ts);
  }

  // Wall segments
  for (const [k, cell] of Object.entries(layers.floor)) {
    const [xs, ys] = k.split(",");
    const x = Number(xs), y = Number(ys);
    if (cell.wallN) {
      const r = rt(cell.wallN.pack_id);
      if (r) {
        const cat: PackCategory =
          cell.wallN.type === "doorClosed" ? "doorClosedH"
          : cell.wallN.type === "doorOpen" ? "doorOpenH"
          : "wallSegmentH";
        const tile = r.getTile(cat, cell.wallN.variant);
        ctx.drawImage(tile.source, dx(x), dy(y) - halfTile, ts, ts);
      }
    }
    if (cell.wallW) {
      const r = rt(cell.wallW.pack_id);
      if (r) {
        const cat: PackCategory =
          cell.wallW.type === "doorClosed" ? "doorClosedV"
          : cell.wallW.type === "doorOpen" ? "doorOpenV"
          : "wallSegmentV";
        const tile = r.getTile(cat, cell.wallW.variant);
        ctx.drawImage(tile.source, dx(x) - halfTile, dy(y), ts, ts);
      }
    }
  }

  // Corner joints
  const thickness = ts * (35 / 128);
  const halfThick = thickness / 2;
  ctx.fillStyle = "rgb(40, 36, 32)";
  for (let jy = minY - 1; jy <= maxY + 2; jy++) {
    for (let jx = minX - 1; jx <= maxX + 2; jx++) {
      const wH = !!layers.floor[`${jx - 1},${jy}`]?.wallN;
      const eH = !!layers.floor[`${jx},${jy}`]?.wallN;
      const nV = !!layers.floor[`${jx},${jy - 1}`]?.wallW;
      const sV = !!layers.floor[`${jx},${jy}`]?.wallW;
      if (!(wH || eH) || !(nV || sV)) continue;
      const cx = dx(jx), cy = dy(jy);
      const side = classifyJoint(wH, eH, nV, sV);
      const jointPackId =
        layers.floor[`${jx},${jy}`]?.wallN?.pack_id ??
        layers.floor[`${jx - 1},${jy}`]?.wallN?.pack_id ??
        layers.floor[`${jx},${jy}`]?.wallW?.pack_id ??
        layers.floor[`${jx},${jy - 1}`]?.wallW?.pack_id;
      const jointRt = jointPackId ? rt(jointPackId) : null;
      const directional = side && jointRt && jointRt.variantCount("wallJoint", side) > 0
        ? jointRt.getTile("wallJoint", 0, side) : null;
      const generic = !directional?.source && jointRt ? jointRt.getTile("wallJoint", 0) : null;
      const jointTile = directional ?? generic;
      if (jointTile && !jointTile.isPlaceholder) {
        ctx.drawImage(jointTile.source, cx - halfThick, cy - halfThick, thickness, thickness);
      } else {
        const pal = jointRt?.manifest.palette;
        const [r, g, b] = pal?.wallJoint ?? pal?.wallSegmentH ?? [40, 36, 32];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(cx - halfThick, cy - halfThick, thickness, thickness);
      }
    }
  }

  // Object layer (with rotation)
  for (const [k, obj] of Object.entries(layers.object)) {
    const [xs, ys] = k.split(",");
    const x = Number(xs), y = Number(ys);
    const r = rt(obj.pack_id);
    if (!r) continue;
    const tile = r.getTile(obj.category as PackCategory, obj.variant);
    const rotation = obj.rotation ?? 0;
    const px = dx(x), py = dy(y);
    if (rotation) {
      ctx.save();
      ctx.translate(px + ts / 2, py + ts / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(tile.source, -ts / 2, -ts / 2, ts, ts);
      ctx.restore();
    } else {
      ctx.drawImage(tile.source, px, py, ts, ts);
    }
  }

  // Annotation layer
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontSize = Math.round(ts * 0.16);
  ctx.font = `bold ${fontSize}px sans-serif`;
  for (const [k, ann] of Object.entries(layers.annotation)) {
    if (!ann.text) continue;
    const [xs, ys] = k.split(",");
    const x = Number(xs), y = Number(ys);
    const px = dx(x), py = dy(y);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(ann.text, px + ts / 2 + 1, py + ts / 2 + 1, ts - 8);
    ctx.fillStyle = "rgba(255,240,180,0.95)";
    ctx.fillText(ann.text, px + ts / 2, py + ts / 2, ts - 8);
  }

  return canvas;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** Bake a map to a WebP Blob suitable for Atlas upload. */
export async function bakeMap(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  options: BakeOptions = {},
): Promise<Blob> {
  const canvas = renderToCanvas(map, runtimes, options.paddingCells ?? 3);
  let blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
  if (blob.size > MAX_BYTES) {
    blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.75 });
    if (blob.size > MAX_BYTES) {
      throw new Error("Map too large to publish. Crop more aggressively or split into sections.");
    }
  }
  return blob;
}

/** Bake a map to a PNG Blob for client-side download. */
export async function bakeMapAsPng(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  options: BakeOptions = {},
): Promise<Blob> {
  const canvas = renderToCanvas(map, runtimes, options.paddingCells ?? 3);
  return canvas.convertToBlob({ type: "image/png" });
}

/** Bake a map to a max-1024px PNG Blob for AI image input. */
export async function bakeMapForAI(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  options: BakeOptions = {},
): Promise<Blob> {
  const canvas = renderToCanvas(map, runtimes, options.paddingCells ?? 3);
  const MAX_DIM = 1024;
  if (canvas.width <= MAX_DIM && canvas.height <= MAX_DIM) {
    return canvas.convertToBlob({ type: "image/png" });
  }
  const scale = MAX_DIM / Math.max(canvas.width, canvas.height);
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const scaled = new OffscreenCanvas(w, h);
  scaled.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
  return scaled.convertToBlob({ type: "image/png" });
}
