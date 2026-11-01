// The glow of the things that give light (a lantern, a fire): finding the sources, the gradient each lays, and the
// layer that masks each to what it can see (#1073 story 6). Split out of drawMap.ts, which calls `paintLights` and
// `renderLightLayer` between the flat things and the standing ones.

import { MAX_LIGHT_RANGE, type TileLight } from "@/cartographer/packSchema";
import { cellKey, type DungeonMapLayers, type ObjectCell } from "@/types/dungeonMap.types";
import { lightReachCells, lightStops } from "@/cartographer/lights";
import { lightMask, MASK_SAMPLES_PER_CELL, type GroundTest, type LightMaskCache } from "@/cartographer/lightMask";
import { collectOcclusion } from "@/cartographer/mapOcclusion";
import { occluders } from "@/lib/battlemap/occlusion";
import { dressingCentre, type Ctx2D, type DressingCatalog } from "@/cartographer/dressing";
import { latticeWalls } from "@/cartographer/wallGraph";
import { frameOf, type DrawMapInput, type Frame, type ShadowLayer, type Target } from "@/cartographer/drawFrame";

export interface LightSource {
  /** Centre of the source, in cells. */
  x: number;
  y: number;
  light: TileLight;
}

/**
 * Every light source on a map: object cells, wall decals, dressing props whose pack (or library row) declares
 * one, and the lights the DM placed by hand. A wall decal sits on its wall's midpoint. With `reach`, only sources inside that inclusive cell window (the draw window plus
 * `MAX_LIGHT_RANGE`, so a lantern just off screen still lights the edge) are returned; with null, the whole map.
 * No window and no canvas: the live snapshot (#1073) reuses it.
 */
export function gatherLightSources(
  layers: DungeonMapLayers,
  runtime: DrawMapInput["runtime"],
  dressing: DressingCatalog,
  reach: DrawMapInput["bounds"] | null,
): LightSource[] {
  const out: LightSource[] = [];
  const visit = (x: number, y: number): void => {
    const key = cellKey(x, y);
    const obj: ObjectCell | undefined = layers.object[key];
    const objLight = obj ? runtime(obj.pack_id)?.manifest.lights?.[obj.category]?.[obj.variant] : null;
    if (objLight) out.push({ x: x + 0.5, y: y + 0.5, light: objLight });
  };
  if (reach) {
    for (let y = reach.minY; y <= reach.maxY; y++) for (let x = reach.minX; x <= reach.maxX; x++) visit(x, y);
  } else {
    for (const key of Object.keys(layers.object)) {
      const [xs, ys] = key.split(",");
      visit(Number(xs), Number(ys));
    }
  }
  for (const { wall } of latticeWalls(layers)) {
    if (wall.type !== "wall" || wall.decal === undefined) continue;
    const decalLight = runtime(wall.pack_id)?.manifest.lights?.wallDecal?.[wall.decal];
    if (!decalLight) continue;
    const mx = (wall.a[0] + wall.b[0]) / 2;
    const my = (wall.a[1] + wall.b[1]) / 2;
    const cx = Math.floor(mx);
    const cy = Math.floor(my);
    if (reach && (cx < reach.minX || cx > reach.maxX || cy < reach.minY || cy > reach.maxY)) continue;
    out.push({ x: mx, y: my, light: decalLight });
  }
  for (const placed of Object.values(layers.lights)) {
    if (reach && (placed.x < reach.minX || placed.x > reach.maxX + 1 || placed.y < reach.minY || placed.y > reach.maxY + 1)) continue;
    out.push({ x: placed.x, y: placed.y, light: placed.light });
  }
  for (const placement of Object.values(layers.dressing)) {
    const prop = dressing.get(placement.prop_id);
    if (!prop?.light) continue;
    const c = dressingCentre(placement, prop.footprint_w, prop.footprint_h);
    if (reach && (c.x < reach.minX || c.x > reach.maxX + 1 || c.y < reach.minY || c.y > reach.maxY + 1)) continue;
    out.push({ x: c.x, y: c.y, light: prop.light });
  }
  return out;
}

function gatherLights(f: Frame): LightSource[] {
  const { bounds, layers, runtime, dressing } = f;
  return gatherLightSources(layers, runtime, dressing, {
    minX: bounds.minX - MAX_LIGHT_RANGE,
    minY: bounds.minY - MAX_LIGHT_RANGE,
    maxX: bounds.maxX + MAX_LIGHT_RANGE,
    maxY: bounds.maxY + MAX_LIGHT_RANGE,
  });
}

/**
 * The glow of every light, laid with `screen` so overlapping glows mix and brighten without clipping to flat colour
 * (additive `lighter` flooded whole rooms once several lights met, 16 Oct 2026). Each is one radial
 * gradient filled over its bounding square: holding through the bright light, fading through the dim ring to nothing.
 */
export function paintLights(f: Frame, t: Target): void {
  const { tilePx } = f;
  const { ctx } = t;
  for (const { x, y, light } of gatherLights(f)) {
    const cx = x * tilePx - t.ox;
    const cy = y * tilePx - t.oy;
    const radius = lightReachCells(light) * tilePx;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = lightGradient(ctx, cx, cy, radius, light);
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  }
}

