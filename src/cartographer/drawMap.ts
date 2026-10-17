// The one implementation of the PACK CONTENT layers of a map: floor, solid
// rock, walls and doors, corner joints, stamped objects, dressing and
// hazard/feature glyphs.
//
// The live editor (renderMap.ts) and the offline bake (bake.ts) used to each
// carry their own copy of this, and the copies drifted: the bake never drew
// rounded corners and painted its joint fallback in a hard-coded colour. Every
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

import { DEFAULT_DOOR_LEAF, MAX_LIGHT_RANGE, WALL_BAND_RATIO, isFlatCategory, type PackCategory, type TileLight } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { cellKey, type CellKey, type DungeonMapLayers, type EdgeSeg, type ObjectCell } from "@/types/dungeonMap.types";
import { dressingSway, objectSway } from "@/cartographer/sway";
import { classifyJoint } from "@/cartographer/edges";
import { lightReachCells, lightStops } from "@/cartographer/lights";
import { lightMask, MASK_SAMPLES_PER_CELL, type LightMask } from "@/cartographer/lightMask";
import { collectOcclusion } from "@/cartographer/mapOcclusion";
import { occluders, type Occluders } from "@/lib/battlemap/occlusion";
import {
  drawDressing,
  dressingCellBounds,
  dressingCentre,
  dressingDrawOrder,
  type Ctx2D,
  type DressingCatalog,
} from "@/cartographer/dressing";

export interface ShadowLayer {
  canvas: CanvasImageSource;
  /** Screen position of the layer's top-left pixel. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export type MakeCanvas = (width: number, height: number) => { canvas: CanvasImageSource; ctx: Ctx2D } | null;

export interface DrawMapInput {
  ctx: Ctx2D;
  tilePx: number;
  /** Screen position of cell (0,0)'s top-left is (-origin.x, -origin.y): screenX = cellX * tilePx - origin.x. */
  origin: { x: number; y: number };
  /** Inclusive cell window to draw (the live viewport, or the bake's painted extent). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: DungeonMapLayers;
  /**
   * Which runtime draws a given pack. The live editor falls back to the active
   * pack's runtime for an unknown id; the bake deliberately does not, because
   * a bake must not draw a map in a pack it was not painted with.
   */
  runtime: (packId: string) => TilePackRuntime | null;
  /** The pack joints fall back to when no adjacent edge names one (live: currentPackId; bake: null). */
  defaultPackId: string | null;
  glyphs: Record<CellKey, PackCategory>;
  /** Pack the glyphs draw against; they carry no stored pack id of their own. */
  glyphPackId: string | null;
  dressing: DressingCatalog;
  /** Called after the ground (floor, terrain, sunk edges), before everything that stands (the live grid). */
  afterGround?: () => void;
  /** Called after dressing and the walls, before glyphs (the live derived-space outlines). */
  afterDressing?: () => void;
  /** Draw the glow of things that give light (a lantern, a fire). Needs no canvas, only the 2D context. */
  lights: boolean;
  /** Draw render-time shadows. Needs `makeCanvas` (or a prebuilt `shadowLayer`); without one the map draws without. */
  shadows?: boolean;
  /** A canvas factory for the shadow layers; absent where there is no offscreen canvas (node tests, old browsers). */
  makeCanvas?: MakeCanvas;
  /**
   * A shadow layer built earlier by `renderShadowLayer`, so the live editor can
   * reuse it across frames. `null` means "none could be made": draw without.
   */
  shadowLayer?: ShadowLayer | null;
  /**
   * The glow of the lights, masked to what each can see, built earlier by `renderLightLayer` so the live editor can
   * reuse it across frames. Absent: built here. `null` means "none could be made" (no canvas): the glow is drawn
   * straight onto the map, unmasked, so it crosses walls.
   */
  lightLayer?: ShadowLayer | null;
  /**
   * Light visibility masks kept between builds of the light layer. They are in cell units and depend only on the map's
   * walls and the light, not on pan or zoom, so the editor holds one per edit revision (`newLightMaskCache`) and a pan
   * only re-composites gradients. Absent (the bake): a fresh one, which simply misses.
   */
  lightMasks?: LightMaskCache;
  /**
   * Which part of the map to draw. The battle map lays its grid between the
   * floor and what stands on it, so a bake is made twice: `ground` is what the
   * grid draws over, `standing` what draws over the grid. Absent is `all`, the
   * whole map in one go (the live editor, the PNG download, the AI input).
   */
  pass?: MapPass;
  /**
   * Leave out the standing objects and Dressing that sway in the live battle map (`objectSway`, `dressingSway`), so
   * the live layer can draw them moving without a still copy under it. The shadow layer keeps them: their shadow
   * stays on the floor. Default false.
   */
  omitSway?: boolean;
}

