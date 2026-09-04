// Pure grid/geometry maths for the site map viewer (#784, epic #780).
//
// The grid is the coordinate space; the place's own image (`map_url`) and the
// live Cartographer map are optional decoration over it — see the header of
// migration `20260904142401_site_map_regions.sql`. Everything here is
// deliberately free of Vue, DOM and canvas so it can be unit tested without a
// browser. `SiteMapView.vue` is the only consumer.

import { cellKey, parseCellKey, type CellKey, type DungeonMapLayers, type PackRef } from "@/types/dungeonMap.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

export interface CellBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * A site with nothing traced yet still needs an addressable grid to click
 * on — this is the starting extent before a map or any region gives one a
 * shape of its own. Arbitrary but reasonable: big enough to trace a small
 * dungeon, small enough to render at a legible cell size on a phone screen.
 */
export const DEFAULT_GRID_BOUNDS: CellBounds = { minX: 0, minY: 0, maxX: 19, maxY: 14 };

/** Cells of slack kept around whatever has actually been painted or traced,
 *  so a click near the edge of the drawn extent still lands inside the grid. */
export const GRID_PADDING_CELLS = 1;

function unionBounds(a: CellBounds | null, b: CellBounds | null): CellBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function boundsFromKeys(keys: Iterable<string>): CellBounds | null {
  let bounds: CellBounds | null = null;
  for (const key of keys) {
    const [x, y] = parseCellKey(key as CellKey);
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, x),
          minY: Math.min(bounds.minY, y),
          maxX: Math.max(bounds.maxX, x),
          maxY: Math.max(bounds.maxY, y),
        }
      : { minX: x, minY: y, maxX: x, maxY: y };
  }
  return bounds;
}

/**
 * Bounding box of every painted cell across all four map layers — a wall or
 * a solid block can exist on a cell with no floor tile, so every layer has to
 * be scanned, not just `floor`. Null when the map has nothing painted.
 */
export function layersBoundingBox(layers: DungeonMapLayers): CellBounds | null {
  return boundsFromKeys([
    ...Object.keys(layers.floor),
    ...Object.keys(layers.solidBlock),
    ...Object.keys(layers.object),
    ...Object.keys(layers.annotation),
  ]);
}

/** Bounding box of every cell claimed by any region (bound or not). Null when
 *  no region has traced anything yet. */
export function regionsBoundingBox(regions: readonly Pick<LocationMapRegion, "cells">[]): CellBounds | null {
  return boundsFromKeys(regions.flatMap((r) => r.cells));
}

/**
 * The addressable grid for the viewer: the union of whatever the live map has
 * painted and whatever any region has already traced, padded by
 * `GRID_PADDING_CELLS`, falling back to `DEFAULT_GRID_BOUNDS` when neither
 * exists yet — a freshly-added site with only a picture still needs a grid
 * to trace onto.
 */
export function resolveGridBounds(
  mapLayers: DungeonMapLayers | null,
  regions: readonly Pick<LocationMapRegion, "cells">[],
): CellBounds {
  const painted = mapLayers ? layersBoundingBox(mapLayers) : null;
  const traced = regionsBoundingBox(regions);
  const combined = unionBounds(painted, traced);
  if (!combined) return DEFAULT_GRID_BOUNDS;
  return {
    minX: combined.minX - GRID_PADDING_CELLS,
    minY: combined.minY - GRID_PADDING_CELLS,
    maxX: combined.maxX + GRID_PADDING_CELLS,
    maxY: combined.maxY + GRID_PADDING_CELLS,
  };
}

/**
 * Maps a click position (pixels, relative to the grid overlay's own
 * top-left corner) to the cell key under it.
 */
export function cellAtPoint(
  px: number,
  py: number,
  tilePx: number,
  origin: Pick<CellBounds, "minX" | "minY">,
): CellKey {
  const x = origin.minX + Math.floor(px / tilePx);
  const y = origin.minY + Math.floor(py / tilePx);
  return cellKey(x, y);
}

/**
 * Adds `key` to `cells` if absent, removes it if present. Pure; dedupes by
 * construction since a key already present is removed rather than
 * duplicated.
 */
export function toggleCell(cells: readonly CellKey[], key: CellKey): CellKey[] {
  return cells.includes(key) ? cells.filter((k) => k !== key) : [...cells, key];
}

/**
 * Distinct `(pack_id, pack_version)` pairs referenced anywhere in a map's
 * layers, so the viewer loads only the tile packs a given map actually uses
 * instead of every bundled pack up front (which is what the Cartographer
 * editor itself does, since it must be ready to paint with any of them).
 */
export function collectUsedPackRefs(layers: DungeonMapLayers): Pick<PackRef, "pack_id" | "pack_version">[] {
  const seen = new Map<string, Pick<PackRef, "pack_id" | "pack_version">>();
  function note(ref: PackRef | undefined): void {
    if (!ref) return;
    const key = `${ref.pack_id}@${ref.pack_version}`;
    if (!seen.has(key)) seen.set(key, { pack_id: ref.pack_id, pack_version: ref.pack_version });
  }
  for (const cell of Object.values(layers.floor)) {
    note(cell.floor);
    note(cell.wallN);
    note(cell.wallW);
  }
  for (const cell of Object.values(layers.solidBlock)) note(cell);
  for (const cell of Object.values(layers.object)) note(cell);
  return [...seen.values()];
}

/** Legible-range clamp for the on-screen cell size. */
export const MIN_TILE_PX = 14;
export const MAX_TILE_PX = 48;

/**
 * Cell size (px) that fits `cols` columns into `containerWidth`, clamped so a
 * huge site doesn't shrink cells to unclickable slivers and a tiny one
 * doesn't blow up to a handful of oversized squares.
 */
export function fitTilePx(containerWidth: number, cols: number): number {
  if (cols <= 0 || containerWidth <= 0) return MIN_TILE_PX;
  return Math.min(MAX_TILE_PX, Math.max(MIN_TILE_PX, Math.floor(containerWidth / cols)));
}
