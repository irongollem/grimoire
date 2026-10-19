// How a door's leaf is painted, shared by the bake (`drawEdgeSeg` in drawMap.ts) and the live battle map, which draws
// each leaf at the state the DM set during a fight (#1073). One painter, so a leaf drawn live lands on exactly the
// pixels the bake would have used. No vue, no DOM beyond the canvas context it is handed.

import type { Ctx2D } from "@/cartographer/dressing";
import { DEFAULT_DOOR_LEAF } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { EdgeSeg } from "@/types/dungeonMap.types";
import type { MapLiveDoorLeaf } from "@/types/mapLive.types";

/** Where a leaf swings: the pin as a fraction of the leaf tile, and how far it opens, clockwise. */
export interface DoorHinge {
  hingeX: number;
  hingeY: number;
  openDegrees: number;
}

/** The axis an edge's art is drawn on: an N edge is a horizontal doorway, a W edge a vertical one. */
export function edgeAxis(side: "N" | "W"): "H" | "V" {
  return side === "N" ? "H" : "V";
}

/**
 * The top-left of an edge's band tile, given the top-left of the cell it belongs to. The tile is shifted half a tile
 * so its strip lands on the gridline: up for an N edge, left for a W edge.
 */
export function edgeTileOrigin(axis: "H" | "V", cellX: number, cellY: number, tilePx: number): { x: number; y: number } {
  const half = tilePx / 2;
  return axis === "H" ? { x: cellX, y: cellY - half } : { x: cellX - half, y: cellY };
}

/**
 * The leaf over a doorway. The leaf tile is the closed leaf exactly where it sits in a `doorwayH` opening, so closed
 * is the tile unrotated and open is the same tile turned on its hinge. Canvas rotation is clockwise, which swings an
 * N edge's leaf into the cell south of it. A W edge is the same construction turned a quarter clockwise about the
 * edge tile's centre, as its art is.
 */
export function paintDoorLeaf(
  ctx: Ctx2D,
  leaf: CanvasImageSource,
  axis: "H" | "V",
  tileX: number,
  tileY: number,
  tilePx: number,
  hinge: DoorHinge,
  open: boolean,
): void {
  if (axis === "H" && !open) {
    ctx.drawImage(leaf, tileX, tileY, tilePx, tilePx);
    return;
  }
  const half = tilePx / 2;
  ctx.save();
  if (axis === "V") {
    ctx.translate(tileX + half, tileY + half);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-half, -half);
  } else {
    ctx.translate(tileX, tileY);
  }
  // Now at the (turned) leaf tile's top-left; hinge the swing at its pin.
  if (open) {
    ctx.translate(hinge.hingeX * tilePx, hinge.hingeY * tilePx);
    ctx.rotate((hinge.openDegrees * Math.PI) / 180);
    ctx.drawImage(leaf, -hinge.hingeX * tilePx, -hinge.hingeY * tilePx, tilePx, tilePx);
  } else {
    ctx.drawImage(leaf, 0, 0, tilePx, tilePx);
  }
  ctx.restore();
}

/**
 * The leaf art the live battle map can draw for a door, or null when it must stay in the bake. The one predicate
 * for both sides (#1073): the snapshot carries a leaf exactly where the standing bake leaves it out, so a leaf is
 * never drawn twice and never lost. It needs a pack whose urls last (a DM's own pack serves one-hour signed urls a
 * snapshot cannot keep) and a sideless `doorLeaf` slot of this variant with a url: a variant with no art of its own
 * is drawn from a stand-in tile, which the live layer cannot reproduce.
 */
export function doorLeafArt(seg: EdgeSeg, runtime: TilePackRuntime | null): MapLiveDoorLeaf | null {
  if (seg.type !== "doorClosed" && seg.type !== "doorOpen") return null;
  if (!runtime || !runtime.lastingUrls) return null;
  const slot = runtime.manifest.assets.doorLeaf?.find((s) => s.side === undefined && s.variant === seg.variant);
  if (!slot?.url) return null;
  const hinge = runtime.manifest.doorLeaf ?? DEFAULT_DOOR_LEAF;
  return { url: slot.url, hingeX: hinge.hingeX, hingeY: hinge.hingeY, openDegrees: hinge.openDegrees };
}
