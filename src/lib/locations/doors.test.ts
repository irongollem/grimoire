import { describe, it, expect } from "vitest";
import {
  doorsFromRoomPerspective,
  doorsOfSpace,
  verticalWays,
  doorTitle,
  doorSubtitle,
  edgeAtImageFraction,
  indexSpacesByCell,
  resolveDoorEndpoints,
  resolveEdgeEndpoints,
  type DoorPerspectiveRow,
} from "./doors";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { GridCalibration } from "@/types/location.types";

function row(overrides: Partial<DoorPerspectiveRow> = {}): DoorPerspectiveRow {
  return {
    from_location_id: "room-a",
    to_location_id: "room-b",
    is_one_way: false,
    sort_order: null,
    from_location: { id: "room-a", name: "Flooded Nave" },
    to_location: { id: "room-b", name: "Reliquary" },
    ...overrides,
  };
}

describe("doorsFromRoomPerspective", () => {
  it("shows an outgoing door as leading to its `to` room", () => {
    const rows = [row({ from_location_id: "room-a", to_location_id: "room-b" })];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([
      { door: rows[0], otherRoomId: "room-b", otherRoomName: "Reliquary" },
    ]);
  });

  it("shows a bidirectional incoming door as leading to its `from` room", () => {
    const rows = [
      row({
        from_location_id: "room-b",
        to_location_id: "room-a",
        is_one_way: false,
        from_location: { id: "room-b", name: "Reliquary" },
        to_location: { id: "room-a", name: "Flooded Nave" },
      }),
    ];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([
      { door: rows[0], otherRoomId: "room-b", otherRoomName: "Reliquary" },
    ]);
  });

  it("drops a one-way door that leads INTO this room — not a way out of it", () => {
    const rows = [row({ from_location_id: "room-b", to_location_id: "room-a", is_one_way: true })];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([]);
  });

  it("keeps a one-way door that leads OUT of this room", () => {
    const rows = [row({ from_location_id: "room-a", to_location_id: "room-b", is_one_way: true })];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views).toHaveLength(1);
    expect(views[0].otherRoomId).toBe("room-b");
  });

  it("ignores a row that doesn't touch this room at all", () => {
    const rows = [row({ from_location_id: "room-x", to_location_id: "room-y" })];
    expect(doorsFromRoomPerspective(rows, "room-a")).toEqual([]);
  });

  it("falls back to '???' when the joined room name is missing", () => {
    const rows = [row({ from_location_id: "room-a", to_location_id: "room-b", to_location: null })];
    expect(doorsFromRoomPerspective(rows, "room-a")[0].otherRoomName).toBe("???");
  });

  it("labels a one-sided door 'leads nowhere yet' rather than '???' (#884)", () => {
    const rows = [row({ from_location_id: "room-a", to_location_id: null, to_location: null })];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views).toHaveLength(1);
    expect(views[0].otherRoomId).toBeNull();
    expect(views[0].otherRoomName).toBe("leads nowhere yet");
  });

  it("sorts by sort_order (nulls last), then by the other room's name", () => {
    const rows = [
      row({ to_location_id: "room-c", sort_order: null, to_location: { id: "room-c", name: "Charlie" } }),
      row({ to_location_id: "room-d", sort_order: 2, to_location: { id: "room-d", name: "Delta" } }),
      row({ to_location_id: "room-e", sort_order: null, to_location: { id: "room-e", name: "Alpha" } }),
      row({ to_location_id: "room-f", sort_order: 1, to_location: { id: "room-f", name: "Foxtrot" } }),
    ];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views.map((v) => v.otherRoomName)).toEqual(["Foxtrot", "Delta", "Alpha", "Charlie"]);
  });

  it("merges outgoing and bidirectional-incoming doors into one list", () => {
    const rows = [
      row({ from_location_id: "room-a", to_location_id: "room-b" }),
      row({
        from_location_id: "room-c",
        to_location_id: "room-a",
        is_one_way: false,
        from_location: { id: "room-c", name: "Crypt" },
        to_location: { id: "room-a", name: "Flooded Nave" },
      }),
      row({ from_location_id: "room-d", to_location_id: "room-a", is_one_way: true }),
    ];
    const views = doorsFromRoomPerspective(rows, "room-a");
    expect(views.map((v) => v.otherRoomName).sort()).toEqual(["Crypt", "Reliquary"]);
  });
});

describe("doorsOfSpace", () => {
  it("is the same merge as doorsFromRoomPerspective, for a space that may be a nested site", () => {
    const rows = [row({ from_location_id: "level-2", to_location_id: "room-b" })];
    expect(doorsOfSpace(rows, "level-2")).toEqual(doorsFromRoomPerspective(rows, "level-2"));
  });
});

