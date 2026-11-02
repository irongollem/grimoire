// The one implementation of the PACK CONTENT layers of a map: floor, solid
// rock, walls and doors, corner joints, stamped objects, dressing and
// hazard/feature glyphs.
//
// The live editor (renderMap.ts) and the offline bake (bake.ts) used to each
// carry their own copy of this, and the copies drifted: the bake painted its
// joint fallback in a hard-coded colour. Every
// later change to what a map looks like (terrain, swinging doors, continuous
// variants, shadows) is made here, once.
//
// What stays with the callers is everything that is not pack content: the
// background fill, annotations, and all editor-only overlays. The two hooks
// (`afterGround`, `afterDressing`) let the live editor slot its grid and its
// derived-space outlines into the right place in the stack without this module
// knowing about either.
//
// Like renderMap this takes plain values only, so it must not import "vue".

import { DEFAULT_DOOR_LEAF, WALL_BAND_RATIO, isFlatCategory, type PackCategory } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { cellKey, type EdgeSeg, type ObjectCell } from "@/types/dungeonMap.types";
import { dressingSway, objectSway } from "@/cartographer/sway";
import { doorLeafArt, edgeTileOrigin, paintDoorLeaf } from "@/cartographer/doorLeaf";
import { classifyJoint } from "@/cartographer/edges";
import { paintAngledWalls } from "@/cartographer/drawAngledWalls";
import { edgeSegOf, isDrawn, ownedWall } from "@/cartographer/wallGraph";
import { paintGroundRegions } from "./clipFloor";
import { paintLights, renderLightLayer } from "@/cartographer/drawLights";
import { frameOf, type DrawMapInput, type Frame, type MakeCanvas, type ShadowLayer, type Target } from "@/cartographer/drawFrame";
import {
  drawDressing,
  dressingCellBounds,
  dressingDrawOrder,
  type Ctx2D,
} from "@/cartographer/dressing";

/**
 * Render-time shadows (#1065 decision 3). The light is top-left, so a shadow
 * falls down and to the right. A tall wall throws a long one, a prop
 * a short one (a third), and flat things (rubble, nests, glyphs) none at all:
 * an offset shadow makes a flat thing look lifted off the floor, so they only
 * get occlusion, the tight dark contact line where they meet the ground.
 * Every distance is a fraction of `tilePx`, so the same look holds at any zoom
 * and in the 128 px bake.
 */
export const SHADOW = {
  occlusion: { blur: 0.03, color: "rgba(10,8,6,0.55)" },
  raised: { dx: 0.11, dy: 0.14, blur: 0.08, color: "rgba(10,8,6,0.42)" },
  short: { dx: 0.11 / 3, dy: 0.14 / 3, blur: 0.04, color: "rgba(10,8,6,0.45)" },
  /** A stair down is a hollow: its top and left inner edges darken. */
  hollow: { span: 0.35, alpha: 0.7 },
} as const;

const INK = "10,8,6";

const EDGE_CATEGORY: Record<"H" | "V", Record<EdgeSeg["type"], PackCategory>> = {
  H: { wall: "wallSegmentH", doorClosed: "doorwayH", doorOpen: "doorwayH", grate: "edgeGrateH", sluice: "edgeSluiceH" },
  V: { wall: "wallSegmentV", doorClosed: "doorwayV", doorOpen: "doorwayV", grate: "edgeGrateV", sluice: "edgeSluiceV" },
};

// ── Continuous variants ────────────────────────────────────────────────────

/** V categories are the H tiles turned, so they share the H period. */
const PERIOD_CATEGORY: Partial<Record<PackCategory, PackCategory>> = {
  wallSegmentV: "wallSegmentH",
  curbV: "curbH",
};
const TEXTURE_2D = new Set<PackCategory>(["floor", "solidBlock", "terrainWater"]);
const ALONG_X = new Set<PackCategory>(["wallSegmentH", "curbH"]);
const ALONG_Y = new Set<PackCategory>(["wallSegmentV", "curbV"]);

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/**
 * The variant to draw at a position. A continuous category is one seamless
 * texture cut into an n by n sheet, and which piece goes where is decided by
 * the position, so neighbouring cells always continue each other. Any other
 * category, and a pack that declares fewer pieces than the position needs,
 * keeps the stored hash variant.
 */
