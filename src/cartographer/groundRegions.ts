// Editable material shapes are the source; floor/terrain squares are their gameplay projection. A shoreline belongs
// only to this graph. Physical walls live in layers.walls and are changed only by an explicit attachment edit.
import { cellKey, parseCellKey, type CellKey, type DungeonMapLayers, type GroundRegion, type GroundWallMode, type PackRef, type WallEdge } from "@/types/dungeonMap.types";
import { pointInRing } from "@/lib/locations/polygon";
import { buildGraph } from "./wallEdit/graph";
import { detectRooms } from "./wallEdit/rooms";
import { cachedWallGeometry, wallIdOfPiece, wallsAsPieces } from "./wallGeometry";
import { dist, lerp, projectOnSegment, samePt } from "./wallEdit/geometry";
import { boundaryEdges } from "./floodFill";
import { canonicaliseEdge } from "./edges";
import { findFaces } from "./roomOutline";
import { edgeSegOf, latticeWall, isLatticeKey } from "./wallGraph";
import { latticeKey } from "@/lib/battlemap/walls";
import { FIT_TOLERANCE, outlineToWalls, type BrushOptions } from "./brushWalls";
import { groundStrokeLoops } from "./groundRaster";
import type { Disc } from "./area";

type P = [number, number];
const loopsCache = new WeakMap<GroundRegion["boundary"], P[][]>();

/** The exact sampled curves shared by drawing, projection, boolean operations and node hit testing. */
export function groundLoops(region: GroundRegion): P[][] {
  const hit = loopsCache.get(region.boundary);
  if (hit) return hit;
  const loops = detectRooms(buildGraph(wallsAsPieces(region.boundary))).map((r) => r.polygon);
  loopsCache.set(region.boundary, loops);
  return loops;
}

export const orderedGround = (layers: DungeonMapLayers): [string, GroundRegion][] =>
  Object.entries(layers.ground).sort(([a, p], [b, q]) => p.z - q.z || a.localeCompare(b));

export function groundContains(region: GroundRegion, x: number, y: number): boolean {
  return groundLoops(region).filter((ring) => pointInRing(x, y, ring)).length % 2 === 1;
}

export function groundRegionAt(layers: DungeonMapLayers, x: number, y: number, reach = 0): string | null {
  const ordered = orderedGround(layers).reverse();
  // Edges win over interiors so an overpainted shape can still be picked by its exposed boundary.
  if (reach > 0) for (const [id, region] of ordered) {
    if (groundLoops(region).some((loop) => loop.some((p, i) => projectOnSegment([x, y], p, loop[(i + 1) % loop.length]).dist <= reach))) return id;
  }
  return ordered.find(([, region]) => groundContains(region, x, y))?.[0] ?? null;
}

export function groundBounds(region: GroundRegion): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const points = groundLoops(region).flat();
  if (points.length === 0) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Never writes physical walls: painting another shape cannot resurrect deleted walls or erase fitted doors. */
export function projectGround(layers: DungeonMapLayers): DungeonMapLayers {
  const floor: DungeonMapLayers["floor"] = {};
  const terrain: DungeonMapLayers["terrain"] = {};
  for (const [, region] of orderedGround(layers)) {
    const box = groundBounds(region);
    if (!box) continue;
    for (let y = Math.floor(box.minY); y < Math.ceil(box.maxY); y++) for (let x = Math.floor(box.minX); x < Math.ceil(box.maxX); x++) {
      if (!groundContains(region, x + 0.5, y + 0.5)) continue;
      const key = cellKey(x, y);
      const material = { ...region.material, variant: region.variants[key] ?? region.material.variant };
      if (region.category === "floor") {
        floor[key] = { ...layers.floor[key], floor: material };
        delete terrain[key];
      } else {
        // Water still supplies playable squares; its art is rendered from the vector, never from this fallback floor.
        floor[key] ??= { ...layers.floor[key], floor: material };
        terrain[key] = material;
      }
    }
  }
  return { ...layers, floor, terrain };
}

