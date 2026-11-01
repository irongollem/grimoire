// Test-only: builds a map the way the retired round brush stored it (`layers.area`, a coverage mask per cell), so the
// converter and the outline trace can be tested against real old data. Nothing in the app writes this any more.

import { AREA_RES, decodeMask, type AreaCell, type Disc } from "@/cartographer/area";
import { cellKey, emptyLayers, type CellKey, type DungeonMapLayers, type FloorCell, type PackRef } from "@/types/dungeonMap.types";

export type Legacy = DungeonMapLayers & { area: Record<CellKey, AreaCell> };

const SUBS = AREA_RES * AREA_RES;
const FULL = "full";
const FLOOR_COVERAGE = 0.5;

export function legacyLayers(base: DungeonMapLayers): Legacy {
  return { ...base, area: {} };
}

/** `"full"`, 16 hex chars, or null when nothing is covered. */
export function encodeMask(bits: Uint8Array): string | null {
  let lo = 0;
  let hi = 0;
  let count = 0;
  for (let i = 0; i < 32; i++) {
    if (bits[i]) {
      lo |= 1 << i;
      count++;
    }
    if (bits[32 + i]) {
      hi |= 1 << i;
      count++;
    }
  }
  if (count === 0) return null;
  if (count === SUBS) return FULL;
  return (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0");
}

export function coverage(mask: string): number {
  if (mask === FULL) return 1;
  const bits = decodeMask(mask);
  let n = 0;
  for (let i = 0; i < SUBS; i++) n += bits[i];
  return n / SUBS;
}


/**
 * `applyDisc` for a run of discs (a brush stroke's segment), copying the `area`
 * and `floor` records once for the whole run rather than once per disc.
 */
/** Paints or erases a run of discs the way the old brush did. */
export function applyDiscs(
  layers: Legacy,
  discs: readonly Disc[],
  ref: PackRef,
  mode: "paint" | "erase",
): Legacy {
  const area: Record<CellKey, AreaCell> = { ...layers.area };
  const floor: Record<CellKey, FloorCell> = { ...layers.floor };
  let changed = false;
  for (const disc of discs) {
    if (discInto(area, floor, disc, ref, mode)) changed = true;
  }
  return changed ? { ...layers, area, floor } : layers;
}

/** Writes one disc into `area` and `floor` in place; true when it changed anything. */
function discInto(
  area: Record<CellKey, AreaCell>,
  floor: Record<CellKey, FloorCell>,
  disc: Disc,
  ref: PackRef,
  mode: "paint" | "erase",
): boolean {
  let changed = false;
  const r2 = disc.r * disc.r;

  for (let cy = Math.floor(disc.y - disc.r); cy <= Math.floor(disc.y + disc.r); cy++) {
    for (let cx = Math.floor(disc.x - disc.r); cx <= Math.floor(disc.x + disc.r); cx++) {
      const key = cellKey(cx, cy);
      const discBits = new Uint8Array(SUBS);
      let any = false;
      for (let sy = 0; sy < AREA_RES; sy++) {
        for (let sx = 0; sx < AREA_RES; sx++) {
          const dx = cx + (sx + 0.5) / AREA_RES - disc.x;
          const dy = cy + (sy + 0.5) / AREA_RES - disc.y;
          if (dx * dx + dy * dy <= r2) {
            discBits[sy * AREA_RES + sx] = 1;
            any = true;
          }
        }
      }
      if (!any) continue;

      const entry = area[key];
      let next: AreaCell | null;
      if (mode === "paint") {
        if (!entry && floor[key]?.floor !== undefined) continue; // plain floor is already fully floor
        const bits = entry ? decodeMask(entry.mask) : new Uint8Array(SUBS);
        for (let i = 0; i < SUBS; i++) if (discBits[i]) bits[i] = 1;
        const mask = encodeMask(bits);
        if (mask === null) continue;
        if (entry && entry.mask === mask && samePack(entry, ref)) continue;
        next = { ...ref, mask };
      } else if (entry) {
        const bits = decodeMask(entry.mask);
        for (let i = 0; i < SUBS; i++) if (discBits[i]) bits[i] = 0;
        const mask = encodeMask(bits);
        if (mask === entry.mask) continue;
        next = mask === null ? null : { ...entry, mask };
      } else {
        const plain = floor[key]?.floor;
        if (!plain) continue;
        const bits = new Uint8Array(SUBS);
        for (let i = 0; i < SUBS; i++) bits[i] = discBits[i] ? 0 : 1;
        const mask = encodeMask(bits);
        // A disc that covers the whole plain cell erases it outright.
        next = mask === null ? null : { ...plain, mask };
      }

      changed = true;
      if (next === null) {
        delete area[key];
        removeFloor(floor, key);
      } else {
        area[key] = next;
        if (coverage(next.mask) >= FLOOR_COVERAGE) {
          const { mask: _mask, ...pack } = next;
          floor[key] = { ...floor[key], floor: pack };
        } else {
          removeFloor(floor, key);
        }
      }
    }
  }
  return changed;
}

function samePack(a: PackRef, b: PackRef): boolean {
  return a.pack_id === b.pack_id && a.pack_version === b.pack_version && a.variant === b.variant && a.rotation === b.rotation;
}

/** Drops a cell's floor tile; the cell goes with it, since walls no longer hang on cells. */
function removeFloor(floor: Record<CellKey, FloorCell>, key: CellKey): void {
  const cell = floor[key];
  if (!cell || cell.floor === undefined) return;
  delete floor[key];
}


export function applyDisc(layers: Legacy, disc: Disc, ref: PackRef, mode: "paint" | "erase"): Legacy {
  return applyDiscs(layers, [disc], ref, mode);
}
export const emptyLegacy = (): Legacy => legacyLayers(emptyLayers());