export type MapPass = "all" | "ground" | "standing";

/**
 * Render-time shadows (#1065 decision 3). The light is top-left, so a shadow
 * falls down and to the right. A tall wall throws a long one, a prop or a curb
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
  /** Water sunk under its bank: the top and left bank shade it more, the light being top-left. */
  sunkEdge: { span: 0.3, near: 0.65, far: 0.35 },
  /** A stair down is a hollow: its top and left inner edges darken. */
  hollow: { span: 0.35, alpha: 0.7 },
  /** Curb post size, as a fraction of a tile. */
  post: 0.24,
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

// ── Curbs and posts (pure) ─────────────────────────────────────────────────

export interface CurbEdge {
  /** The gridline: an H curb runs from (x, y) to (x+1, y), a V curb from (x, y) to (x, y+1). */
  x: number;
  y: number;
  axis: "H" | "V";
  packId: string;
  /** Which side of the gridline the water is on: N or S for an H curb, W or E for a V curb. */
  waterSide: "N" | "S" | "E" | "W";
}

/**
 * Every edge between a terrain cell and a floor cell that is not terrain, and
 * that carries no edge of its own (a wall, door, grate or sluice already marks
 * it). The bank belongs to the terrain's pack. Automatic on purpose: a DM who
 * paints water gets its banks without a second tool.
 */
export function curbEdges(layers: DungeonMapLayers): CurbEdge[] {
  const out: CurbEdge[] = [];
  const hasSeg = (x: number, y: number, side: "wallN" | "wallW"): boolean => !!layers.floor[cellKey(x, y)]?.[side];
  for (const key of Object.keys(layers.terrain) as CellKey[]) {
    const terrain = layers.terrain[key];
    if (!terrain) continue;
    const [x, y] = key.split(",").map(Number);
    const { pack_id: packId } = terrain;
    const bank = (nx: number, ny: number): boolean =>
      !layers.terrain[cellKey(nx, ny)] && !!layers.floor[cellKey(nx, ny)]?.floor;
    if (bank(x, y - 1) && !hasSeg(x, y, "wallN")) out.push({ x, y, axis: "H", packId, waterSide: "S" });
    if (bank(x, y + 1) && !hasSeg(x, y + 1, "wallN")) out.push({ x, y: y + 1, axis: "H", packId, waterSide: "N" });
    if (bank(x - 1, y) && !hasSeg(x, y, "wallW")) out.push({ x, y, axis: "V", packId, waterSide: "E" });
    if (bank(x + 1, y) && !hasSeg(x + 1, y, "wallW")) out.push({ x: x + 1, y, axis: "V", packId, waterSide: "W" });
  }
  return out;
}

export interface CurbPost {
  /** The grid point. */
  x: number;
  y: number;
  packId: string;
}