export function variantAt(r: TilePackRuntime, category: PackCategory, x: number, y: number, stored: number): number {
  const n = r.manifest.continuous?.[PERIOD_CATEGORY[category] ?? category];
  if (!n || n < 1) return stored;
  if (TEXTURE_2D.has(category)) {
    return r.variantCount(category) < n * n ? stored : mod(x, n) + n * mod(y, n);
  }
  if (ALONG_X.has(category)) return r.variantCount(category) < n ? stored : mod(x, n);
  if (ALONG_Y.has(category)) return r.variantCount(category) < n ? stored : mod(y, n);
  return stored;
}

// ── Painters ───────────────────────────────────────────────────────────────
// Each paints one slice of the stack onto a target. The same painters feed the
// main canvas and the shadow classes' silhouette canvases, so a shadow can
// never be cast by something the map does not draw.

/**
 * One edge seg: the band tile where walls draw today, a wall's decal over it,
 * and for a door the leaf over the doorway (`paintDoorLeaf`).
 */
function drawEdgeSeg(
  ctx: Ctx2D,
  r: TilePackRuntime,
  seg: EdgeSeg,
  axis: "H" | "V",
  cellX: number,
  cellY: number,
  drawX: number,
  drawY: number,
  tilePx: number,
  omitLive: boolean,
): void {
  const halfTile = tilePx / 2;
  const { x: tileX, y: tileY } = edgeTileOrigin(axis, drawX, drawY, tilePx);
  const category = EDGE_CATEGORY[axis][seg.type];
  // Only a wall's pieces continue along it; a doorway or grate is one fitting.
  const variant = seg.type === "wall" ? variantAt(r, category, cellX, cellY, seg.variant) : seg.variant;
  ctx.drawImage(r.getTile(category, variant).source, tileX, tileY, tilePx, tilePx);

  if (seg.type === "wall" && seg.decal !== undefined && r.variantCount("wallDecal") > 0) {
    const decal = r.getTile("wallDecal", seg.decal).source;
    if (axis === "H") {
      ctx.drawImage(decal, tileX, tileY, tilePx, tilePx);
    } else {
      // The decal is drawn for an H wall; on a V wall it is turned like the leaf.
      ctx.save();
      ctx.translate(tileX + halfTile, tileY + halfTile);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(decal, -halfTile, -halfTile, tilePx, tilePx);
      ctx.restore();
    }
  }
  if (seg.type !== "doorClosed" && seg.type !== "doorOpen") return;
  // The live battle map draws this leaf itself, at the state the DM sets in play (#1073).
  if (omitLive && doorLeafArt(seg, r)) return;

  // A pack that does not set `doorLeaf` swings on the schema default.
  const hinge = r.manifest.doorLeaf ?? DEFAULT_DOOR_LEAF;
  paintDoorLeaf(ctx, r.getTile("doorLeaf", seg.variant).source, axis, tileX, tileY, tilePx, hinge, seg.type === "doorOpen");
}

/** Floor and terrain. A terrain cell draws its water INSTEAD of the floor tile. */
function paintGround(f: Frame, t: Target): void {
  paintGroundRegions(f, t, variantAt);
}

function fadeFrom(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, alpha: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, `rgba(${INK},${alpha})`);
  g.addColorStop(1, `rgba(${INK},0)`);
  return g;
}

function paintSolid(f: Frame, t: Target): void {
  const { tilePx, bounds, layers, runtime } = f;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const solid = layers.solidBlock[cellKey(x, y)];
      if (!solid) continue;
      const r = runtime(solid.pack_id);
      if (!r) continue;
      const tile = r.getTile("solidBlock", variantAt(r, "solidBlock", x, y, solid.variant));
      t.ctx.drawImage(tile.source, x * tilePx - t.ox, y * tilePx - t.oy, tilePx, tilePx);
    }
  }
}

