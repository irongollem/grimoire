import { describe, expect, it } from "vitest";
import { emptyLayers, paintedCellCount, withLayerDefaults } from "./dungeonMap.types";

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
});

describe("withLayerDefaults", () => {
  it("fills the layers a map saved before they existed lacks", () => {
    const layers = withLayerDefaults({ floor: { "1,1": "stone" } } as never);
    expect(layers.dressing).toEqual({});
    expect(layers.floor).toEqual({ "1,1": "stone" });
  });

  it("reads a layer stored as null as empty, so counting it does not throw", () => {
    const layers = withLayerDefaults({ terrain: null } as never);
    expect(layers.terrain).toEqual({});
    expect(paintedCellCount(layers)).toBe(0);
  });
});

describe("withLayerDefaults and the retired area layer", () => {
  it("never passes a stored `area` on, so no reader can see brushed coverage again", () => {
    const layers = withLayerDefaults({ area: { "1,1": { mask: "full" } } } as never);
    expect("area" in layers).toBe(false);
  });
});
