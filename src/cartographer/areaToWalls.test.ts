import { describe, it, expect } from "vitest";
import { convertAreaLayer, hasBrushedArea, readLayers } from "./areaToWalls";
import { applyDiscs, emptyLegacy } from "@/test/legacyArea";
import { deriveSpaces } from "./structure";
import { emptyLayers, cellKey, type PackRef } from "@/types/dungeonMap.types";

const REF: PackRef = { pack_id: "p", pack_version: 1, variant: 3 };
let n = 0;
const newKey = (): string => `a${n++}`;

describe("convertAreaLayer", () => {
  it("a brushed round room becomes a closed smooth wall run with floor on exactly the squares whose middle is inside", () => {
    const old = applyDiscs(emptyLegacy(), [{ x: 10, y: 10, r: 3 }], REF, "paint");
    const out = convertAreaLayer(old, { newKey });
    expect("area" in out).toBe(false);
    const walls = Object.values(out.walls);
    expect(walls.length).toBeGreaterThanOrEqual(8);
    expect(walls.length).toBeLessThanOrEqual(30);
    expect(walls.every((w) => w.smoothA && w.smoothB)).toBe(true);
    for (let y = 5; y < 16; y++) {
      for (let x = 5; x < 16; x++) {
        const inside = Math.hypot(x + 0.5 - 10, y + 0.5 - 10) < 3 - 0.2;
        const outside = Math.hypot(x + 0.5 - 10, y + 0.5 - 10) > 3 + 0.2;
        const has = out.floor[cellKey(x, y)]?.floor !== undefined;
        if (inside) expect(has).toBe(true);
        if (outside) expect(has).toBe(false);
      }
    }
    expect(out.floor[cellKey(10, 10)]?.floor?.variant).toBe(3);
    expect(deriveSpaces(out)).toHaveLength(1);
  });

  it("a map with no area key comes back as the same object, and an empty area key is dropped", () => {
    const l = emptyLayers();
    expect(convertAreaLayer(l, { newKey })).toBe(l);
    expect("area" in convertAreaLayer({ ...l, area: {} }, { newKey })).toBe(false);
    const once = convertAreaLayer(applyDiscs(emptyLegacy(), [{ x: 4, y: 4, r: 2 }], REF, "paint"), { newKey });
    expect(convertAreaLayer(once, { newKey })).toBe(once);
  });

  it("reading a stored row converts it, with the defaults of a map saved before later layers existed", () => {
    const old = applyDiscs(emptyLegacy(), [{ x: 6, y: 6, r: 2 }], REF, "paint");
    const { terrain: _t, ...stored } = old;
    const out = readLayers(stored, { newKey });
    expect("area" in out).toBe(false);
    expect(out.terrain).toEqual({});
    expect(Object.keys(out.walls).length).toBeGreaterThan(0);
    expect(hasBrushedArea(old)).toBe(true);
    expect(hasBrushedArea(out)).toBe(false);
  });

  it("a stretch against plain floor does not become a wall", () => {
    const l = emptyLegacy();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) l.floor[cellKey(x, y)] = { floor: REF };
    const old = applyDiscs(l, [{ x: 4, y: 2, r: 1.5 }], REF, "paint");
    const out = convertAreaLayer(old, { newKey });
    // no wall runs along the old plain-floor block's west side (x < 1)
    const west = Object.values(out.walls).filter((w) => w.a[0] < 1.5 && w.b[0] < 1.5);
    expect(west).toHaveLength(0);
    expect(Object.values(out.walls).length).toBeGreaterThan(0);
  });
});