// Edge walls — drawn AFTER the ground so walls visually mask the gridline
// they sit on. The wall tile is 128×128 with the painted strip in the
// CENTER (vertically for H, horizontally for V). We shift the tile by
// half a tile so the strip lands ON the gridline, straddling both
// adjacent cells equally. NW ownership: the edge key names the owner cell.
// Walked row by row, not in storage order: jsonb keeps no key order, and
// overlapping tiles must stack the same way every time.
function paintEdges(f: Frame, t: Target): void {
  const { tilePx, bounds, layers, runtime } = f;
  for (let y = bounds.minY; y <= bounds.maxY + 1; y++) {
    for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
      const drawX = x * tilePx - t.ox;
      const drawY = y * tilePx - t.oy;
      const north = ownedWall(layers, x, y, "N");
      if (isDrawn(north)) {
        const r = runtime(north.pack_id);
        if (r) drawEdgeSeg(t.ctx, r, edgeSegOf(north), "H", x, y, drawX, drawY, tilePx, f.omitLive);
      }
      const west = ownedWall(layers, x, y, "W");
      if (isDrawn(west)) {
        const r = runtime(west.pack_id);
        if (r) drawEdgeSeg(t.ctx, r, edgeSegOf(west), "V", x, y, drawX, drawY, tilePx, f.omitLive);
      }
    }
  }
  paintAngledWalls(f, t);
}

// Corner joints — fill / tile the gap at every grid intersection where H and
// V wall strips meet. Uses the pack's optional wallJoint directional art when
// available; falls back to a programmatic filled square otherwise. The window
// is one cell wider on every side: a joint sits on a grid intersection, so at
// the window's border it belongs to cells just outside it.
// A joint is exactly as thick as the walls meeting it — anything else
// steps in or out at every intersection.
function paintJoints(f: Frame, t: Target): void {
  const { tilePx, bounds, layers, runtime, defaultPackId } = f;
  const { ctx } = t;
  const thickness = tilePx * WALL_BAND_RATIO;
  const halfThick = thickness / 2;
  for (let jy = bounds.minY - 1; jy <= bounds.maxY + 1; jy++) {
    for (let jx = bounds.minX - 1; jx <= bounds.maxX + 1; jx++) {
      const wHWall = ownedWall(layers, jx - 1, jy, "N");
      const eHWall = ownedWall(layers, jx, jy, "N");
      const nVWall = ownedWall(layers, jx, jy - 1, "W");
      const sVWall = ownedWall(layers, jx, jy, "W");
      const wH = isDrawn(wHWall);
      const eH = isDrawn(eHWall);
      const nV = isDrawn(nVWall);
      const sV = isDrawn(sVWall);
      if (!(wH || eH) || !(nV || sV)) continue;
      const cornerX = jx * tilePx - t.ox;
      const cornerY = jy * tilePx - t.oy;
      const side = classifyJoint(wH, eH, nV, sV);
      // Check all four adjacent walls for pack ownership — avoids falling back to
      // the default pack and having corners change style when the active pack switches.
      const jointPackId =
        (isDrawn(eHWall) ? eHWall.pack_id : undefined) ??
        (isDrawn(wHWall) ? wHWall.pack_id : undefined) ??
        (isDrawn(sVWall) ? sVWall.pack_id : undefined) ??
        (isDrawn(nVWall) ? nVWall.pack_id : undefined) ??
        defaultPackId;
      const jointRt = jointPackId ? runtime(jointPackId) : null;
      // Like the walls it joins, a joint waits for its pack: a square painted
      // before the walls are would sit alone at the corner.
      if (!jointRt) continue;

      // Prefer directional tile, fall back to generic (no side), then procedural square.
      const directional = side && jointRt.variantCount("wallJoint", side) > 0
        ? jointRt.getTile("wallJoint", 0, side) : null;
      const generic = !directional?.source ? jointRt.getTile("wallJoint", 0) : null;
      const jointTile = directional ?? generic;
      if (jointTile && !jointTile.isPlaceholder) {
        ctx.drawImage(jointTile.source, cornerX - halfThick, cornerY - halfThick, thickness, thickness);
      } else {
        // Fallback square: use pack palette colour (wallJoint → wallSegmentH → stone default).
        const pal = jointRt.manifest.palette;
        const [r, g, b] = pal?.wallJoint ?? pal?.wallSegmentH ?? [40, 36, 32];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(cornerX - halfThick, cornerY - halfThick, thickness, thickness);
      }
    }
  }
}

