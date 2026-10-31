import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { emptyLayers, type CellKey, type DungeonMap } from "@/types/dungeonMap.types";
import type { DerivedSpace, DerivedStructure } from "@/cartographer/structure.types";

import {
  useCartographerStructure,
  applySpaceName,
  buildSpaceRows,
  findNameSourceCell,
} from "./useCartographerStructure";

function space(over: Partial<DerivedSpace>): DerivedSpace {
  return { key: "s:0,0", cells: ["0,0" as CellKey], signature: "1:0", name: null, nameSource: null, ...over };
}

function structure(over: Partial<DerivedStructure>): DerivedStructure {
  return { spaces: [], ways: [], stairs: [], links: [], ...over };
}

describe("buildSpaceRows", () => {
  it("names an unnamed space by its canonical position", () => {
    const nave = space({ key: "s:nave", cells: ["0,0" as CellKey], name: "Nave of Ash", nameSource: "annotation" });
    const region7 = space({ key: "s:r7", cells: ["9,9" as CellKey], name: null, nameSource: null });
    const rows = buildSpaceRows(structure({ spaces: [nave, region7] }), null);
    expect(rows[0]).toMatchObject({ displayName: "Nave of Ash", hasName: true, provenance: "annotation" });
    expect(rows[1]).toMatchObject({ displayName: "Region 2", hasName: false, provenance: "unnamed" });
  });

  it("marks the selected row", () => {
    const cistern = space({ key: "s:cistern", cells: ["1,1", "1,2"] as CellKey[] });
    const rows = buildSpaceRows(structure({ spaces: [cistern] }), "s:cistern");
    expect(rows[0]).toMatchObject({ provenance: "selected", isSelected: true, cellCount: 2 });
  });
});

describe("findNameSourceCell / applySpaceName", () => {
  it("finds the cell whose annotation names the space", () => {
    const layers = emptyLayers();
    layers.annotation["2,3" as CellKey] = { text: "Reliquary" };
    const s = space({ cells: ["1,1", "2,3"] as CellKey[] });
    expect(findNameSourceCell(s, layers.annotation)).toBe("2,3");
  });

  it("returns null when nothing names the space", () => {
    const layers = emptyLayers();
    const s = space({ cells: ["1,1", "2,3"] as CellKey[] });
    expect(findNameSourceCell(s, layers.annotation)).toBeNull();
  });

  it("edits the existing naming annotation rather than adding a second", () => {
    const layers = emptyLayers();
    layers.annotation["2,3" as CellKey] = { text: "Old Name", icon: "torch" };
    const s = space({ cells: ["1,1", "2,3"] as CellKey[] });
    expect(applySpaceName(layers, s, "New Name")).toBe(true);
    expect(layers.annotation["2,3" as CellKey]).toEqual({ text: "New Name", icon: "torch" });
    expect(layers.annotation["1,1" as CellKey]).toBeUndefined();
  });

  it("writes the annotation on the space's first cell when it has none", () => {
    const layers = emptyLayers();
    const s = space({ cells: ["1,1", "2,3"] as CellKey[] });
    expect(applySpaceName(layers, s, "Cistern")).toBe(true);
    expect(layers.annotation["1,1" as CellKey]?.text).toBe("Cistern");
  });

  it("is a no-op when the name is unchanged", () => {
    const layers = emptyLayers();
    layers.annotation["1,1" as CellKey] = { text: "Cistern" };
    const s = space({ cells: ["1,1"] as CellKey[] });
    expect(applySpaceName(layers, s, "Cistern")).toBe(false);
  });

  it("is a no-op when only the annotation's incidental whitespace differs", () => {
    const layers = emptyLayers();
    layers.annotation["1,1" as CellKey] = { text: "Cistern  " };
    const s = space({ cells: ["1,1"] as CellKey[] });
    expect(applySpaceName(layers, s, "Cistern")).toBe(false);
  });

  it("clears the annotation when named down to an empty string", () => {
    const layers = emptyLayers();
    layers.annotation["1,1" as CellKey] = { text: "Cistern" };
    const s = space({ cells: ["1,1"] as CellKey[] });
    expect(applySpaceName(layers, s, "   ")).toBe(true);
    expect(layers.annotation["1,1" as CellKey]).toBeUndefined();
  });
});

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

  it("selects the space under a click, and nothing when the click lands off every room", () => {
    const layers = ref(twoRooms());
    const s = useCartographerStructure(layers, ref({}), ref(null));
    s.selectSpaceAt(1, 0);
    expect(s.selectedSpace.value?.cells).toContain("0,0");
    s.selectSpaceAt(3, 3);
    expect(s.selectedSpace.value).toBeNull();
  });

  it("renames the selected space through its annotation, and renames nothing with none selected", () => {
    const layers = ref(twoRooms());
    const s = useCartographerStructure(layers, ref({}), ref(null));
    expect(s.renameSpace("Nave")).toBe(false);
    s.selectSpaceAt(5, 5);
    expect(s.renameSpace("Nave")).toBe(true);
    expect(layers.value.annotation["5,5" as CellKey]?.text).toBe("Nave");
    expect(s.spaceRows.value.find((r) => r.isSelected)?.displayName).toBe("Nave");
  });

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
