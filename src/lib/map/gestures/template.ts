// The template gesture (epic #884 S7a, decision 6): click a centre, drag a
// radius, drop a circle/octagon/hex. Moved here from the Cartographer's
// `geometry.ts` (the room-template half of it — see `caveBrush.ts` for the
// noise half), which already served both systems: the Atlas's
// `lib/locations/polygon.ts` imported `cellsForTemplate` from here rather
// than re-deriving the shapes, so this relocation is a rename, not a merge.
//
// Two derivations coexist on purpose and are NOT unified further:
//   - `cellsForTemplate` enumerates exact grid cells by index. The
//     Cartographer's template tool wants this directly — it plants floor in
//     one shot and never stores the shape, so there is nothing to keep
//     editable.
//   - `lib/locations/polygon.ts`'s `templateRing` draws the same shape as a
//     vertex ring, and `cellsInsideRing` derives cells from *that*. The
//     Atlas needs the ring — a template drop there becomes `vertices`,
//     stayed editable with the pen afterward — and accepts that a 16-gon
//     circle outline only approximates `cellsInCircle` (~90% overlap;
//     octagon and hex match exactly by construction, see that module's own
//     docblock). Routing the Cartographer through the ring path too would
//     change what it paints, which this story's "behaviour must not change"
//     rule forbids — so the two derivations stay, both reusing this module's
//     shapes rather than re-deriving them.

import type { CellKey } from "@/types/dungeonMap.types";
import { cellKey } from "@/types/dungeonMap.types";

// Not named/exported as its own type: `lib/locations/polygon.ts` already
// owns the canonical `TemplateShape` union (consumed outside this story's
// ownership, e.g. `SiteMapRegionList.vue`), and that module imports
// `cellsForTemplate` from here — naming a second `TemplateShape` here would
// either duplicate that type or import it back, circularly, for a type only
// used inline below.
type Shape = "circle" | "octagon" | "hex";

// All shapes are centered on (cx, cy) with approximate radius r (in cells).

export function cellsInCircle(cx: number, cy: number, r: number): CellKey[] {
  const out: CellKey[] = [];
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) out.push(cellKey(cx + dx, cy + dy));
    }
  }
  return out;
}

// Grid-aligned octagon: clips a square by cutting the four 45° corners.
// Corner cut = ~30% of radius so all eight sides have roughly equal length.
export function cellsInOctagon(cx: number, cy: number, r: number): CellKey[] {
  const out: CellKey[] = [];
  const cut = Math.round(r * 0.3);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx <= r && ady <= r && adx + ady <= 2 * r - cut) {
        out.push(cellKey(cx + dx, cy + dy));
      }
    }
  }
  return out;
}

// Pointy-top hex approximation on a square grid: the row width narrows
// by 1 cell for every 2 rows away from the equator.
export function cellsInHex(cx: number, cy: number, r: number): CellKey[] {
  const out: CellKey[] = [];
  for (let dy = -r; dy <= r; dy++) {
    const halfWidth = r - Math.ceil(Math.abs(dy) / 2);
    for (let dx = -halfWidth; dx <= halfWidth; dx++) {
      out.push(cellKey(cx + dx, cy + dy));
    }
  }
  return out;
}

export function cellsForTemplate(
  cx: number,
  cy: number,
  r: number,
  shape: Shape,
): CellKey[] {
  if (r <= 0) return [cellKey(cx, cy)];
  if (shape === "circle") return cellsInCircle(cx, cy, r);
  if (shape === "octagon") return cellsInOctagon(cx, cy, r);
  return cellsInHex(cx, cy, r);
}