export function cellBoundary(cells: ReadonlySet<CellKey>, material: PackRef): GroundRegion["boundary"] {
  const walls: GroundRegion["boundary"] = {};
  for (const edge of boundaryEdges(cells)) {
    const c = canonicaliseEdge(edge.x, edge.y, edge.side);
    walls[latticeKey(c.x, c.y, c.side)] = latticeWall(c.x, c.y, c.side, { type: "wall", ...material });
  }
  return walls;
}

const materialGroup = (ref: PackRef): string => JSON.stringify([ref.pack_id, ref.pack_version, ref.rotation]);

/** One-time conversion groups tile variants into meaningful surfaces, partitioned by existing physical rooms.
 *  A shared pack across a chapel and its corridor does not erase the chapel's original curve controls. */
export function convertCellGround(layers: DungeonMapLayers, newKey: () => string): DungeonMapLayers {
  const ground: DungeonMapLayers["ground"] = {};
  const faces = findFaces(layers, { simplify: false });
  const physicalFaces = detectRooms(buildGraph(wallsAsPieces(layers.walls))).sort((a, b) => a.area - b.area);
  const physicalOwner = (key: CellKey): number => { const [x, y] = parseCellKey(key); return physicalFaces.findIndex((face) => pointInRing(x + 0.5, y + 0.5, face.polygon)); };
  const physicalCells = physicalFaces.map((_, i) => (Object.keys(layers.floor) as CellKey[]).filter((key) => physicalOwner(key) === i));
  const faceAt = (key: CellKey): number => {
    return faces.findIndex((face) => face.cells.includes(key));
  };
  const floorKeys = Object.keys(layers.floor) as CellKey[];
  const faceFloor = faces.map((_, i) => floorKeys.filter((key) => faceAt(key) === i));
  const owned = new Set<string>();
  let z = 0;
  for (const category of ["floor", "terrainWater"] as const) {
    const cells = new Map<CellKey, PackRef>();
    if (category === "floor") for (const [k, cell] of Object.entries(layers.floor)) { if (cell.floor) cells.set(k as CellKey, cell.floor); }
    else for (const [k, material] of Object.entries(layers.terrain)) cells.set(k as CellKey, material);
    while (cells.size > 0) {
      const first = cells.entries().next().value;
      if (!first) break;
      const [start, material] = first;
      const faceIndex = faceAt(start);
      const group = materialGroup(material);
      const queue = [start];
      const component = new Set<CellKey>([start]);
      const variants: GroundRegion["variants"] = {};
      cells.delete(start);
      for (let i = 0; i < queue.length; i++) {
        const key = queue[i]; const [x, y] = parseCellKey(key);
        const ref = category === "floor" ? layers.floor[key].floor : layers.terrain[key];
        if (ref) variants[key] = ref.variant;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = cellKey(x + dx, y + dy); const next = cells.get(k);
          if (!next || materialGroup(next) !== group || faceAt(k) !== faceIndex) continue;
          cells.delete(k); component.add(k); queue.push(k);
        }
      }
      let boundary = cellBoundary(component, material);
      let matchingPhysical: string[] = [];
      // Exact complete faces reuse original segment IDs and spline controls. Never mix a partial spline with
      // approximate chords: extra chords beside it create sliver cycles. Terrain stays material-only.
      if (category === "floor" && faceIndex >= 0 && faceFloor[faceIndex].length === component.size && faceFloor[faceIndex].every((k) => component.has(k))) {
        const loop = faces[faceIndex].outline;
        const onLoop = (point: P): boolean => loop.some((a, i) => projectOnSegment(point, a, loop[(i + 1) % loop.length]).dist < 1e-5);
        const geometry = cachedWallGeometry(layers.walls);
        const exact: GroundRegion["boundary"] = {};
        for (const [id, wall] of Object.entries(layers.walls)) {
          const pieces = isLatticeKey(id) ? [wall] : geometry.lines.get(id)?.pieces ?? [];
          if (pieces.length === 0 || !pieces.every((p) => onLoop(p.a) && onLoop(p.b) && onLoop(lerp(p.a, p.b, 0.5)))) continue;
          exact[id] = { ...wall, ...material, type: "wall" }; delete exact[id].visible;
        }
        const covered = Object.values(wallsAsPieces(exact));
        loop.forEach((a, i) => {
          const b = loop[(i + 1) % loop.length]; const mid = lerp(a, b, 0.5);
          if (covered.some((piece) => projectOnSegment(mid, piece.a, piece.b).dist < 1e-5)) return;
          exact[`source-edge-${i}`] = { type: "wall", ...material, a: [...a], b: [...b] };
        });
        matchingPhysical = Object.keys(exact).filter((id) => layers.walls[id] !== undefined);
        const physicalIndex = physicalCells.findIndex((keys) => keys.length === component.size && keys.every((key) => component.has(key)));
        if (physicalIndex >= 0) {
          const keys = new Set(physicalFaces[physicalIndex].segments.map(wallIdOfPiece));
          boundary = Object.fromEntries([...keys].map((key) => [key, { ...layers.walls[key], ...material, type: "wall" as const }]));
          for (const edge of Object.values(boundary)) delete edge.visible;
          matchingPhysical = Object.keys(boundary);
        } else {
          boundary = exact;
          // A partial control chain can change its tangent when closed by a floor edge. Keep the exact sampled loop
          // if reconnecting those controls would introduce another face; never save small phantom material islands.
          if (detectRooms(buildGraph(wallsAsPieces(boundary))).length !== 1) {
            boundary = Object.fromEntries(loop.map((a, i) => [`source-edge-${i}`, { type: "wall" as const, ...material, a: [...a], b: [...loop[(i + 1) % loop.length]] }]));
          }
        }
      }
      const rawLoop = faceIndex >= 0 ? faces[faceIndex].outline : undefined;
      boundary = migrationBoundary(boundary, component, material, rawLoop);
      const ids = category === "floor" ? matchingPhysical.filter((id) => !owned.has(id)) : [];
      ids.forEach((id) => owned.add(id));
      const excluded = category === "floor" ? matchingPhysical.filter((id) => !ids.includes(id)).map((id) => layers.walls[id]) : [];
      const physical = ids.length > 0 ? layers.walls[ids[0]] : undefined;
      const wallMaterial = physical ? { pack_id: physical.pack_id, pack_version: physical.pack_version, variant: physical.variant } : material;
      const mode = ids.length === 0 ? "none" : ids.every((id) => layers.walls[id].visible === false) ? "hidden" : "visible";
      ground[newKey()] = { name: `${material.pack_id} ${category === "floor" ? "ground" : "water"} ${z + 1}`, material: { ...material }, category, z: z++, boundary, variants,
        walls: { mode, material: { ...wallMaterial }, ids, segments: Object.fromEntries(ids.map((id) => [id, layers.walls[id]])), excluded } };
    }
  }
  return { ...layers, ground };
}