type ObjectClass = "stairsUp" | "stairsDown" | "flat" | "standing";

function objectClass(category: PackCategory): ObjectClass {
  if (category === "stairsUp" || category === "stairsDown") return category;
  return isFlatCategory(category) ? "flat" : "standing";
}

/** The side a stair faces, from its stamp rotation (0° N, 90° E, 180° S, 270° W). */
function stairSide(rotation: number | undefined): "N" | "E" | "S" | "W" {
  if (rotation === undefined) return "N"; // a stamp placed unturned faces north
  const quarter = (((Math.round(rotation / 90) % 4) + 4) % 4);
  return (["N", "E", "S", "W"] as const)[quarter];
}

/** A cell's tile, turned about the cell centre when it has a rotation. */
function drawTurned(ctx: Ctx2D, source: CanvasImageSource, drawX: number, drawY: number, tilePx: number, rotation: number | undefined): void {
  if (!rotation) {
    ctx.drawImage(source, drawX, drawY, tilePx, tilePx);
    return;
  }
  ctx.save();
  ctx.translate(drawX + tilePx / 2, drawY + tilePx / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, -tilePx / 2, -tilePx / 2, tilePx, tilePx);
  ctx.restore();
}

/** The stamped objects of one class; a stair down also gets its hollow (with canvases). */
function paintObjects(f: Frame, t: Target, cls: ObjectClass): void {
  const { tilePx, bounds, layers, runtime } = f;
  const { ctx } = t;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const obj: ObjectCell | undefined = layers.object[cellKey(x, y)];
      if (!obj || objectClass(obj.category) !== cls) continue;
      const objRt = runtime(obj.pack_id);
      if (!objRt) continue;
      if (f.omitLive && objectSway(obj, objRt)) continue;
      const drawX = x * tilePx - t.ox;
      const drawY = y * tilePx - t.oy;
      // A stair is directional: its art comes per side, already facing that way, so the
      // stamp's rotation picks the side rather than turning the tile. Asking for it with
      // no side (as every object did) never found the art and drew the placeholder. A
      // pack without art for that side falls back to its N stair, turned (#1065).
      const side = cls === "stairsUp" || cls === "stairsDown" ? stairSide(obj.rotation) : null;
      const paint = (c: Ctx2D, px: number, py: number): void => {
        if (side && objRt.variantCount(obj.category, side) > 0) {
          c.drawImage(objRt.getTile(obj.category, obj.variant, side).source, px, py, tilePx, tilePx);
        } else {
          const tile = side ? objRt.getTile(obj.category, obj.variant, "N") : objRt.getTile(obj.category, obj.variant);
          drawTurned(c, tile.source, px, py, tilePx, obj.rotation);
        }
      };
      // A stair down is a hollow: its top and left inner edges darken. The fade is laid only over the stair's own
      // pixels (drawn alone into a cell canvas, faded `source-atop`), so a stair painted with a ragged natural outline
      // keeps it instead of sinking into a dark square of floor (Icy Cave, 16 Oct 2026). Without canvases (node tests,
      // an old browser) the stair draws without its hollow, as the map draws without shadows.
      const cell = cls === "stairsDown" ? f.makeCanvas?.(tilePx, tilePx) : null;
      if (cell) {
        paint(cell.ctx, 0, 0);
        const span = tilePx * SHADOW.hollow.span;
        cell.ctx.globalCompositeOperation = "source-atop";
        cell.ctx.fillStyle = fadeFrom(cell.ctx, 0, 0, 0, span, SHADOW.hollow.alpha);
        cell.ctx.fillRect(0, 0, tilePx, span);
        cell.ctx.fillStyle = fadeFrom(cell.ctx, 0, 0, span, 0, SHADOW.hollow.alpha);
        cell.ctx.fillRect(0, 0, span, tilePx);
        ctx.drawImage(cell.canvas, drawX, drawY, tilePx, tilePx);
      } else {
        paint(ctx, drawX, drawY);
      }
    }
  }
}

