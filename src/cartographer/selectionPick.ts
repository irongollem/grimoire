// Which props and lights a Select marquee catches (#1125). A thing is in when its centre is: a prop is grabbed by
// where it stands, not by every cell of its footprint, so a long table is not caught by a box that clips its end.
// Pure: plain values in, ids out.

import { dressingCentre, dressingFootprint, type DressingCatalog, type DressingLayer } from "@/cartographer/dressing";
import type { PlacedLight } from "@/types/dungeonMap.types";

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
