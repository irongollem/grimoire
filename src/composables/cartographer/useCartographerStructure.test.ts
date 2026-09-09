import { describe, it, expect } from "vitest";
import { emptyLayers, type CellKey } from "@/types/dungeonMap.types";
import type { DerivedLink, DerivedSpace, DerivedStructure } from "@/cartographer/structure.types";
import {
  applySpaceName,
  buildLinkedSummary,
  buildSpaceRows,
  buildWaysSummary,
  eraseZoneCell,
  findNameSourceCell,
  paintZoneCell,
} from "./useCartographerStructure";

function space(over: Partial<DerivedSpace>): DerivedSpace {
  return { key: "s:0,0", cells: ["0,0" as CellKey], signature: "1:0", name: null, nameSource: null, ...over };
}

function structure(over: Partial<DerivedStructure>): DerivedStructure {
  return { spaces: [], ways: [], stairs: [], zones: [], links: [], ...over };
}

describe("buildSpaceRows", () => {
  it("names an unnamed space by its canonical position", () => {
    const nave = space({ key: "s:nave", cells: ["0,0" as CellKey], name: "Nave of Ash", nameSource: "annotation" });
    const region7 = space({ key: "s:r7", cells: ["9,9" as CellKey], name: null, nameSource: null });
    const rows = buildSpaceRows(structure({ spaces: [nave, region7] }), null);
    expect(rows[0]).toMatchObject({ displayName: "Nave of Ash", hasName: true, provenance: "annotation" });
    expect(rows[1]).toMatchObject({ displayName: "Region 2", hasName: false, provenance: "unnamed" });
  });

  it("marks the selected row and counts zones inside it", () => {
    const cistern = space({ key: "s:cistern", cells: ["1,1", "1,2"] as CellKey[] });
    const zoneInside = { zoneId: "z1", kind: "hazard" as const, label: "Flooded", cells: ["1,1"] as CellKey[], signature: "1:x" };
    const zoneOutside = { zoneId: "z2", kind: "light" as const, label: null, cells: ["9,9"] as CellKey[], signature: "1:y" };
    const rows = buildSpaceRows(structure({ spaces: [cistern], zones: [zoneInside, zoneOutside] }), "s:cistern");
    expect(rows[0]).toMatchObject({ provenance: "selected", isSelected: true, zoneCount: 1, cellCount: 2 });
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

describe("buildWaysSummary", () => {
  it("groups ways by kind and destination, pluralising the count", () => {
    const cistern = space({ key: "s:cistern" });
    const reliquary = space({ key: "s:reliquary", name: "Reliquary" });
    const nave = space({ key: "s:nave", name: "Nave" });
    const st = structure({
      spaces: [cistern, reliquary, nave],
      ways: [
        { edgeKey: "1,1:N" as never, kind: "door", fromKey: "s:cistern", toKey: "s:reliquary" },
        { edgeKey: "2,2:N" as never, kind: "door", fromKey: "s:cistern", toKey: "s:reliquary" },
        { edgeKey: "3,3:W" as never, kind: "arch", fromKey: "s:nave", toKey: "s:cistern" },
      ],
    });
    expect(buildWaysSummary(cistern, st)).toBe("2 doors → Reliquary · 1 arch → Nave");
  });

  it("reports no ways out when the space has none", () => {
    const cistern = space({ key: "s:cistern" });
    expect(buildWaysSummary(cistern, structure({ spaces: [cistern] }))).toBe("No ways out yet.");
  });
});

describe("buildLinkedSummary", () => {
  const resolvers = {
    encounters: new Map([["e1", "Thing in the Cistern"]]),
    traps: new Map<string, string>(),
    features: new Map<string, string>(),
    notes: new Map<string, string>(),
  };

  it("resolves a linked entity to its name", () => {
    const links: DerivedLink[] = [{ cellKey: "1,1" as CellKey, spaceKey: "s:cistern", metadata: { encounter_id: "e1" } }];
    expect(buildLinkedSummary(links, "s:cistern", resolvers)).toEqual(["Encounter 'Thing in the Cistern'"]);
  });

  it("falls back to a bare label when the id no longer resolves", () => {
    const links: DerivedLink[] = [{ cellKey: "1,1" as CellKey, spaceKey: "s:cistern", metadata: { trap_id: "gone" } }];
    expect(buildLinkedSummary(links, "s:cistern", resolvers)).toEqual(["Trap linked"]);
  });

  it("ignores links belonging to a different space", () => {
    const links: DerivedLink[] = [{ cellKey: "1,1" as CellKey, spaceKey: "s:nave", metadata: { encounter_id: "e1" } }];
    expect(buildLinkedSummary(links, "s:cistern", resolvers)).toEqual([]);
  });
});

describe("paintZoneCell / eraseZoneCell", () => {
  it("paints a zone cell and is a no-op when nothing changed", () => {
    const layers = emptyLayers();
    expect(paintZoneCell(layers, 1, 1, "z1", "hazard", "Flooded")).toBe(true);
    expect(layers.zone?.["1,1" as CellKey]).toEqual({ zone_id: "z1", kind: "hazard", label: "Flooded" });
    expect(paintZoneCell(layers, 1, 1, "z1", "hazard", "Flooded")).toBe(false);
  });

  it("repaints a cell into a different zone", () => {
    const layers = emptyLayers();
    paintZoneCell(layers, 1, 1, "z1", "hazard", null);
    expect(paintZoneCell(layers, 1, 1, "z2", "light", "Torchlit")).toBe(true);
    expect(layers.zone?.["1,1" as CellKey]).toEqual({ zone_id: "z2", kind: "light", label: "Torchlit" });
  });

  it("tolerates a map saved before the zone layer existed", () => {
    const layers = emptyLayers();
    delete layers.zone;
    expect(paintZoneCell(layers, 0, 0, "z1", "terrain", null)).toBe(true);
    expect(layers.zone?.["0,0" as CellKey]).toEqual({ zone_id: "z1", kind: "terrain", label: null });
  });

  it("erases a zone cell and is a no-op when nothing was there", () => {
    const layers = emptyLayers();
    paintZoneCell(layers, 1, 1, "z1", "hazard", null);
    expect(eraseZoneCell(layers, 1, 1)).toBe(true);
    expect(layers.zone?.["1,1" as CellKey]).toBeUndefined();
    expect(eraseZoneCell(layers, 1, 1)).toBe(false);
  });
});