/** Conversion must preserve gameplay coverage exactly, including sparse holes. Partial old curve chains whose
 *  endpoint context cannot close the same face are stored as their exact sampled polyline, never as a second outline. */
function migrationBoundary(candidate: GroundRegion["boundary"], cells: ReadonlySet<CellKey>, material: PackRef, raw?: readonly P[]): GroundRegion["boundary"] {
  const loopsOf = (boundary: GroundRegion["boundary"]) => detectRooms(buildGraph(wallsAsPieces(boundary))).map((r) => r.polygon);
  const contains = (loops: P[][], x: number, y: number) => loops.filter((loop) => pointInRing(x, y, loop)).length % 2 === 1;
  const missing = (loops: P[][]): Set<CellKey> => {
    const out = new Set<CellKey>();
    const points = loops.flat();
    if (points.length === 0) return out;
    for (let y = Math.floor(Math.min(...points.map((p) => p[1]))); y < Math.ceil(Math.max(...points.map((p) => p[1]))); y++) {
      for (let x = Math.floor(Math.min(...points.map((p) => p[0]))); x < Math.ceil(Math.max(...points.map((p) => p[0]))); x++) {
        if (contains(loops, x + 0.5, y + 0.5) && !cells.has(cellKey(x, y))) out.add(cellKey(x, y));
      }
    }
    return out;
  };
  const covers = (loops: P[][]) => [...cells].every((key) => { const [x, y] = parseCellKey(key); return contains(loops, x + 0.5, y + 0.5); });
  let boundary = candidate; let loops = loopsOf(boundary);
  let sampled = Object.keys(candidate).some((key) => key.startsWith("source-edge-")) && Object.values(candidate).every((edge) => !edge.smoothA && !edge.smoothB);
  const compact = (source: GroundRegion["boundary"]): GroundRegion["boundary"] => {
    if (!sampled) return source;
    const sourceLoops = loopsOf(source);
    const deviation = (from: P[][], to: P[][]): number => Math.max(...from.flat().map((point) =>
      Math.min(...to.flatMap((loop) => loop.map((a, i) => projectOnSegment(point, a, loop[(i + 1) % loop.length]).dist))),
    ));
    for (const tolerance of [0.04, 0.02, 0.01, 0.005]) {
      let serial = 0;
      const fitted = Object.assign({}, ...sourceLoops.map((loop) => outlineToWalls(loop, { wall: material, newKey: () => `migration-fit-${serial++}` }, tolerance)));
      const fittedLoops = loopsOf(fitted);
      if (Object.keys(fitted).length >= Object.keys(source).length || fittedLoops.length !== sourceLoops.length || !covers(fittedLoops) || missing(fittedLoops).size > 0) continue;
      if (deviation(sourceLoops, fittedLoops) <= FIT_TOLERANCE && deviation(fittedLoops, sourceLoops) <= FIT_TOLERANCE) return fitted;
    }
    return source;
  };
  if (!covers(loops) && raw) {
    boundary = Object.fromEntries(raw.map((a, i) => [`sampled-edge-${i}`, { type: "wall" as const, ...material, a: [...a], b: [...raw[(i + 1) % raw.length]] }]));
    loops = loopsOf(boundary); sampled = true;
  }
  if (!covers(loops)) return cellBoundary(cells, material);
  const holes = missing(loops);
  if (holes.size === 0) return compact(boundary);
  // A hole that meets the outer curve needs a proper intersection. The saved cells are the exact available source
  // for that partial surface; interior holes, by contrast, can keep every outer spline control unchanged.
  if ([...holes].some((key) => { const [x, y] = parseCellKey(key); return [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].some(([px, py]) => !contains(loops, px, py)); })) return cellBoundary(cells, material);
  const cut = Object.fromEntries(Object.entries(cellBoundary(holes, material)).map(([key, edge]) => [`hole-${key.replace(":", "-")}`, edge]));
  return compact({ ...boundary, ...cut });
}

