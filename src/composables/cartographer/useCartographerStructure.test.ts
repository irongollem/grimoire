import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { emptyLayers, type CellKey, type DungeonMap } from "@/types/dungeonMap.types";

import { useCartographerStructure } from "./useCartographerStructure";

describe("useCartographerStructure", () => {
  const STONE = { pack_id: "base", pack_version: 1, variant: 0 };

  /** Two floor rooms with a gap between them, so two separate spaces. */
  function twoRooms() {
    const layers = emptyLayers();
    layers.floor["0,0" as CellKey] = { floor: STONE };
    layers.floor["1,0" as CellKey] = { floor: STONE };
    layers.floor["5,5" as CellKey] = { floor: STONE };
    return layers;
  }

  it("reports nothing changed without a published map, and counts a newly drawn room against the published one", () => {
    const layers = ref(twoRooms());
    expect(useCartographerStructure(layers, ref({}), ref(null)).changedSinceLastPublish.value).toBeNull();

    const published = { layers: twoRooms(), metadata: {} } as unknown as DungeonMap;
    const s = useCartographerStructure(layers, ref({}), ref(published));
    expect(s.changedSinceLastPublish.value?.total).toBe(0);
    layers.value = { ...layers.value, floor: { ...layers.value.floor, ["9,9" as CellKey]: { floor: STONE } } };
    expect(s.changedSinceLastPublish.value).toMatchObject({ newSpaces: 1, total: 1 });

    const erased = ref(twoRooms());
    const fewer = useCartographerStructure(erased, ref({}), ref(published));
    delete erased.value.floor["5,5" as CellKey];
    expect(fewer.changedSinceLastPublish.value).toMatchObject({ goneSpaces: 1, total: 1 });
  });
});
