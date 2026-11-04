import { describe, it, expect } from "vitest";
import { convertAreaLayer, hasBrushedArea, readLayers } from "./areaToWalls";
import { applyDiscs, emptyLegacy } from "@/test/legacyArea";
import { deriveSpaces } from "./structure";
import { projectGround } from "./groundRegions";
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
    const { terrain: _t, ground: _ground, ...stored } = old;
    const out = readLayers(stored, { newKey });
    expect("area" in out).toBe(false);
    expect(out.terrain).toEqual({});
    expect(Object.keys(out.walls).length).toBeGreaterThan(0);
    expect(Object.keys(out.ground).length).toBeGreaterThan(0);
    expect(hasBrushedArea(old)).toBe(true);
    expect(hasBrushedArea(out)).toBe(false);
  });

  it("converts saved cells into source regions once and retains their identities after save and reload", () => {
    const { ground: _ground, ...stored } = emptyLayers();
    stored.floor["0,0"] = { floor: REF };
    stored.floor["1,0"] = { floor: { ...REF, variant: 9 } };
    stored.terrain["1,0"] = { ...REF, pack_id: "water", variant: 2 };
    const first = readLayers(stored, { newKey });
    const ids = Object.keys(first.ground);
    expect(ids).toHaveLength(2);
    expect(projectGround(first).floor).toEqual(stored.floor);
    expect(projectGround(first).terrain).toEqual(stored.terrain);

    const saved: typeof first = JSON.parse(JSON.stringify(first));
    let minted = 0;
    const second = readLayers(saved, { newKey: () => `unexpected-${minted++}` });
    expect(second.ground).toEqual(first.ground);
    expect(Object.keys(second.ground)).toEqual(ids);
    expect(minted).toBe(0);
  });

  it("groups random variants without flattening material, rotation, holes or disconnected islands", () => {
    const { ground: _ground, ...stored } = emptyLayers();
    const ring = ["0,0", "1,0", "2,0", "0,1", "2,1", "0,2", "1,2", "2,2"] as const;
    ring.forEach((key, index) => { stored.floor[key] = { floor: { ...REF, variant: index } }; });
    stored.floor["5,5"] = { floor: REF };
    stored.floor["3,2"] = { floor: { ...REF, rotation: 90 } };
    const out = readLayers(stored, { newKey });
    expect(Object.values(out.ground)).toHaveLength(3);
    expect(projectGround(out).floor).toEqual(stored.floor);
    expect(projectGround(out).floor["1,1"]).toBeUndefined();
    const main = Object.values(out.ground).find((region) => Object.keys(region.variants).length === 8);
    expect(main?.variants["0,0"]).toBe(0);
    expect(main?.variants["2,2"]).toBe(7);
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