/** The overlap of two straight boundary stretches, with tolerance only for raster fitting noise. */
function overlapOn(edge: WallEdge, other: WallEdge): [number, number] | null {
  if (edge.smoothA || edge.smoothB || other.smoothA || other.smoothB) return null;
  const dx = edge.b[0] - edge.a[0]; const dy = edge.b[1] - edge.a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const off = (p: P) => Math.abs(dx * (p[1] - edge.a[1]) - dy * (p[0] - edge.a[0])) / length;
  if (off(other.a) > 0.12 || off(other.b) > 0.12) return null;
  const along = (p: P) => ((p[0] - edge.a[0]) * dx + (p[1] - edge.a[1]) * dy) / (length * length);
  const lo = Math.max(0, Math.min(along(other.a), along(other.b)));
  const hi = Math.min(1, Math.max(along(other.a), along(other.b)));
  return (hi - lo) * length > 0.01 ? [lo, hi] : null;
}
const sameEdge = (a: WallEdge, b: WallEdge): boolean => (samePt(a.a, b.a) && samePt(a.b, b.b)) || (samePt(a.a, b.b) && samePt(a.b, b.a));

/** Attachment updates are explicit and local. Ownership exclusions survive source refits and free wall edits. */
function attachWalls(layers: DungeonMapLayers, previous: GroundRegion | undefined, region: GroundRegion, newKey: () => string): DungeonMapLayers {
  if (region.walls.mode === "none" && (!previous || previous.walls.ids.length === 0)) return layers;
  if (previous && previous.boundary === region.boundary && previous.walls.mode === region.walls.mode) return layers;
  const walls = { ...layers.walls };
  const old = previous?.walls.ids.flatMap((id) => walls[id] ? [{ id, wall: walls[id] }] : []) ?? [];
  const missing = previous?.walls.ids.flatMap((id) => !walls[id] && previous.walls.segments[id] ? [previous.walls.segments[id]] : []) ?? [];
  const foreign = Object.entries(walls).filter(([id]) => !previous?.walls.ids.includes(id)).map(([, wall]) => wall);
  const excluded = [...(previous?.walls.excluded ?? []), ...missing, ...foreign].filter((wall) =>
    Object.values(region.boundary).some((edge) => sameEdge(edge, wall) || overlapOn(edge, wall) !== null),
  );
  for (const entry of old) delete walls[entry.id];
  const ids: string[] = [];
  if (region.walls.mode !== "none") for (const [edgeKey, edge] of Object.entries(region.boundary)) {
    const cuts = new Set([0, 1]);
    for (const other of [...old.map((entry) => entry.wall), ...excluded]) {
      const interval = overlapOn(edge, other);
      if (interval) { cuts.add(interval[0]); cuts.add(interval[1]); }
    }
    const stops = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < stops.length; i++) {
      const lo = stops[i]; const hi = stops[i + 1]; const t = (lo + hi) / 2;
      const part: WallEdge = { ...edge, a: lerp(edge.a, edge.b, lo), b: lerp(edge.a, edge.b, hi) };
      if (dist(part.a, part.b) < 0.01 || excluded.some((wall) => {
        const interval = overlapOn(edge, wall); return sameEdge(edge, wall) || (interval && t >= interval[0] && t <= interval[1]);
      })) continue;
      const matching = old.find(({ wall }) => sameEdge(part, wall));
      const mid = lerp(part.a, part.b, 0.5);
      const near = matching ?? old.find(({ wall }) => {
        const interval = overlapOn(edge, wall); return interval && t >= interval[0] && t <= interval[1];
      });
      const preserved = near?.wall;
      const id = matching?.id ?? (isLatticeKey(edgeKey) && lo === 0 && hi === 1 ? edgeKey : newKey());
      const wall: WallEdge = { ...part, ...region.walls.material, ...(preserved ? edgeSegOf(preserved) : {}), type: preserved?.type ?? "wall" };
      // Curved controls are never subdivided for material: matching untouched spans keep their own material, and a
      // moved/new span gets the chosen wall material. Straight spans can split at existing material/door boundaries.
      if (!preserved && (part.smoothA || part.smoothB)) {
        const nearest = old.filter(({ wall: prior }) => prior.type === "wall").sort((a, b) => projectOnSegment(mid, a.wall.a, a.wall.b).dist - projectOnSegment(mid, b.wall.a, b.wall.b).dist)[0];
        if (nearest && projectOnSegment(mid, nearest.wall.a, nearest.wall.b).dist < 0.12) Object.assign(wall, edgeSegOf(nearest.wall));
      }
      if (region.walls.mode === "hidden" || (preserved?.visible === false && previous?.walls.mode === region.walls.mode)) wall.visible = false;
      else delete wall.visible;
      walls[id] = wall; ids.push(id);
    }
  }
  // Doors/fittings are kept only while seated on the new outline. Split the supporting straight bone around them.
  for (const { id, wall: fitting } of old.filter(({ wall }) => wall.type !== "wall")) {
    if (ids.includes(id) || region.walls.mode === "none") continue;
    for (const supportId of ids) {
      const support = walls[supportId];
      if (support.type !== "wall" || support.smoothA || support.smoothB) continue;
      const pa = projectOnSegment(fitting.a, support.a, support.b);
      const pb = projectOnSegment(fitting.b, support.a, support.b);
      if (pa.dist > 0.12 || pb.dist > 0.12 || dist(pa.foot, pb.foot) < 0.05) continue;
      delete walls[supportId]; ids.splice(ids.indexOf(supportId), 1);
      const lo = Math.min(pa.t, pb.t); const hi = Math.max(pa.t, pb.t);
      for (const [a, b] of [[support.a, lerp(support.a, support.b, lo)], [lerp(support.a, support.b, hi), support.b]]) {
        if (dist(a, b) <= 0.05) continue;
        const key = newKey(); walls[key] = { ...support, a, b }; ids.push(key);
      }
      walls[id] = { ...fitting, a: pa.foot, b: pb.foot, ...(region.walls.mode === "hidden" ? { visible: false } : {}) };
      ids.push(id); break;
    }
  }
  region.walls = { ...region.walls, ids, segments: Object.fromEntries(ids.map((id) => [id, walls[id]])), excluded };
  return { ...layers, walls };
}