describe("verticalWays", () => {
  it("keeps only stair and shaft kinds", () => {
    const doors = [
      { door_kind: "door" as const },
      { door_kind: "stair" as const },
      { door_kind: "arch" as const },
      { door_kind: "shaft" as const },
      { door_kind: "portal" as const },
    ];
    expect(verticalWays(doors).map((d) => d.door_kind)).toEqual(["stair", "shaft"]);
  });

  it("returns an empty list when nothing is vertical", () => {
    expect(verticalWays([{ door_kind: "door" as const }, { door_kind: "arch" as const }])).toEqual([]);
  });
});

describe("doorTitle", () => {
  const names = new Map([
    ["nave", "Nave"],
    ["cell", "Abbot's Cell"],
    ["stair", "Drowned Stair"],
    ["vault", "Sunken Vault"],
  ]);

  it("joins two spaces with a right arrow for a horizontal kind", () => {
    expect(doorTitle({ from_location_id: "nave", to_location_id: "cell", door_kind: "door" }, names)).toBe(
      "Nave → Abbot's Cell",
    );
  });

  it("joins two spaces with a down arrow for a vertical kind", () => {
    expect(doorTitle({ from_location_id: "stair", to_location_id: "vault", door_kind: "stair" }, names)).toBe(
      "Drowned Stair ↓ Sunken Vault",
    );
  });

  it("falls back to '???' for a space id not in the map", () => {
    expect(doorTitle({ from_location_id: "nave", to_location_id: "unknown", door_kind: "door" }, names)).toBe(
      "Nave → ???",
    );
  });
});

describe("doorSubtitle", () => {
  function subtitleRow(overrides: Partial<import("./doors").DoorSubtitleRow> = {}): import("./doors").DoorSubtitleRow {
    return {
      door_kind: "door",
      is_secret: false,
      starts_locked: false,
      lock_note: null,
      label: "",
      is_one_way: false,
      ...overrides,
    };
  }

  it("leads with Secret and the label when the door is secret", () => {
    expect(subtitle({ is_secret: true, label: "behind the ash-screen" })).toBe("Secret · behind the ash-screen");
  });

  it("leads with Locked and the lock note when the door starts locked", () => {
    expect(subtitle({ starts_locked: true, lock_note: "the brass key" })).toBe("Locked · the brass key");
  });

  it("leads with the kind label and the door's label otherwise, for a horizontal kind", () => {
    expect(subtitle({ door_kind: "door", label: "iron grille" })).toBe("Door · iron grille");
  });

  it("prefers Secret over Locked when a door is both", () => {
    expect(subtitle({ is_secret: true, starts_locked: true, lock_note: "a key", label: "a note" })).toBe(
      "Secret · a note",
    );
  });

  it("omits the separator when there is no free-text detail", () => {
    expect(subtitle({ is_secret: true, label: "" })).toBe("Secret");
    expect(subtitle({ starts_locked: true, lock_note: null })).toBe("Locked");
    expect(subtitle({ door_kind: "arch", label: "" })).toBe("Arch");
  });

  it("names a two-way vertical kind's climb direction alongside its label", () => {
    expect(subtitle({ door_kind: "stair", is_one_way: false, label: "flooded at the base" })).toBe(
      "Stair · two-way · flooded at the base",
    );
  });

  it("names a one-way vertical kind's climb direction alongside its label", () => {
    expect(subtitle({ door_kind: "shaft", is_one_way: true, label: "40 ft, no climb" })).toBe(
      "Shaft · one-way · 40 ft, no climb",
    );
  });

  it("still names the climb direction for a vertical kind with no label", () => {
    expect(subtitle({ door_kind: "stair", is_one_way: false, label: "" })).toBe("Stair · two-way");
  });

  function subtitle(overrides: Partial<import("./doors").DoorSubtitleRow>): string {
    return doorSubtitle(subtitleRow(overrides));
  }
});

// ── Endpoints derived from the plan (#884) ───────────────────────────────────

