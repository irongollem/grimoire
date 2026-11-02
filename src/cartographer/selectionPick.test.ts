import { describe, expect, it } from "vitest";
import type { DressingCatalog, DressingProp } from "@/cartographer/dressing";
import { lightsInRect, normalizedRect, propsInRect } from "./selectionPick";

const table: DressingProp = { id: "table", name: "Table", footprint_w: 2, footprint_h: 1, image: null, flat: false, light: null, url: null, sway: null };
const catalog: DressingCatalog = new Map([["table", table]]);

describe("a marquee catches a prop by its centre", () => {
  it("does not catch a 2x1 table whose end the box clips (its centre at 3,0.5 is outside 0..2.5)", () => {
    const layer = { t: { prop_id: "table", x: 2, y: 0, rotation: 0, z: 0 } };
    expect(propsInRect(layer, catalog, { x0: 0, y0: 0, x1: 2.5, y1: 1 })).toEqual([]);
    expect(propsInRect(layer, catalog, { x0: 0, y0: 0, x1: 3.2, y1: 1 })).toEqual(["t"]);
  });

  it("measures a quarter-turned table from its turned footprint (a 2x1 turned 90 degrees stands 1x2, centre 0.5,1)", () => {
    const layer = { t: { prop_id: "table", x: 0, y: 0, rotation: 90, z: 0 } };
    expect(propsInRect(layer, catalog, { x0: 0.4, y0: 0.9, x1: 0.6, y1: 1.1 })).toEqual(["t"]);
  });
});

describe("a marquee catches a light by its point", () => {
  const lights = { a: { x: 1, y: 1, light: { color: "#ffaa44", bright: 20, dim: 20 } }, b: { x: 5, y: 5, light: { color: "#ffaa44", bright: 20, dim: 20 } } };
  it("takes only the lights inside, whichever corner the drag began from", () => {
    expect(lightsInRect(lights, { x0: 2, y0: 2, x1: 0, y1: 0 })).toEqual(["a"]);
  });
  it("normalizes a rectangle dragged up and to the left", () => {
    expect(normalizedRect({ x0: 5, y0: 4, x1: 1, y1: 2 })).toEqual({ x0: 1, y0: 2, x1: 5, y1: 4 });
  });
});