export function putGroundRegion(layers: DungeonMapLayers, id: string, region: GroundRegion, newKey: () => string = () => crypto.randomUUID()): DungeonMapLayers {
  const previous = layers.ground[id];
  const attached = attachWalls(layers, previous, region, newKey);
  return projectGround({ ...attached, ground: { ...layers.ground, [id]: region } });
}

export function removeGroundRegion(layers: DungeonMapLayers, id: string): DungeonMapLayers {
  const region = layers.ground[id];
  if (!region) return layers;
  const ground = { ...layers.ground }; delete ground[id];
  const walls = region.walls.ids.length > 0 ? { ...layers.walls } : layers.walls;
  for (const key of region.walls.ids) delete walls[key];
  return projectGround({ ...layers, ground, walls });
}

export function setGroundWalls(layers: DungeonMapLayers, id: string, mode: GroundWallMode): DungeonMapLayers {
  const region = layers.ground[id];
  if (!region || region.walls.mode === mode) return layers;
  return putGroundRegion(layers, id, { ...region, walls: { ...region.walls, mode } });
}

export function applyGroundStroke(layers: DungeonMapLayers, discs: readonly Disc[], opts: BrushOptions): DungeonMapLayers {
  if (discs.length === 0) return layers;
  const base = layers;
  const target = opts.targetId ? base.ground[opts.targetId] : undefined;
  // Erase and Extend both require the chosen source identity; the pointer position never guesses a target.
  if ((opts.erase || opts.mode === "extend") && !target) return layers;
  const previous = opts.erase || opts.mode === "extend" ? target : undefined;
  const loops = groundStrokeLoops(previous ? groundLoops(previous) : [], discs, opts.erase);
  if (loops === null) {
    if (previous && opts.walls && opts.walls !== "none" && previous.walls.mode !== opts.walls) {
      return putGroundRegion(base, opts.targetId!, { ...previous, walls: { ...previous.walls, mode: opts.walls, material: { ...opts.wall } } }, opts.newKey);
    }
    return layers;
  }
  const boundary = Object.assign({}, ...loops.map((loop) => outlineToWalls(loop, { ...opts, wall: previous?.material ?? opts.pack })));
  const id = previous && opts.targetId ? opts.targetId : opts.newKey();
  if (Object.keys(boundary).length === 0) {
    if (!previous) return layers;
    if ((opts.walls ?? "none") !== "none") return removeGroundRegion(base, id);
    const ground = { ...base.ground }; delete ground[id];
    return projectGround({ ...base, ground });
  }
  const z = Math.max(-1, ...Object.values(base.ground).map((r) => r.z)) + 1;
  const region: GroundRegion = previous ? { ...previous, boundary, walls: { ...previous.walls, mode: opts.walls ?? "none", material: { ...opts.wall } } } : {
    name: opts.name ?? `${opts.pack.pack_id} ${opts.category === "terrainWater" ? "water" : "ground"} ${z + 1}`, material: { ...opts.pack }, category: opts.category ?? "floor", z, boundary, variants: {}, walls: { mode: opts.walls ?? "none", material: { ...opts.wall }, ids: [], segments: {}, excluded: [] },
  };
  if (previous && (opts.walls ?? "none") === "none") {
    // Floor-only means exactly that: the old physical outline stays put. Still-aligned owned stretches remain
    // attached; perimeter pieces the floor moved away from become free walls and never move on a later projection.
    const pieces = Object.values(wallsAsPieces(boundary));
    const onNewBoundary = (wall: WallEdge): boolean => [wall.a, wall.b, lerp(wall.a, wall.b, 0.5)].every((p) => pieces.some((piece) => projectOnSegment(p, piece.a, piece.b).dist < 1e-5));
    const ids = previous.walls.ids.filter((key) => base.walls[key] && onNewBoundary(base.walls[key]));
    region.walls = { ...previous.walls, ids, segments: Object.fromEntries(ids.map((key) => [key, base.walls[key]])),
      mode: ids.length > 0 ? previous.walls.mode : "none" };
    return projectGround({ ...base, ground: { ...base.ground, [id]: region } });
  }
  return putGroundRegion(base, id, region, opts.newKey);
}