// Dressing layer (epic #1062) — props in stacking order. A prop is culled when
// its rotated footprint misses the window.
function paintDressing(f: Frame, t: Target, flat: boolean): void {
  const { tilePx, bounds, layers, dressing } = f;
  for (const [, placement] of dressingDrawOrder(layers.dressing)) {
    const prop = dressing.get(placement.prop_id);
    if ((prop?.flat === true) !== flat) continue;
    if (f.omitLive && dressingSway(prop)) continue;
    const cb = dressingCellBounds(placement, dressing);
    if (cb.maxX < bounds.minX || cb.minX > bounds.maxX || cb.maxY < bounds.minY || cb.minY > bounds.maxY) continue;
    drawDressing(t.ctx, placement, prop, placement.x * tilePx - t.ox, placement.y * tilePx - t.oy, tilePx);
  }
}

// Hazard / feature glyph layer (#804) — a placed trap's or feature's
// visual glyph, drawn above objects. There is no per-cell stored pack_id
// for these (`glyphs` is resolved live off the linked trap/feature — see
// cartographer/glyphs.ts), so they draw against `glyphPackId`. Variant is
// always 0 — this is a drawing hint, not an authored stamp.
function paintGlyphs(f: Frame, t: Target): void {
  const { tilePx, bounds, glyphs, glyphPackId, runtime } = f;
  const glyphRt = glyphPackId ? runtime(glyphPackId) : null;
  if (!glyphRt) return;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const category = glyphs[cellKey(x, y)];
      if (!category) continue;
      const tile = glyphRt.getTile(category, 0);
      t.ctx.drawImage(tile.source, x * tilePx - t.ox, y * tilePx - t.oy, tilePx, tilePx);
    }
  }
}


// ── Shadows ────────────────────────────────────────────────────────────────

/**
 * A canvas factory over `OffscreenCanvas`, or undefined where there is none
 * (node tests, an old browser): the map then draws without shadows.
 */
export function offscreenMakeCanvas(): MakeCanvas | undefined {
  if (typeof OffscreenCanvas === "undefined") return undefined;
  return (width, height) => {
    const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    const ctx = canvas.getContext("2d");
    return ctx ? { canvas, ctx } : null;
  };
}

/**
 * Cast one class's silhouette as a shadow onto `out`. The canvas drop shadow is
 * the only blur available that follows alpha, but it draws the shape as well;
 * so the shape is drawn far off to the left and the shadow offset back by the
 * same distance, and only the shadow lands.
 */
function castShadow(
  out: Ctx2D,
  silhouette: CanvasImageSource,
  width: number,
  height: number,
  spec: { dx: number; dy: number; blur: number; color: string },
): void {
  const far = width + 64;
  out.save();
  out.shadowColor = spec.color;
  out.shadowBlur = spec.blur;
  out.shadowOffsetX = spec.dx + far;
  out.shadowOffsetY = spec.dy;
  out.drawImage(silhouette, -far, 0, width, height);
  out.restore();
}

/**
 * Render ONLY the shadows for the window: one canvas, transparent except for
 * the shadows, ready to be laid over the ground. Split from the main draw so
 * the live editor can cache it; hovering must never re-blur the map. The layer
 * covers one cell more than the window on every side so a shadow cast from just
 * outside it still falls in. Returns null when canvases cannot be made.
 */