function mapRegion(over: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "r1",
    user_id: "u",
    site_location_id: "site",
    space_location_id: null,
    cells: [],
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "dm",
    cell_signature: null,
    vertices: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("indexSpacesByCell", () => {
  it("indexes only bound space-role regions", () => {
    const regions = [
      mapRegion({ id: "a", space_location_id: "room-a", cells: ["0,0", "1,0"] }),
      mapRegion({ id: "b", region_role: "zone", zone_kind: "hazard", space_location_id: null, cells: ["2,0"] }),
      mapRegion({ id: "c", space_location_id: null, cells: ["3,0"] }), // traced but unbound
    ];
    const index = indexSpacesByCell(regions);
    expect(index.get("0,0")).toBe("room-a");
    expect(index.get("1,0")).toBe("room-a");
    expect(index.has("2,0")).toBe(false);
    expect(index.has("3,0")).toBe(false);
  });
});

describe("resolveEdgeEndpoints", () => {
  it("resolves both sides traced: the owner cell is from, the neighbour is to", () => {
    // "1,1:N" is owned by cell (1,1); its N neighbour is (1,0).
    const cellToSpace = new Map([
      ["1,1", "room-south"],
      ["1,0", "room-north"],
    ] as const);
    expect(resolveEdgeEndpoints("1,1:N", cellToSpace)).toEqual({ fromLocationId: "room-south", toLocationId: "room-north" });
  });

  it("resolves a W edge the same way, against its owner cell and its W neighbour", () => {
    // "1,1:W" is owned by cell (1,1); its W neighbour is (0,1).
    const cellToSpace = new Map([
      ["1,1", "room-east"],
      ["0,1", "room-west"],
    ] as const);
    expect(resolveEdgeEndpoints("1,1:W", cellToSpace)).toEqual({ fromLocationId: "room-east", toLocationId: "room-west" });
  });

  it("resolves one side traced: the traced side becomes from, to is null", () => {
    const ownerOnly = new Map([["1,1", "room-south"]] as const);
    expect(resolveEdgeEndpoints("1,1:N", ownerOnly)).toEqual({ fromLocationId: "room-south", toLocationId: null });

    const neighborOnly = new Map([["1,0", "room-north"]] as const);
    expect(resolveEdgeEndpoints("1,1:N", neighborOnly)).toEqual({ fromLocationId: "room-north", toLocationId: null });
  });

  it("resolves neither side traced to null", () => {
    expect(resolveEdgeEndpoints("1,1:N", new Map())).toBeNull();
  });

  it("resolves both sides landing in the same region to null — not a way out", () => {
    const sameRoom = new Map([
      ["1,1", "room-a"],
      ["1,0", "room-a"],
    ] as const);
    expect(resolveEdgeEndpoints("1,1:N", sameRoom)).toBeNull();
  });
});

describe("resolveDoorEndpoints", () => {
  const regions = [
    mapRegion({ id: "south", space_location_id: "room-south", cells: ["1,1"] }),
    mapRegion({ id: "north", space_location_id: "room-north", cells: ["1,0"] }),
  ];

  it("resolves every placed door against the region set", () => {
    const doors = [
      { id: "door-1", edge_key: "1,1:N" as const },
      { id: "door-2", edge_key: null },
    ];
    const results = resolveDoorEndpoints(doors, regions);
    expect(results).toEqual([{ doorId: "door-1", endpoints: { fromLocationId: "room-south", toLocationId: "room-north" } }]);
  });

  it("skips a never-placed door entirely — there is no edge to resolve", () => {
    const results = resolveDoorEndpoints([{ id: "door-1", edge_key: null }], regions);
    expect(results).toEqual([]);
  });

  // The defect this pins: while only the north room was traced, the door had
  // to be from=north. Tracing the south room later would hand `from` to
  // whichever cell owns the edge (south, by the NW convention) and silently
  // reverse a door the DM had set one-way. Geometry is derived; direction is
  // authored. Found by the #884 review pass.
  it("keeps the authored direction when the far side is traced later", () => {
    const onlyNorth = [mapRegion({ id: "north", space_location_id: "room-north", cells: ["1,0"] })];
    const oneSided = resolveDoorEndpoints([{ id: "d", edge_key: "1,1:N" as const }], onlyNorth);
    expect(oneSided[0].endpoints).toEqual({ fromLocationId: "room-north", toLocationId: null });

    const nowBoth = resolveDoorEndpoints(
      // `from_location_id` is the whole input: the far side is what the edge
      // now says it is, the near side is what the DM authored.
      [{ id: "d", edge_key: "1,1:N" as const, from_location_id: "room-north" }],
      regions,
    );
    expect(nowBoth[0].endpoints).toEqual({ fromLocationId: "room-north", toLocationId: "room-south" });
  });

  it("takes the derivation when the door's own from is no longer one of the two spaces", () => {
    const results = resolveDoorEndpoints(
      [{ id: "d", edge_key: "1,1:N" as const, from_location_id: "room-elsewhere" }],
      regions,
    );
    expect(results[0].endpoints).toEqual({ fromLocationId: "room-south", toLocationId: "room-north" });
  });
});

describe("edgeAtImageFraction", () => {
  const calibration: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 };

  it("snaps to the nearest edge within the threshold band", () => {
    // Cell (0,0) spans image fractions [0, 0.1) — near its top (N) edge.
    const key = edgeAtImageFraction(0.05, 0.005, calibration, 1000, 1000);
    expect(key).toBe("0,0:N");
  });

  it("returns null in the dead middle of a cell", () => {
    const key = edgeAtImageFraction(0.05, 0.05, calibration, 1000, 1000);
    expect(key).toBeNull();
  });

  it("canonicalises a south-edge hover to the neighbour's north edge", () => {
    // Near the bottom of cell (0,0) is the same physical edge as the top of (0,1).
    const key = edgeAtImageFraction(0.05, 0.095, calibration, 1000, 1000);
    expect(key).toBe("0,1:N");
  });
});
