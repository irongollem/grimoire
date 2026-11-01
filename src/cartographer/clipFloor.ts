// A room's floor drawn clipped to its wall line (epic #1125, Map Table frame 17: "the floor is drawn clipped to the
// wall line. Floors stay squares underneath, so tiles, fog and token footprints keep working").
//
// Only rooms bounded by an angled wall (a chamfer, a node dragged off the grid) need it: a room whose outline runs
// along square edges is covered by whole squares exactly, and keeps being drawn that way by `paintGround`. For the
// others every square the outline touches is laid and clipped to the outline, so the floor meets the wall along its
// line: nothing pokes past it, and a square whose middle fell just outside still shows its inside part, borrowing the
// tile of the room's floor next to it.

import type { CellKey, DungeonMapLayers } from "@/types/dungeonMap.types";
import { cellKey, parseCellKey } from "@/types/dungeonMap.types";
import type { GridPoint } from "@/types/locationMapRegion.types";
import { pointInRing } from "@/lib/locations/polygon";
import type { Frame, Target } from "./drawFrame";
import type { PackCategory } from "./packSchema";
import type { TilePackRuntime } from "./packLoader";
import { crossesSquare, findFaces, type FoundFace } from "./roomOutline";
import { projectOnSegment } from "./wallEdit/geometry";
import { isLatticeKey } from "./wallGraph";

export type VariantAt = (r: TilePackRuntime, category: PackCategory, x: number, y: number, stored: number) => number;

export interface ClippedRoom {
  outline: GridPoint[];
  box: { minX: number; minY: number; maxX: number; maxY: number };
  /** Squares to lay: the room's own floor, and squares the outline cuts through (those with `borrow` have none). */
  squares: { x: number; y: number; borrow: CellKey | null }[];
}

export interface ClippedGround {
  rooms: ClippedRoom[];
  /** Squares a clipped room draws, which `paintGround` must therefore not draw whole. */
  handled: ReadonlySet<CellKey>;
}

const NONE: ClippedGround = { rooms: [], handled: new Set() };
const EPS = 1e-6;

const onGrid = (v: number): boolean => Math.abs(v - Math.round(v)) < EPS;

/** An outline of whole squares: every corner on the grid and every edge along it. */
function runsAlongSquares(outline: readonly GridPoint[]): boolean {
  return outline.every((p, i) => {
    const q = outline[(i + 1) % outline.length];
    return onGrid(p[0]) && onGrid(p[1]) && (Math.abs(p[0] - q[0]) < EPS || Math.abs(p[1] - q[1]) < EPS);
  });
}

/** A middle on the outline itself counts as outside: a square is the room's only where its middle is inside. */
function middleIsOutside(outline: readonly GridPoint[], px: number, py: number): boolean {
  if (!pointInRing(px, py, outline)) return true;
  return outline.some((p, i) => projectOnSegment([px, py], p, outline[(i + 1) % outline.length]).dist < EPS);
}

function isOpenFloor(layers: DungeonMapLayers, key: CellKey): boolean {
  return !layers.solidBlock[key] && layers.floor[key]?.floor !== undefined;
}

