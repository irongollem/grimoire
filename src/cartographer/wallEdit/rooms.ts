// Rooms from the wall graph (epic #1125, canvas frame 17): every closed loop of walls is a face, and the floor follows
// the faces. Ported from wallgraph's `walkFaces` / `detectRooms`, in cell units: half-edges sorted by angle, next edge
// the one just clockwise of the twin, a positive shoelace area marking a bounded face.

import type { CellKey } from "@/types/dungeonMap.types";
import type { WallGraph } from "./graph";
import { pointInPolygon, polygonArea, type Pt } from "./geometry";

export interface Room {
  /** Corners in walk order, including any bends and the ends of spurs the walk passes. */
  polygon: [number, number][];
  /** Enclosed area in cells. */
  area: number;
  /** Keys of the wall segments on its boundary. */
  segments: string[];
}

interface HalfEdge {
  from: string;
  to: string;
  seg: string;
  visited: boolean;
}

/** Bounded faces of the graph. A room inside another room is its own face and also lies inside the outer polygon. */
export function detectRooms(graph: WallGraph): Room[] {
  const half: HalfEdge[] = [];
  const outgoing = new Map<string, number[]>();
  for (const s of graph.segs.values()) {
    // Twin pairs sit at 2i and 2i+1.
    for (const [from, to] of [[s.from, s.to], [s.to, s.from]] as const) {
      outgoing.set(from, [...(outgoing.get(from) ?? []), half.length]);
      half.push({ from, to, seg: s.key, visited: false });
    }
  }
  const angle = (i: number): number => {
    const a = graph.nodes.get(half[i].from)!;
    const b = graph.nodes.get(half[i].to)!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  for (const list of outgoing.values()) list.sort((p, q) => angle(p) - angle(q));

  const rooms: Room[] = [];
  for (let start = 0; start < half.length; start++) {
    if (half[start].visited) continue;
    const verts: [number, number][] = [];
    const segs = new Set<string>();
    for (let cur = start; !half[cur].visited; ) {
      const he = half[cur];
      he.visited = true;
      const n = graph.nodes.get(he.from)!;
      verts.push([n.x, n.y]);
      segs.add(he.seg);
      const outs = outgoing.get(he.to)!;
      const pos = outs.indexOf(cur % 2 === 0 ? cur + 1 : cur - 1);
      cur = outs[(pos - 1 + outs.length) % outs.length];
    }
    const area = polygonArea(verts);
    if (verts.length >= 3 && area > 1e-9) rooms.push({ polygon: verts, area, segments: [...segs] });
  }
  return rooms;
}

const cellKey = (x: number, y: number): CellKey => `${x},${y}`;

/** Cells whose centre lies inside the polygon. */
export function floorCellsOf(polygon: readonly Pt[]): CellKey[] {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const out: CellKey[] = [];
  for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
      if (pointInPolygon([x + 0.5, y + 0.5], polygon)) out.push(cellKey(x, y));
    }
  }
  return out;
}

const floorOf = (rooms: readonly Room[]): Set<CellKey> => new Set(rooms.flatMap((r) => floorCellsOf(r.polygon)));

/** The floor edit that follows a wall edit: cells now inside a room that were not, and cells that no room covers any more. */
export function floorChange(before: readonly Room[], after: readonly Room[]): { add: CellKey[]; remove: CellKey[] } {
  const was = floorOf(before);
  const now = floorOf(after);
  return { add: [...now].filter((c) => !was.has(c)), remove: [...was].filter((c) => !now.has(c)) };
}
