// Shared builders for the wall-edit tests: lattice walls by line, angled walls by uuid.

import type { WallEdge } from "@/types/dungeonMap.types";
import type { WallMap } from "./graph";

const base = { type: "wall", pack_id: "p", pack_version: 1, variant: 0 } as const;

export function lattice(map: WallMap, x0: number, y0: number, x1: number, y1: number, over: Partial<WallEdge> = {}): void {
  if (y0 === y1) {
    for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x++) map[`${x},${y0}:N`] = { ...base, ...over, a: [x, y0], b: [x + 1, y0] };
  } else {
    for (let y = Math.min(y0, y1); y < Math.max(y0, y1); y++) map[`${x0},${y}:W`] = { ...base, ...over, a: [x0, y], b: [x0, y + 1] };
  }
}

export function rect(x0: number, y0: number, x1: number, y1: number): WallMap {
  const m: WallMap = {};
  lattice(m, x0, y0, x1, y0);
  lattice(m, x0, y1, x1, y1);
  lattice(m, x0, y0, x0, y1);
  lattice(m, x1, y0, x1, y1);
  return m;
}

export function angled(map: WallMap, id: string, a: [number, number], b: [number, number], over: Partial<WallEdge> = {}): void {
  map[id] = { ...base, ...over, a, b };
}

export function counter(): () => string {
  let n = 0;
  return () => `new-${n++}`;
}