export function renderShadowLayer(input: DrawMapInput): ShadowLayer | null {
  const { makeCanvas, tilePx, origin, bounds } = input;
  if (!makeCanvas) return null;
  const wide = { minX: bounds.minX - 1, minY: bounds.minY - 1, maxX: bounds.maxX + 1, maxY: bounds.maxY + 1 };
  const width = Math.ceil((wide.maxX - wide.minX + 1) * tilePx);
  const height = Math.ceil((wide.maxY - wide.minY + 1) * tilePx);
  const out = makeCanvas(width, height);
  if (!out) return null;
  // The shadow keeps what the live layer draws (a swaying prop, a door leaf): it draws them moving or at the
  // DM's door state, their shadow stays on the floor.
  const f: Frame = { ...frameOf(input, wide), omitLive: false, showHiddenWalls: false };

  const silhouette = (paint: (t: Target) => void): CanvasImageSource | null => {
    const made = makeCanvas(width, height);
    if (!made) return null;
    paint({ ctx: made.ctx, ox: wide.minX * tilePx, oy: wide.minY * tilePx });
    return made.canvas;
  };
  const raised = silhouette((t) => {
    paintSolid(f, t);
    paintEdges(f, t);
    paintJoints(f, t);
  });
  const standing = silhouette((t) => {
    paintObjects(f, t, "standing");
    paintDressing(f, t, false);
  });
  const flat = silhouette((t) => {
    paintObjects(f, t, "flat");
    paintDressing(f, t, true);
  });
  if (!raised || !standing || !flat) return null;

  const px = (fraction: number): number => fraction * tilePx;
  const scaled = (s: { dx: number; dy: number; blur: number; color: string }) => ({
    dx: px(s.dx),
    dy: px(s.dy),
    blur: px(s.blur),
    color: s.color,
  });
  // Cast shadows first, then the tight occlusion on top of them.
  castShadow(out.ctx, raised, width, height, scaled(SHADOW.raised));
  castShadow(out.ctx, standing, width, height, scaled(SHADOW.short));
  const occlusion = { dx: 0, dy: 0, blur: px(SHADOW.occlusion.blur), color: SHADOW.occlusion.color };
  for (const s of [raised, standing, flat]) castShadow(out.ctx, s, width, height, occlusion);

  return {
    canvas: out.canvas,
    left: wide.minX * tilePx - origin.x,
    top: wide.minY * tilePx - origin.y,
    width,
    height,
  };
}

// ── The map ────────────────────────────────────────────────────────────────

/**
 * Draws the pack content in this order: ground material regions,
 * `afterGround`, stairs down, the shadows, flat objects and
 * flat dressing, the lights, standing objects and dressing, stairs up, walls and
 * everything in them (rock, edges, joints), `afterDressing`, glyphs. Without
 * shadows or lights the order is the same with that step simply absent.
 *
 * `pass: "ground"` draws the first half and then the rock; `pass: "standing"`
 * draws standing objects and dressing, stairs up, edges, joints,
 * `afterDressing` and glyphs, and nothing else.
 */
export function drawMapContent(input: DrawMapInput): void {
  const { ctx, origin, bounds, afterGround, afterDressing } = input;
  const f = frameOf(input, bounds);
  const t: Target = { ctx, ox: origin.x, oy: origin.y };

  const pass = input.pass ?? "all";

  if (pass !== "standing") {
    paintGround(f, t);
    afterGround?.();

    paintObjects(f, t, "stairsDown");

    const layer = input.shadowLayer !== undefined ? input.shadowLayer : input.shadows ? renderShadowLayer(input) : null;
    if (layer) ctx.drawImage(layer.canvas, layer.left, layer.top, layer.width, layer.height);

    // Flat things go above the shadow layer, which holds their own occlusion: that is a blurred copy of their whole
    // silhouette, so drawn over them it greys them out entirely instead of rimming them.
    paintObjects(f, t, "flat");
    paintDressing(f, t, true);
    // Light lands on the floor, the shadows and the flat things; what stands and the walls draw over it.
    if (input.lights) {
      const glow = input.lightLayer !== undefined ? input.lightLayer : renderLightLayer(input);
      if (glow) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.drawImage(glow.canvas, glow.left, glow.top, glow.width, glow.height);
        ctx.restore();
      } else {
        paintLights(f, t);
      }
    }
    // Rock is the outer mass (the Water set's open sea is solid rock), so the ground pass owns it: its live glints
    // are drawn under the grid. In the whole map it still draws after the stairs up, as it always did.
    if (pass === "ground") paintSolid(f, t);
  }

  if (pass !== "ground") {
    paintObjects(f, t, "standing");
    paintDressing(f, t, false);
    // A stair up rises to the walls' height, so it is drawn above the shadows.
    paintObjects(f, t, "stairsUp");

    if (pass === "all") paintSolid(f, t);
    paintEdges(f, t);
    paintJoints(f, t);

    afterDressing?.();
    paintGlyphs(f, t);
  }
}