function lightGradient(ctx: Ctx2D, cx: number, cy: number, radius: number, light: TileLight): CanvasGradient {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  for (const [offset, color] of lightStops(light)) gradient.addColorStop(offset, color);
  return gradient;
}

/**
 * Where the glow may land: a cell with a floor tile, water or solid rock.
 */
export function groundTest(layers: DungeonMapLayers): GroundTest {
  return (px, py) => {
    const key = cellKey(Math.floor(px), Math.floor(py));
    return Boolean(layers.floor[key]?.floor) || key in layers.terrain || key in layers.solidBlock;
  };
}

export function newLightMaskCache(layers: DungeonMapLayers): LightMaskCache {
  // Built once, in map cells (origin 0): the same lists the veil and vision read.
  return { occ: occluders(collectOcclusion(layers, 0, 0)), onGround: groundTest(layers), masks: new Map(), computed: 0 };
}

/**
 * The glow of every light on its own canvas, each masked to the part of its reach it has a clear line to, so a torch
 * does not tint the room behind a wall (#1073 story 6). A light's bounding square is sampled at `MASK_SAMPLES_PER_CELL`
 * per cell (`lightMask`), the result written as alpha into a small canvas and laid through the gradient with
 * `destination-in`, scaled up with smoothing so the edge is soft rather than a staircase. Returns null where canvases
 * cannot be made (node tests, an old browser): `drawMapContent` then draws the gradients unmasked, the same way the
 * shadows degrade. Like the shadow layer it is a separate canvas so the editor can cache it; it covers exactly the
 * window, and every light is masked to painted ground, so none skips it.
 */
export function renderLightLayer(input: DrawMapInput): ShadowLayer | null {
  const { makeCanvas, tilePx, origin, bounds } = input;
  if (!makeCanvas) return null;
  const width = Math.ceil((bounds.maxX - bounds.minX + 1) * tilePx);
  const height = Math.ceil((bounds.maxY - bounds.minY + 1) * tilePx);
  const out = makeCanvas(width, height);
  if (!out) return null;
  const cache = input.lightMasks ?? newLightMaskCache(input.layers);
  const occ = cache.occ;

  for (const { x, y, light } of gatherLights(frameOf(input, bounds))) {
    const reach = lightReachCells(light);
    const x0 = Math.max(bounds.minX, Math.floor(x - reach));
    const y0 = Math.max(bounds.minY, Math.floor(y - reach));
    const x1 = Math.min(bounds.maxX + 1, Math.ceil(x + reach));
    const y1 = Math.min(bounds.maxY + 1, Math.ceil(y + reach));
    if (x1 <= x0 || y1 <= y0) continue;
    // The mask covers the light's whole square so it does not depend on the window; the canvas only the visible part.
    const fx0 = Math.floor(x - reach);
    const fy0 = Math.floor(y - reach);
    const fx1 = Math.ceil(x + reach);
    const fy1 = Math.ceil(y + reach);
    const left = (x0 - bounds.minX) * tilePx;
    const top = (y0 - bounds.minY) * tilePx;
    const w = Math.ceil((x1 - x0) * tilePx);
    const h = Math.ceil((y1 - y0) * tilePx);
    const cx = (x - bounds.minX) * tilePx - left;
    const cy = (y - bounds.minY) * tilePx - top;
    const radius = reach * tilePx;

    out.ctx.save();
    out.ctx.globalCompositeOperation = "screen";
    const glow = makeCanvas(w, h);
    const maskCanvas = glow ? makeCanvas((fx1 - fx0) * MASK_SAMPLES_PER_CELL, (fy1 - fy0) * MASK_SAMPLES_PER_CELL) : null;
    if (glow && maskCanvas) {
      const cacheKey = `${x},${y},${reach}`;
      let held = cache.masks.get(cacheKey);
      if (!held) {
        held = { mask: lightMask(occ, x, y, reach, fx0, fy0, fx1, fy1, cache.onGround), x0: fx0, y0: fy0 };
        cache.masks.set(cacheKey, held);
        cache.computed++;
      }
      const { mask } = held;
      const image = maskCanvas.ctx.createImageData(mask.width, mask.height);
      for (let k = 0; k < mask.alpha.length; k++) image.data[k * 4 + 3] = mask.alpha[k];
      maskCanvas.ctx.putImageData(image, 0, 0);
      glow.ctx.fillStyle = lightGradient(glow.ctx, cx, cy, radius, light);
      glow.ctx.fillRect(0, 0, w, h);
      glow.ctx.globalCompositeOperation = "destination-in";
      glow.ctx.imageSmoothingEnabled = true;
      glow.ctx.drawImage(maskCanvas.canvas, (fx0 - x0) * tilePx, (fy0 - y0) * tilePx, (fx1 - fx0) * tilePx, (fy1 - fy0) * tilePx);
      out.ctx.drawImage(glow.canvas, left, top, w, h);
    } else {
      // No spare canvas: the plain gradient over its square.
      out.ctx.translate(left, top);
      out.ctx.fillStyle = lightGradient(out.ctx, cx, cy, radius, light);
      out.ctx.fillRect(0, 0, w, h);
    }
    out.ctx.restore();
  }
  return { canvas: out.canvas, left: bounds.minX * tilePx - origin.x, top: bounds.minY * tilePx - origin.y, width, height };
}