/** A grid point gets a post where a curb meets a wall edge, or where an H and a V curb meet (a turn). */
export function curbPosts(layers: DungeonMapLayers): CurbPost[] {
  const curbs = curbEdges(layers);
  const h = new Map<string, string>();
  const v = new Map<string, string>();
  for (const c of curbs) (c.axis === "H" ? h : v).set(`${c.x},${c.y}`, c.packId);
  const points = new Map<string, { x: number; y: number }>();
  for (const c of curbs) {
    const [ex, ey] = c.axis === "H" ? [c.x + 1, c.y] : [c.x, c.y + 1];
    points.set(`${c.x},${c.y}`, { x: c.x, y: c.y });
    points.set(`${ex},${ey}`, { x: ex, y: ey });
  }
  const out: CurbPost[] = [];
  for (const { x, y } of points.values()) {
    const arms = [h.get(`${x - 1},${y}`), h.get(`${x},${y}`), v.get(`${x},${y - 1}`), v.get(`${x},${y}`)];
    const packId = arms.find((a) => a !== undefined);
    if (!packId) continue;
    const horizontal = h.has(`${x - 1},${y}`) || h.has(`${x},${y}`);
    const vertical = v.has(`${x},${y - 1}`) || v.has(`${x},${y}`);
    const wall =
      !!layers.floor[cellKey(x - 1, y)]?.wallN ||
      !!layers.floor[cellKey(x, y)]?.wallN ||
      !!layers.floor[cellKey(x, y - 1)]?.wallW ||
      !!layers.floor[cellKey(x, y)]?.wallW;
    if (wall || (horizontal && vertical)) out.push({ x, y, packId });
  }
  return out;
}

// ── Painters ───────────────────────────────────────────────────────────────
// Each paints one slice of the stack onto a target. The same painters feed the
// main canvas and the shadow classes' silhouette canvases, so a shadow can
// never be cast by something the map does not draw.

interface Frame {
  tilePx: number;
  bounds: DrawMapInput["bounds"];
  layers: DungeonMapLayers;
  runtime: DrawMapInput["runtime"];
  defaultPackId: string | null;
  glyphs: Record<CellKey, PackCategory>;
  glyphPackId: string | null;
  dressing: DressingCatalog;
  makeCanvas: MakeCanvas | undefined;
  /** Leave out what the live layer draws swaying (#1073); see `omitSway` on the input. */
  omitSway: boolean;
}

interface Target {
  ctx: Ctx2D;
  /** screenX = cellX * tilePx - ox. */
  ox: number;
  oy: number;
}

/**
 * One edge seg: the band tile where walls draw today, a wall's decal over it,
 * and for a door the leaf over the doorway. The leaf tile is the closed leaf
 * exactly where it sits in a `doorwayH` opening, so closed is the tile
 * unrotated and open is the same tile turned on its hinge. Canvas rotation is
 * clockwise, which swings an N edge's leaf into the cell south of it. A W edge
 * is the same construction turned a quarter clockwise about the edge tile's
 * centre, as its art is.
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
): void {
  const halfTile = tilePx / 2;
  // The band tile's top-left: shifted half a tile so its strip lands on the gridline.
  const tileX = axis === "H" ? drawX : drawX - halfTile;
  const tileY = axis === "H" ? drawY - halfTile : drawY;
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

  const leaf = r.getTile("doorLeaf", seg.variant).source;
  // A pack that does not set `doorLeaf` swings on the schema default.
  const { hingeX, hingeY, openDegrees } = r.manifest.doorLeaf ?? DEFAULT_DOOR_LEAF;
  const open = seg.type === "doorOpen";
  if (axis === "H" && !open) {
    ctx.drawImage(leaf, tileX, tileY, tilePx, tilePx);
    return;
  }
  ctx.save();
  if (axis === "V") {
    ctx.translate(tileX + halfTile, tileY + halfTile);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-halfTile, -halfTile);
  } else {
    ctx.translate(tileX, tileY);
  }
  // Now at the (turned) leaf tile's top-left; hinge the swing at its pin.
  if (open) {
    ctx.translate(hingeX * tilePx, hingeY * tilePx);
    ctx.rotate((openDegrees * Math.PI) / 180);
    ctx.drawImage(leaf, -hingeX * tilePx, -hingeY * tilePx, tilePx, tilePx);
  } else {
    ctx.drawImage(leaf, 0, 0, tilePx, tilePx);
  }
  ctx.restore();
}

/** Floor and terrain. A terrain cell draws its water INSTEAD of the floor tile. */
function paintGround(f: Frame, t: Target): void {
  const { tilePx, bounds, layers, runtime } = f;
  const { ctx } = t;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const key = cellKey(x, y);
      const sx = x * tilePx - t.ox;
      const sy = y * tilePx - t.oy;
      const terrain = layers.terrain[key];
      if (terrain) {
        const r = runtime(terrain.pack_id);
        if (r && r.variantCount("terrainWater") > 0) {
          const tile = r.getTile("terrainWater", variantAt(r, "terrainWater", x, y, terrain.variant));
          ctx.drawImage(tile.source, sx, sy, tilePx, tilePx);
          continue;
        }
        // A pack without water art leaves the floor showing rather than a hole.
      }
      const cell = layers.floor[key];
      if (!cell?.floor) continue;
      const r = runtime(cell.floor.pack_id);
      if (!r) continue;
      const tile = r.getTile("floor", variantAt(r, "floor", x, y, cell.floor.variant));
      ctx.drawImage(tile.source, sx, sy, tilePx, tilePx);
    }
  }
}

