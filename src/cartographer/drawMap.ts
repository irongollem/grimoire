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

import { WALL_BAND_RATIO, type PackCategory } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { cellKey, type CellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import { classifyJoint } from "@/cartographer/edges";
import {
  drawDressing,
  dressingCellBounds,
  dressingDrawOrder,
  type Ctx2D,
  type DressingCatalog,
} from "@/cartographer/dressing";

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
  /** Called after floor and solid rock, before edges (the live grid). */
  afterGround?: () => void;
  /** Called after dressing, before glyphs (the live derived-space outlines). */
  afterDressing?: () => void;
}

export function drawMapContent(input: DrawMapInput): void {
  const {
    ctx,
    tilePx,
    origin,
    bounds,
    layers,
    runtime,
    defaultPackId,
    glyphs,
    glyphPackId,
    dressing,
    afterGround,
    afterDressing,
  } = input;
  const { minX, minY, maxX, maxY } = bounds;
  const sx = (cx: number): number => cx * tilePx - origin.x;
  const sy = (cy: number): number => cy * tilePx - origin.y;

  // Floor layer
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cell = layers.floor[cellKey(x, y)];
      if (!cell?.floor) continue;
      const r = runtime(cell.floor.pack_id);
      if (!r) continue;
      const tile = r.getTile("floor", cell.floor.variant);
      ctx.drawImage(tile.source, sx(x), sy(y), tilePx, tilePx);
    }
  }

  // SolidBlock layer — full-cell thick walls rendered above the floor
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const solid = layers.solidBlock[cellKey(x, y)];
      if (!solid) continue;
      const r = runtime(solid.pack_id);
      if (!r) continue;
      const tile = r.getTile("solidBlock", solid.variant);
      ctx.drawImage(tile.source, sx(x), sy(y), tilePx, tilePx);
    }
  }

  afterGround?.();

  // Edge walls — drawn AFTER the ground so walls visually mask the gridline
  // they sit on. The wall tile is 128×128 with the painted strip in the
  // CENTER (vertically for H, horizontally for V). We shift the tile by
  // half a tile so the strip lands ON the gridline, straddling both
  // adjacent cells equally. NW ownership: cell stores wallN/wallW.
  const halfTile = tilePx / 2;
  for (let y = minY; y <= maxY + 1; y++) {
    for (let x = minX; x <= maxX + 1; x++) {
      const cell = layers.floor[cellKey(x, y)];
      if (!cell) continue;
      const drawX = sx(x);
      const drawY = sy(y);
      if (cell.wallN) {
        const seg = cell.wallN;
        const r = runtime(seg.pack_id);
        if (r) {
          const cat: PackCategory = seg.type === "doorClosed" ? "doorClosedH"
            : seg.type === "doorOpen" ? "doorOpenH" : "wallSegmentH";
          const tile = r.getTile(cat, seg.variant);
          ctx.drawImage(tile.source, drawX, drawY - halfTile, tilePx, tilePx);
        }
      }
      if (cell.wallW) {
        const seg = cell.wallW;
        const r = runtime(seg.pack_id);
        if (r) {
          const cat: PackCategory = seg.type === "doorClosed" ? "doorClosedV"
            : seg.type === "doorOpen" ? "doorOpenV" : "wallSegmentV";
          const tile = r.getTile(cat, seg.variant);
          ctx.drawImage(tile.source, drawX - halfTile, drawY, tilePx, tilePx);
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
  const thickness = tilePx * WALL_BAND_RATIO;
  const halfThick = thickness / 2;
  for (let jy = minY - 1; jy <= maxY + 1; jy++) {
    for (let jx = minX - 1; jx <= maxX + 1; jx++) {
      const wH = !!layers.floor[cellKey(jx - 1, jy)]?.wallN;
      const eH = !!layers.floor[cellKey(jx, jy)]?.wallN;
      const nV = !!layers.floor[cellKey(jx, jy - 1)]?.wallW;
      const sV = !!layers.floor[cellKey(jx, jy)]?.wallW;
      if (!(wH || eH) || !(nV || sV)) continue;
      const cornerX = sx(jx);
      const cornerY = sy(jy);
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

  // Object layer — stamps drawn above walls
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const obj = layers.object[cellKey(x, y)];
      if (!obj) continue;
      const objRt = runtime(obj.pack_id);
      if (!objRt) continue;
      const drawX = sx(x);
      const drawY = sy(y);
      const tile = objRt.getTile(obj.category as PackCategory, obj.variant);
      if (obj.rotation) {
        ctx.save();
        ctx.translate(drawX + tilePx / 2, drawY + tilePx / 2);
        ctx.rotate((obj.rotation * Math.PI) / 180);
        ctx.drawImage(tile.source, -tilePx / 2, -tilePx / 2, tilePx, tilePx);
        ctx.restore();
      } else {
        ctx.drawImage(tile.source, drawX, drawY, tilePx, tilePx);
      }
    }
  }

  // Dressing layer (epic #1062) — props above the stamped objects, in stacking
  // order. A prop is culled when its rotated footprint misses the window.
  for (const [, placement] of dressingDrawOrder(layers.dressing)) {
    const cb = dressingCellBounds(placement, dressing);
    if (cb.maxX < minX || cb.minX > maxX || cb.maxY < minY || cb.minY > maxY) continue;
    drawDressing(ctx, placement, dressing.get(placement.prop_id), sx(placement.x), sy(placement.y), tilePx);
  }

  afterDressing?.();

  // Hazard / feature glyph layer (#804) — a placed trap's or feature's
  // visual glyph, drawn above objects. There is no per-cell stored pack_id
  // for these (`glyphs` is resolved live off the linked trap/feature — see
  // cartographer/glyphs.ts), so they draw against `glyphPackId`. Variant is
  // always 0 — this is a drawing hint, not an authored stamp.
  const glyphRt = glyphPackId ? runtime(glyphPackId) : null;
  if (glyphRt) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const category = glyphs[cellKey(x, y)];
        if (!category) continue;
        const tile = glyphRt.getTile(category, 0);
        ctx.drawImage(tile.source, sx(x), sy(y), tilePx, tilePx);
      }
    }
  }
}