/** Cell-based tools create the same editable sources as the round brush. */
export function paintGroundCells(layers: DungeonMapLayers, cells: ReadonlySet<CellKey>, material: PackRef, category: GroundRegion["category"] = "floor", wallMode: GroundWallMode = "none", source: { variants?: GroundRegion["variants"]; name?: string } = {}): DungeonMapLayers {
  if (cells.size === 0) return layers;
  const base = layers;
  const z = Math.max(-1, ...Object.values(base.ground).map((r) => r.z)) + 1;
  return putGroundRegion(base, crypto.randomUUID(), { name: source.name ?? `${material.pack_id} ${category === "floor" ? "ground" : "water"} ${z + 1}`, material, category, z, boundary: cellBoundary(cells, material), variants: source.variants ?? {}, walls: { mode: wallMode, material, ids: [], segments: {}, excluded: [] } });
}

/** Explicit eraser tools cut every relevant source, preventing hidden underpaint from reappearing after a reload. */
export function eraseGroundCells(layers: DungeonMapLayers, cells: ReadonlySet<CellKey>, category?: GroundRegion["category"]): DungeonMapLayers {
  const base = layers;
  let result = base;
  for (const [id, region] of Object.entries(base.ground)) {
    if (category && region.category !== category) continue;
    const loops = groundStrokeLoops(groundLoops(region), [], true, cells);
    if (loops === null) continue;
    const boundary = Object.assign({}, ...loops.map((loop) => outlineToWalls(loop, { wall: region.material, newKey: () => crypto.randomUUID() })));
    result = Object.keys(boundary).length === 0 ? removeGroundRegion(result, id) : putGroundRegion(result, id, { ...region, boundary, walls: { ...region.walls } });
  }
  return result;
}

/** Inclusive cell bounds of the drawn source, including shapes too small to own a gameplay cell. */
export function groundCellBounds(layers: DungeonMapLayers): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const boxes = Object.values(layers.ground).map(groundBounds).filter((box) => box !== null);
  if (boxes.length === 0) return null;
  return { minX: Math.floor(Math.min(...boxes.map((b) => b.minX))), minY: Math.floor(Math.min(...boxes.map((b) => b.minY))),
    maxX: Math.ceil(Math.max(...boxes.map((b) => b.maxX))) - 1, maxY: Math.ceil(Math.max(...boxes.map((b) => b.maxY))) - 1 };
}

/** Explicit shape target; starting over another material never selects or merges it. */
export interface BrushStroke { discs: readonly Disc[]; }

/** A brush creates an independent vector shape, or edits only its explicitly selected target. */
export function applyBrushStroke(layers: DungeonMapLayers, stroke: BrushStroke, opts: BrushOptions): DungeonMapLayers {
  return applyGroundStroke(layers, stroke.discs, opts);
}