function fadeFrom(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, alpha: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, `rgba(${INK},${alpha})`);
  g.addColorStop(1, `rgba(${INK},0)`);
  return g;
}

/**
 * Darken each terrain cell inward from the sides that face a bank, so the
 * water reads as sunk below its curb. The top and left banks shade more: the
 * light comes from the top-left, so they stand in its way.
 */
function paintSunkEdges(f: Frame, t: Target): void {
  const { tilePx, bounds, layers, runtime } = f;
  const { ctx } = t;
  const span = tilePx * SHADOW.sunkEdge.span;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const terrain = layers.terrain[cellKey(x, y)];
      if (!terrain) continue;
      // Water whose banks lie flush with it (surf on a beach) is not sunk below them: no darkened edge, or the surf
      // and the waves would not meet (Water, 16 Oct 2026).
      if (runtime(terrain.pack_id)?.manifest.flush?.includes("curbH")) continue;
      const sx = x * tilePx - t.ox;
      const sy = y * tilePx - t.oy;
      const { near, far } = SHADOW.sunkEdge;
      if (!layers.terrain[cellKey(x, y - 1)]) {
        ctx.fillStyle = fadeFrom(ctx, sx, sy, sx, sy + span, near);
        ctx.fillRect(sx, sy, tilePx, span);
      }
      if (!layers.terrain[cellKey(x - 1, y)]) {
        ctx.fillStyle = fadeFrom(ctx, sx, sy, sx + span, sy, near);
        ctx.fillRect(sx, sy, span, tilePx);
      }
      if (!layers.terrain[cellKey(x, y + 1)]) {
        ctx.fillStyle = fadeFrom(ctx, sx, sy + tilePx, sx, sy + tilePx - span, far);
        ctx.fillRect(sx, sy + tilePx - span, tilePx, span);
      }
      if (!layers.terrain[cellKey(x + 1, y)]) {
        ctx.fillStyle = fadeFrom(ctx, sx + tilePx, sy, sx + tilePx - span, sy, far);
        ctx.fillRect(sx + tilePx - span, sy, span, tilePx);
      }
    }
  }
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
// adjacent cells equally. NW ownership: cell stores wallN/wallW.
function paintEdges(f: Frame, t: Target): void {
  const { tilePx, bounds, layers, runtime } = f;
  for (let y = bounds.minY; y <= bounds.maxY + 1; y++) {
    for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
      const cell = layers.floor[cellKey(x, y)];
      if (!cell) continue;
      const drawX = x * tilePx - t.ox;
      const drawY = y * tilePx - t.oy;
      if (cell.wallN) {
        const r = runtime(cell.wallN.pack_id);
        if (r) drawEdgeSeg(t.ctx, r, cell.wallN, "H", x, y, drawX, drawY, tilePx);
      }
      if (cell.wallW) {
        const r = runtime(cell.wallW.pack_id);
        if (r) drawEdgeSeg(t.ctx, r, cell.wallW, "V", x, y, drawX, drawY, tilePx);
      }
    }
  }
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
      const wH = !!layers.floor[cellKey(jx - 1, jy)]?.wallN;
      const eH = !!layers.floor[cellKey(jx, jy)]?.wallN;
      const nV = !!layers.floor[cellKey(jx, jy - 1)]?.wallW;
      const sV = !!layers.floor[cellKey(jx, jy)]?.wallW;
      if (!(wH || eH) || !(nV || sV)) continue;
      const cornerX = jx * tilePx - t.ox;
      const cornerY = jy * tilePx - t.oy;
      const side = classifyJoint(wH, eH, nV, sV);
      // Check all four adjacent walls for pack ownership — avoids falling back to
      // the default pack and having corners change style when the active pack switches.
      const jointPackId =
        layers.floor[cellKey(jx, jy)]?.wallN?.pack_id ??
        layers.floor[cellKey(jx - 1, jy)]?.wallN?.pack_id ??
        layers.floor[cellKey(jx, jy)]?.wallW?.pack_id ??
        layers.floor[cellKey(jx, jy - 1)]?.wallW?.pack_id ??
        defaultPackId;
      const jointRt = jointPackId ? runtime(jointPackId) : null;

      // M6 schema v2: wallRoundJoint — drawn at full tile size centered on the corner.
      // Only honoured when the pack ships REAL art for it — procedural placeholders
      // fall through to the standard wallJoint handling so rectangular rooms don't
      // unexpectedly grow rounded corners before real round-corner art exists.
      if (side?.startsWith("L_") && jointRt && jointRt.variantCount("wallRoundJoint", side) > 0) {
        const roundTile = jointRt.getTile("wallRoundJoint", 0, side);
        if (!roundTile.isPlaceholder) {
          ctx.drawImage(roundTile.source, cornerX - tilePx / 2, cornerY - tilePx / 2, tilePx, tilePx);
          continue;
        }
      }

      // Prefer directional tile, fall back to generic (no side), then procedural square.
      const directional = side && jointRt && jointRt.variantCount("wallJoint", side) > 0
        ? jointRt.getTile("wallJoint", 0, side) : null;
      const generic = !directional?.source && jointRt
        ? jointRt.getTile("wallJoint", 0) : null;
      const jointTile = directional ?? generic;
      if (jointTile && !jointTile.isPlaceholder) {
        ctx.drawImage(jointTile.source, cornerX - halfThick, cornerY - halfThick, thickness, thickness);
      } else {
        // Fallback square: use pack palette colour (wallJoint → wallSegmentH → stone default).
        const pal = jointRt?.manifest.palette;
        const [r, g, b] = pal?.wallJoint ?? pal?.wallSegmentH ?? [40, 36, 32];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(cornerX - halfThick, cornerY - halfThick, thickness, thickness);
      }
    }
  }
}

