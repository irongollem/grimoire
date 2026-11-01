// The brush's old coverage storage (`layers.area`) becomes walls the first time a map is read (epic #1125, wall
// curves). Each brushed outline's stroked stretches turn into smooth angled walls (`brushWalls.ts`), and every brushed
// square whose middle is covered becomes plain floor in its pack. Stretches against plain floor were never walls
// (`areaWallSegments`), so they stay unwalled. Idempotent: a map with no area entries comes back as the same object.

import { areaOutline, decodeMask, AREA_RES, type LayersWithArea, type OutlineLoop } from "./area";
import { cachedWallGeometry } from "./wallGeometry";
import { isLatticeKey, wallSegment } from "./wallGraph";
import { fitRun, outlineToWalls, runToWalls, type WallMaking } from "./brushWalls";
import { projectOnSegment } from "./wallEdit/geometry";
import { cellKey, parseCellKey, withLayerDefaults, type DungeonMapLayers, type PackRef, type WallEdge } from "@/types/dungeonMap.types";

type P = [number, number];

/** How far (cells) a run may stop short of a wall or floor edge and still be joined to it: the old drawing welded within this. */
const JOIN = 0.6;

/** The stroked stretches of a loop: the whole loop when every step is stroked, else each unbroken run of steps. */
function strokedRuns(loop: OutlineLoop): { points: P[]; closed: boolean }[] {
  const n = loop.points.length;
  if (loop.stroke.every(Boolean)) return [{ points: loop.points, closed: true }];
  const start = loop.stroke.findIndex((s, i) => s && !loop.stroke[(i + n - 1) % n]);
  const runs: { points: P[]; closed: boolean }[] = [];
  let current: P[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (loop.stroke[i]) {
      if (current.length === 0) current.push(loop.points[i]);
      current.push(loop.points[(i + 1) % n]);
    } else if (current.length > 0) {
      runs.push({ points: current, closed: false });
      current = [];
    }
  }
  if (current.length > 0) runs.push({ points: current, closed: false });
  return runs;
}

/** Walls and plain-floor edges an open run's ends may land on. */
function joinTargets(layers: LayersWithArea): [P, P][] {
  const out: [P, P][] = [];
  const geometry = cachedWallGeometry(layers.walls);
  for (const [key, wall] of Object.entries(layers.walls)) {
    if (isLatticeKey(key)) {
      const s = wallSegment(key, wall);
      out.push([[s.a[0], s.a[1]], [s.b[0], s.b[1]]]);
    } else {
      for (const p of geometry.lines.get(key)?.pieces ?? [{ a: wall.a, b: wall.b }]) out.push([[p.a[0], p.a[1]], [p.b[0], p.b[1]]]);
    }
  }
  const open = (x: number, y: number): boolean => layers.floor[cellKey(x, y)]?.floor !== undefined && layers.area?.[cellKey(x, y)] === undefined;
  for (const k of Object.keys(layers.floor)) {
    const [x, y] = parseCellKey(k as `${number},${number}`);
    if (!open(x, y)) continue;
    if (!open(x, y - 1)) out.push([[x, y], [x + 1, y]]);
    if (!open(x, y + 1)) out.push([[x, y + 1], [x + 1, y + 1]]);
    if (!open(x - 1, y)) out.push([[x, y], [x, y + 1]]);
    if (!open(x + 1, y)) out.push([[x + 1, y], [x + 1, y + 1]]);
  }
  return out;
}

function pullTo(p: P, targets: readonly [P, P][]): P {
  let best: { foot: P; d: number } | undefined;
  for (const [a, b] of targets) {
    const hit = projectOnSegment(p, a, b);
    if (hit.dist <= JOIN && (!best || hit.dist < best.d)) best = { foot: hit.foot, d: hit.dist };
  }
  return best ? best.foot : p;
}

/** Covered at the square's middle: at least two of the four sub-cells around it (the old half-coverage rule). */
function middleCovered(mask: string): boolean {
  const bits = decodeMask(mask);
  const lo = AREA_RES / 2 - 1;
  let n = 0;
  for (const sy of [lo, lo + 1]) for (const sx of [lo, lo + 1]) n += bits[sy * AREA_RES + sx];
  return n >= 2;
}

/** True when a saved map still carries brushed coverage that `convertAreaLayer` has to turn into walls. */
export function hasBrushedArea(layers: LayersWithArea): boolean {
  return layers.area !== undefined && Object.keys(layers.area).length > 0;
}

/**
 * The layers without `area`: brushed outlines become walls and covered squares become floor. A map with no brushed
 * cells comes back as the same object when it has no `area` key, else without the empty key.
 */
export function convertAreaLayer(layers: LayersWithArea, opts: { newKey: () => string }): DungeonMapLayers {
  const { area, ...rest } = layers;
  if (area === undefined || Object.keys(area).length === 0) return area === undefined ? layers : rest;
  const areaKeys = Object.keys(area) as (keyof typeof area)[];
  const withArea = { floor: layers.floor, area };

  const refOf = (p: P): PackRef => {
    const [x, y] = [Math.floor(p[0]), Math.floor(p[1])];
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1]]) {
      const cell = area[cellKey(x + dx, y + dy)];
      if (cell) return { pack_id: cell.pack_id, pack_version: cell.pack_version, variant: 0 };
    }
    const first = area[areaKeys[0]];
    return { pack_id: first.pack_id, pack_version: first.pack_version, variant: 0 };
  };

  const targets = joinTargets(layers);
  const walls: Record<string, WallEdge> = { ...layers.walls };
  for (const loop of areaOutline(withArea).loops) {
    for (const run of strokedRuns(loop)) {
      const making: WallMaking = { newKey: opts.newKey, wall: refOf(run.points[0]) };
      if (run.closed) {
        Object.assign(walls, outlineToWalls(run.points, making));
        continue;
      }
      const fitted = fitRun(run.points);
      if (fitted.length < 2) continue;
      fitted[0] = pullTo(fitted[0], targets);
      fitted[fitted.length - 1] = pullTo(fitted[fitted.length - 1], targets);
      Object.assign(walls, runToWalls(fitted, making));
    }
  }

  const floor = { ...layers.floor };
  for (const k of areaKeys) {
    const cell = area[k];
    if (middleCovered(cell.mask)) {
      if (floor[k]?.floor === undefined) floor[k] = { ...floor[k], floor: { pack_id: cell.pack_id, pack_version: cell.pack_version, variant: cell.variant, ...(cell.rotation === undefined ? {} : { rotation: cell.rotation }) } };
    } else if (floor[k]?.floor !== undefined) {
      delete floor[k];
    }
  }
  return { ...rest, walls, floor };
}

/** A saved row's layers, defaulted and with any brushed coverage turned into walls: the one way a drawing is read. */
export function readLayers(raw: (Partial<DungeonMapLayers> & Pick<LayersWithArea, "area">) | null | undefined, opts: { newKey: () => string }): DungeonMapLayers {
  const defaults = withLayerDefaults(raw);
  const area = raw?.area;
  return convertAreaLayer(area && typeof area === "object" ? { ...defaults, area } : defaults, opts);
}
