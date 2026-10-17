import { describe, expect, it } from "vitest";
import { emptyLayers, paintedCellCount } from "./dungeonMap.types";

const ref = { pack_id: "p", pack_version: 1, variant: 0 };

describe("paintedCellCount", () => {
  it("is zero for an empty map", () => {
    expect(paintedCellCount(emptyLayers())).toBe(0);
  });

  it("counts a cell once however many layers it has", () => {
    const layers = emptyLayers();
    layers.floor["0,0"] = { floor: ref };
    layers.object["0,0"] = { ...ref, category: "objectBarrel" };
    layers.solidBlock["1,0"] = ref;
    layers.terrain["2,0"] = ref;
    expect(paintedCellCount(layers)).toBe(3);
  });

  it("counts a brushed cell that is covered too little to carry floor", () => {
    const layers = emptyLayers();
    layers.area["4,4"] = { ...ref, mask: "0000000000000001" };
    expect(paintedCellCount(layers)).toBe(1);
  });
});