/** Curbs on the banks of terrain, positioned on the gridline exactly like wall tiles. */
/**
 * The curbs along every bank. Curb art is painted with the land along its top and the water along its bottom (`curbH`;
 * `curbV` is it turned a quarter clockwise, so its water is on the left), and each curb is turned a half where the
 * water lies the other way, so surf always washes up from the water onto the land (Water, 16 Oct 2026).
 * `shadowPass` leaves out the pieces a pack declares `flush`: they lie flat with the ground and cast nothing.
 */
function paintCurbs(f: Frame, t: Target, shadowPass = false): void {
  const { tilePx, bounds, runtime } = f;
  for (const c of curbEdges(f.layers)) {
    if (c.x < bounds.minX || c.x > bounds.maxX + 1 || c.y < bounds.minY || c.y > bounds.maxY + 1) continue;
    const r = runtime(c.packId);
    const category = c.axis === "H" ? "curbH" : "curbV";
    if (!r || r.variantCount(category) === 0) continue;
    if (shadowPass && r.manifest.flush?.includes(category)) continue;
    const tile = r.getTile(category, variantAt(r, category, c.x, c.y, 0));
    const drawX = c.x * tilePx - t.ox;
    const drawY = c.y * tilePx - t.oy;
    const flipped = c.waterSide === "N" || c.waterSide === "E";
    if (c.axis === "H") drawTurned(t.ctx, tile.source, drawX, drawY - tilePx / 2, tilePx, flipped ? 180 : undefined);
    else drawTurned(t.ctx, tile.source, drawX - tilePx / 2, drawY, tilePx, flipped ? 180 : undefined);
  }
}