function build(layers: DungeonMapLayers): ClippedGround {
  // Only an angled wall makes an outline that leaves the grid.
  if (!Object.keys(layers.walls).some((k) => !isLatticeKey(k))) return NONE;

  const all = findFaces(layers);
  const faces = all.filter((f) => !runsAlongSquares(f.outline) && f.cells.length > 0);
  if (faces.length === 0) return NONE;

  const owner = new Map<CellKey, FoundFace>();
  for (const f of all) for (const k of f.cells) owner.set(k, f);
  const rooms: ClippedRoom[] = [];
  const handled = new Set<CellKey>();

  for (const face of faces) {
    const squares = new Map<CellKey, ClippedRoom["squares"][number]>();
    for (const k of face.cells) {
      const [x, y] = parseCellKey(k);
      squares.set(k, { x, y, borrow: null });
    }
    const own = [...squares.values()];
    const n = face.outline.length;
    for (let i = 0; i < n; i++) {
      const a = face.outline[i];
      const b = face.outline[(i + 1) % n];
      for (let y = Math.floor(Math.min(a[1], b[1])); y <= Math.floor(Math.max(a[1], b[1])); y++) {
        for (let x = Math.floor(Math.min(a[0], b[0])); x <= Math.floor(Math.max(a[0], b[0])); x++) {
          const k = cellKey(x, y);
          if (squares.has(k) || layers.solidBlock[k]) continue;
          if (!crossesSquare(a, b, x, y)) continue;
          // A square another room owns is that room's to draw.
          if (owner.has(k) && owner.get(k) !== face) continue;
          if (isOpenFloor(layers, k)) {
            squares.set(k, { x, y, borrow: null });
          } else if (middleIsOutside(face.outline, x + 0.5, y + 0.5) && own.length > 0) {
            // Middle outside, part inside: it takes the tile of the nearest floor of the room.
            let best = own[0];
            for (const o of own) if ((o.x - x) ** 2 + (o.y - y) ** 2 < (best.x - x) ** 2 + (best.y - y) ** 2) best = o;
            squares.set(k, { x, y, borrow: cellKey(best.x, best.y) });
          }
        }
      }
    }
    const xs = face.outline.map((p) => p[0]);
    const ys = face.outline.map((p) => p[1]);
    for (const k of squares.keys()) handled.add(k);
    rooms.push({
      outline: face.outline,
      box: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
      squares: [...squares.values()],
    });
  }
  return { rooms, handled };
}

type Cached = { floor: unknown; solidBlock: unknown; ground: ClippedGround };
const cache = new WeakMap<object, Cached>();

/** The clipped rooms of a drawing, kept per `layers.walls` (the editor redraws on every pointer move). */
export function cachedClippedGround(layers: DungeonMapLayers): ClippedGround {
  const hit = cache.get(layers.walls);
  if (hit && hit.floor === layers.floor && hit.solidBlock === layers.solidBlock) return hit.ground;
  const ground = build(layers);
  cache.set(layers.walls, { floor: layers.floor, solidBlock: layers.solidBlock, ground });
  return ground;
}

/** Lays the floor of every angled room in the window, clipped to its outline. */
export function paintClippedGround(f: Frame, t: Target, variantAt: VariantAt): void {
  const { tilePx, bounds, layers, runtime } = f;
  const { ctx } = t;
  for (const room of cachedClippedGround(layers).rooms) {
    const b = room.box;
    if (b.maxX < bounds.minX || b.minX > bounds.maxX + 1 || b.maxY < bounds.minY || b.minY > bounds.maxY + 1) continue;
    let opened = false;
    for (const { x, y, borrow } of room.squares) {
      // One square past the window: a borrowed square can sit just outside the painted extent of a bake.
      if (x < bounds.minX - 1 || x > bounds.maxX + 1 || y < bounds.minY - 1 || y > bounds.maxY + 1) continue;
      const key = cellKey(x, y);
      // Water drawn on the square takes the place of its floor, as it does for a whole square.
      const terrain = layers.terrain[key];
      if (terrain && (runtime(terrain.pack_id)?.variantCount("terrainWater") ?? 0) > 0) continue;
      const ref = layers.floor[borrow ?? key]?.floor;
      const r = ref ? runtime(ref.pack_id) : null;
      if (!ref || !r) continue;
      if (!opened) {
        opened = true;
        ctx.save();
        ctx.beginPath();
        room.outline.forEach(([px, py], i) => {
          const sx = px * tilePx - t.ox;
          const sy = py * tilePx - t.oy;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.clip();
      }
      const tile = r.getTile("floor", variantAt(r, "floor", x, y, ref.variant));
      ctx.drawImage(tile.source, x * tilePx - t.ox, y * tilePx - t.oy, tilePx, tilePx);
    }
    if (opened) ctx.restore();
  }
}
