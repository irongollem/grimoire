// Which props, objects and lights a Select marquee catches (#1125). A thing is in when its centre is: a prop is grabbed by
// where it stands, not by every cell of its footprint, so a long table is not caught by a box that clips its end.
// Pure: plain values in, ids out.

import { dressingCentre, dressingFootprint, type DressingCatalog, type DressingLayer } from "@/cartographer/dressing";
import { cellKey, parseCellKey, type CellKey, type ObjectCell, type PlacedLight } from "@/types/dungeonMap.types";

export interface CellRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The same rectangle with its corners in order, whichever way it was dragged. */
export function normalizedRect(r: CellRect): CellRect {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}

const inside = (r: CellRect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

export function propsInRect(dressing: DressingLayer, catalog: DressingCatalog, rect: CellRect): string[] {
  const r = normalizedRect(rect);
  return Object.entries(dressing)
    .filter(([, placement]) => {
      const { w, h } = dressingFootprint(placement, catalog);
      const c = dressingCentre(placement, w, h);
      return inside(r, c.x, c.y);
    })
    .map(([id]) => id);
}

export function lightsInRect(lights: Readonly<Record<string, PlacedLight>>, rect: CellRect): string[] {
  const r = normalizedRect(rect);
  return Object.entries(lights).filter(([, l]) => inside(r, l.x, l.y)).map(([id]) => id);
}

/** Pack objects stand one to a cell; the box catches an object by the centre of its cell, as it catches a prop. */
export function objectsInRect(objects: Readonly<Record<CellKey, ObjectCell>>, rect: CellRect): CellKey[] {
  const r = normalizedRect(rect);
  return (Object.keys(objects) as CellKey[]).filter((key) => {
    const [x, y] = parseCellKey(key);
    return inside(r, x + 0.5, y + 0.5);
  });
}

/** The object whose cell holds the point, if any. */
export function objectAtPoint(objects: Readonly<Record<CellKey, ObjectCell>>, x: number, y: number): CellKey | null {
  const key = cellKey(Math.floor(x), Math.floor(y));
  return objects[key] ? key : null;
}