function paintPosts(f: Frame, t: Target, shadowPass = false): void {
  const { tilePx, bounds, runtime } = f;
  const size = tilePx * SHADOW.post;
  for (const p of curbPosts(f.layers)) {
    if (p.x < bounds.minX || p.x > bounds.maxX + 1 || p.y < bounds.minY || p.y > bounds.maxY + 1) continue;
    const r = runtime(p.packId);
    const count = r ? r.variantCount("curbPost") : 0;
    if (!r || count === 0) continue;
    if (shadowPass && r.manifest.flush?.includes("curbPost")) continue;
    const tile = r.getTile("curbPost", Math.abs(p.x * 31 + p.y * 17) % count);
    t.ctx.drawImage(tile.source, p.x * tilePx - t.ox - size / 2, p.y * tilePx - t.oy - size / 2, size, size);
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
      if (f.omitSway && objectSway(obj, objRt)) continue;
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
    if (f.omitSway && dressingSway(prop)) continue;
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

// ── Lights ─────────────────────────────────────────────────────────────────

export interface LightSource {
  /** Centre of the source, in cells. */
  x: number;
  y: number;
  light: TileLight;
}

/**
 * Every light source on a map: object cells, wall decals and dressing props whose pack (or library row) declares
 * one. A wall decal sits on its edge's midpoint (edges are stored NW-owned: a cell's `wallN` runs along its top,
 * its `wallW` along its left). With `reach`, only sources inside that inclusive cell window (the draw window plus
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
    const cell = layers.floor[key];
    for (const [seg, sx, sy] of [[cell?.wallN, x + 0.5, y], [cell?.wallW, x, y + 0.5]] as const) {
      if (seg?.type !== "wall" || seg.decal === undefined) continue;
      const decalLight = runtime(seg.pack_id)?.manifest.lights?.wallDecal?.[seg.decal];
      if (decalLight) out.push({ x: sx, y: sy, light: decalLight });
    }
  };
  if (reach) {
    for (let y = reach.minY; y <= reach.maxY; y++) for (let x = reach.minX; x <= reach.maxX; x++) visit(x, y);
  } else {
    const keys = new Set([...Object.keys(layers.object), ...Object.keys(layers.floor)]);
    for (const key of keys) {
      const [xs, ys] = key.split(",");
      visit(Number(xs), Number(ys));
    }
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
function paintLights(f: Frame, t: Target): void {
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

/** The occluders of one map revision and the mask of each light computed against them. */
export interface LightMaskCache {
  occ: Occluders;
  masks: Map<string, { mask: LightMask; x0: number; y0: number }>;
  /** How many masks were computed (not served from `masks`); lets a test see a cache hit. */
  computed: number;
}

export function newLightMaskCache(layers: DungeonMapLayers): LightMaskCache {
  // Built once, in map cells (origin 0): the same lists the veil and vision read.
  return { occ: occluders(collectOcclusion(layers, 0, 0)), masks: new Map(), computed: 0 };
}

/**
 * The glow of every light on its own canvas, each masked to the part of its reach it has a clear line to, so a torch
 * does not tint the room behind a wall (#1073 story 6). A light's bounding square is sampled at `MASK_SAMPLES_PER_CELL`
 * per cell (`lightMask`), the result written as alpha into a small canvas and laid through the gradient with
 * `destination-in`, scaled up with smoothing so the edge is soft rather than a staircase. Returns null where canvases
 * cannot be made (node tests, an old browser): `drawMapContent` then draws the gradients unmasked, the same way the
 * shadows degrade. Like the shadow layer it is a separate canvas so the editor can cache it; it covers exactly the
 * window, and a light that has nothing in the way skips the mask.
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
    const glow = occ.index.empty ? null : makeCanvas(w, h);
    const maskCanvas = glow ? makeCanvas((fx1 - fx0) * MASK_SAMPLES_PER_CELL, (fy1 - fy0) * MASK_SAMPLES_PER_CELL) : null;
    if (glow && maskCanvas) {
      const cacheKey = `${x},${y},${reach}`;
      let held = cache.masks.get(cacheKey);
      if (!held) {
        held = { mask: lightMask(occ, x, y, reach, fx0, fy0, fx1, fy1), x0: fx0, y0: fy0 };
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
      // Nothing to wall it off (or no spare canvas): the plain gradient over its square.
      out.ctx.translate(left, top);
      out.ctx.fillStyle = lightGradient(out.ctx, cx, cy, radius, light);
      out.ctx.fillRect(0, 0, w, h);
    }
    out.ctx.restore();
  }
  return { canvas: out.canvas, left: bounds.minX * tilePx - origin.x, top: bounds.minY * tilePx - origin.y, width, height };
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

const frameOf = (input: DrawMapInput, bounds: DrawMapInput["bounds"]): Frame => ({
  tilePx: input.tilePx,
  bounds,
  layers: input.layers,
  runtime: input.runtime,
  defaultPackId: input.defaultPackId,
  glyphs: input.glyphs,
  glyphPackId: input.glyphPackId,
  dressing: input.dressing,
  makeCanvas: input.makeCanvas,
  omitSway: input.omitSway ?? false,
});

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
  // The shadow keeps what sways: the live layer draws the prop moving, its shadow stays on the floor.
  const f: Frame = { ...frameOf(input, wide), omitSway: false };

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
  const low = silhouette((t) => {
    paintCurbs(f, t, true);
    paintPosts(f, t, true);
  });
  const standing = silhouette((t) => {
    paintObjects(f, t, "standing");
    paintDressing(f, t, false);
  });
  const flat = silhouette((t) => {
    paintObjects(f, t, "flat");
    paintDressing(f, t, true);
  });
  if (!raised || !low || !standing || !flat) return null;

  const px = (fraction: number): number => fraction * tilePx;
  const scaled = (s: { dx: number; dy: number; blur: number; color: string }) => ({
    dx: px(s.dx),
    dy: px(s.dy),
    blur: px(s.blur),
    color: s.color,
  });
  // Cast shadows first, then the tight occlusion on top of them.
  castShadow(out.ctx, raised, width, height, scaled(SHADOW.raised));
  castShadow(out.ctx, low, width, height, scaled(SHADOW.short));
  castShadow(out.ctx, standing, width, height, scaled(SHADOW.short));
  const occlusion = { dx: 0, dy: 0, blur: px(SHADOW.occlusion.blur), color: SHADOW.occlusion.color };
  for (const s of [raised, low, standing, flat]) castShadow(out.ctx, s, width, height, occlusion);

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
 * Draws the pack content in this order: ground (floor, terrain, sunk edges),
 * `afterGround`, stairs down, the shadows, curbs and posts, flat objects and
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
    paintSunkEdges(f, t);
    afterGround?.();

    paintObjects(f, t, "stairsDown");

    const layer = input.shadowLayer !== undefined ? input.shadowLayer : input.shadows ? renderShadowLayer(input) : null;
    if (layer) ctx.drawImage(layer.canvas, layer.left, layer.top, layer.width, layer.height);

    paintCurbs(f, t);
    paintPosts(f, t);
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
