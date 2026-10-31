import { describe, expect, it } from "vitest";
import type { DerivedSpace } from "@/cartographer/structure.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import { findAgain, materializeFound, zoningList } from "./foundRooms";

function space(key: string, cells: CellKey[], name: string | null = null): DerivedSpace {
  return { key, cells, signature: `sig:${cells.join(";")}`, name, nameSource: name ? "annotation" : null };
}

function row(id: string, over: Partial<LocationMapRegion>): LocationMapRegion {
  return {
    id,
    site_location_id: "site",
    space_location_id: null,
    cells: [],
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "floodfill",
    cell_signature: null,
    vertices: null,
    ...over,
  } as LocationMapRegion;
}

const NAMES = new Map<string, string>();
const hall = space("s:0,0", ["0,0", "1,0", "0,1", "1,1"]);
const crypt = space("s:5,0", ["5,0", "6,0"]);

describe("zoningList", () => {
  // Decision: rooms are found live and wait in the list, not only at publish.
  it("lists a derived room with no row exactly once, as found", () => {
    const list = zoningList([hall], [], NAMES);
    expect(list).toEqual([{ kind: "found", space: hall }]);
  });

  // A row that already claims the room must not leave a second, virtual copy of it in the list.
  it("does not also list as found a room that a row claims by overlap", () => {
    const moved = row("r1", { cells: ["0,0", "1,0", "0,1"], cell_signature: "old", space_location_id: "room-a" });
    const list = zoningList([hall], [moved], NAMES);
    expect(list.filter((e) => e.kind === "found")).toHaveLength(0);
    expect(list).toHaveLength(1);
  });

  // The Zoning list is one list: an unbound row (a reshaped found room, or a hand-traced one) still owns its room.
  it("does not list a room as found when an unbound row already sits on it", () => {
    const unbound = row("r1", { cells: hall.cells, cell_signature: hall.signature, derived_from: "dm" });
    expect(zoningList([hall], [unbound], NAMES).filter((e) => e.kind === "found")).toHaveLength(0);
  });

  it("marks a floodfill row found, and a dm row not found, when both match a derived room", () => {
    const a = row("a", { cells: hall.cells, cell_signature: hall.signature, derived_from: "floodfill" });
    const b = row("b", { cells: crypt.cells, cell_signature: crypt.signature, derived_from: "dm", space_location_id: "crypt" });
    const [ea, eb] = zoningList([hall, crypt], [a, b], NAMES);
    expect(ea).toMatchObject({ found: true, changed: false });
    expect(eb).toMatchObject({ found: false });
  });

  // A floodfill row whose walls vanished is an orphan, never "found" (publish keeps it too, nothing is deleted).
  it("does not call a floodfill row found once nothing derived matches it", () => {
    const gone = row("g", { cells: ["20,20"], cell_signature: "x", derived_from: "floodfill" });
    expect(zoningList([], [gone], NAMES)[0]).toMatchObject({ found: false, space: null });
  });

  it("flags a found row whose walls moved as changed", () => {
    const stale = row("r1", { cells: ["0,0", "1,0", "0,1"], cell_signature: "old" });
    expect(zoningList([hall], [stale], NAMES)[0]).toMatchObject({ found: true, changed: true });
  });

  it("puts rooms first, then found rooms, then the other zone kinds", () => {
    const zone = row("z", { region_role: "zone", zone_kind: "entrance", derived_from: "dm" });
    const kinds = zoningList([hall], [zone], NAMES).map((e) => (e.kind === "found" ? "found" : e.region.region_role));
    expect(kinds).toEqual(["found", "zone"]);
  });

  it("gives two derived rooms two different rows rather than letting one row claim both", () => {
    const only = row("r1", { cells: hall.cells, cell_signature: hall.signature });
    const twin = space("s:0,0b", hall.cells);
    const found = zoningList([hall, twin], [only], NAMES).filter((e) => e.kind === "found");
    expect(found).toHaveLength(1);
  });
});

describe("materializeFound", () => {
  it("makes the untouched room a floodfill row carrying the walls' signature and cells", () => {
    expect(materializeFound(crypt, "site")).toMatchObject({
      site_location_id: "site",
      region_role: "space",
      derived_from: "floodfill",
      cell_signature: crypt.signature,
      cells: crypt.cells,
    });
  });

  // Renaming a found room is the DM touching it: it must read dm so Find again and Publish leave it.
  it("stamps the row dm when the DM's edit comes with it", () => {
    const insert = materializeFound(crypt, "site", { label: "Crypt of Ash" });
    expect(insert).toMatchObject({ derived_from: "dm", label: "Crypt of Ash", cell_signature: crypt.signature });
  });
});

describe("findAgain", () => {
  it("hands a found row whose walls moved its new cells and signature", () => {
    const stale = row("r1", { cells: ["0,0", "1,0", "0,1"], cell_signature: "old" });
    expect(findAgain([hall], [stale], NAMES)).toEqual([{ id: "r1", update: { cells: hall.cells, cell_signature: hall.signature } }]);
  });

  // The maintainer's rule: Find again redraws only the rooms you never touched.
  it("never includes a room the DM touched", () => {
    const mine = row("r1", { cells: ["0,0", "1,0", "0,1"], cell_signature: "old", derived_from: "dm", label: "Throne Room" });
    expect(findAgain([hall], [mine], NAMES)).toEqual([]);
  });

  it("leaves a found row alone when its walls have not moved", () => {
    const same = row("r1", { cells: hall.cells, cell_signature: hall.signature });
    expect(findAgain([hall], [same], NAMES)).toEqual([]);
  });

  it("leaves a floodfill row whose room is gone alone instead of deleting it", () => {
    const gone = row("g", { cells: ["20,20"], cell_signature: "x" });
    expect(findAgain([hall], [gone], NAMES)).toEqual([]);
  });

  // Unbound found rows are the ones a DM has not named yet; they are the most untouched of all.
  it("redraws an unbound found row too", () => {
    const stale = row("r1", { cells: ["0,0", "1,0", "0,1"], cell_signature: "old", space_location_id: null });
    expect(findAgain([hall], [stale], NAMES)).toHaveLength(1);
  });

  it("does not touch zones", () => {
    const zone = row("z", { region_role: "zone", zone_kind: "hazard", cells: hall.cells, cell_signature: "old" });
    expect(findAgain([hall], [zone], NAMES)).toEqual([]);
  });
});
