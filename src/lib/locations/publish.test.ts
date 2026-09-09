import { describe, it, expect } from "vitest";
import { planPublish, matchSpace, matchZone, jaccard, isCreatedRef, createdRefKey } from "./publish";
import type { PublishInputs } from "./publish";
import { cellSignature } from "@/cartographer/cellSignature";
import type {
  DerivedLink,
  DerivedSpace,
  DerivedStair,
  DerivedStructure,
  DerivedWay,
  DerivedZone,
} from "@/cartographer/structure.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { LocationDoor } from "@/types/locationDoor.types";
import type { LocationPlacement } from "@/types/locationPlacement.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { LocationType } from "@/types/location.types";

function boundSpace(id: string, name: string, location_type: LocationType = "room") {
  return { id, name, location_type };
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq++;
  return `${prefix}-${idSeq}`;
}

function makeSpace(overrides: Partial<DerivedSpace> = {}): DerivedSpace {
  const cells: CellKey[] = overrides.cells ?? ["0,0", "0,1", "1,0", "1,1"];
  return {
    key: `s:${cells[0]}`,
    cells,
    signature: cellSignature(cells),
    name: null,
    nameSource: null,
    ...overrides,
  };
}

function makeRegion(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  const cells: CellKey[] = overrides.cells ?? ["0,0", "0,1", "1,0", "1,1"];
  return {
    id: nextId("region"),
    user_id: "user-1",
    site_location_id: "site-1",
    space_location_id: nextId("space"),
    cells,
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "floodfill",
    cell_signature: cellSignature(cells),
    vertices: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDoor(overrides: Partial<LocationDoor> = {}): LocationDoor {
  return {
    id: nextId("door"),
    user_id: "user-1",
    from_location_id: "room-a",
    to_location_id: "room-b",
    label: "",
    is_one_way: false,
    starts_locked: false,
    lock_note: null,
    is_secret: false,
    sort_order: null,
    door_kind: "door",
    source_edge_key: "0,1:N",
    dungeon_feature_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePlacement(overrides: Partial<LocationPlacement> = {}): LocationPlacement {
  return {
    id: nextId("placement"),
    user_id: "user-1",
    location_id: "room-a",
    trap_id: null,
    dungeon_feature_id: null,
    roll_table_id: null,
    loot_table_id: null,
    note: null,
    sort_order: null,
    source_cell_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeLink(overrides: Partial<DerivedLink> = {}): DerivedLink {
  return {
    cellKey: "5,5",
    spaceKey: null,
    metadata: {},
    ...overrides,
  };
}

function makeWay(overrides: Partial<DerivedWay> = {}): DerivedWay {
  return {
    edgeKey: "0,1:N",
    kind: "door",
    fromKey: "s:from",
    toKey: "s:to",
    ...overrides,
  };
}

function makeStair(overrides: Partial<DerivedStair> = {}): DerivedStair {
  return {
    cellKey: "9,9",
    direction: "down",
    spaceKey: "s:from",
    ...overrides,
  };
}

function makeZone(overrides: Partial<DerivedZone> = {}): DerivedZone {
  const cells: CellKey[] = overrides.cells ?? ["2,2", "2,3"];
  return {
    zoneId: nextId("zone"),
    kind: "hazard",
    label: null,
    cells,
    signature: cellSignature(cells),
    ...overrides,
  };
}

function makeDerived(overrides: Partial<DerivedStructure> = {}): DerivedStructure {
  return {
    spaces: [],
    ways: [],
    stairs: [],
    zones: [],
    links: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<PublishInputs> = {}): PublishInputs {
  return {
    siteId: "site-1",
    derived: makeDerived(),
    spaces: [],
    regions: [],
    doors: [],
    placements: [],
    ...overrides,
  };
}

// ── jaccard ──────────────────────────────────────────────────────────────

describe("jaccard", () => {
  it("is 1 for two empty sets — neither agreement nor disagreement", () => {
    expect(jaccard([], [])).toBe(1);
  });

  it("is 0 when one set is empty and the other is not", () => {
    expect(jaccard([], ["0,0"])).toBe(0);
    expect(jaccard(["0,0"], [])).toBe(0);
  });

  it("is 1 for identical sets", () => {
    expect(jaccard(["0,0", "0,1"], ["0,1", "0,0"])).toBe(1);
  });

  it("computes intersection over union for partial overlap", () => {
    // {a,b} vs {b,c} -> intersection 1, union 3
    expect(jaccard(["0,0", "0,1"], ["0,1", "0,2"])).toBeCloseTo(1 / 3);
  });
});

// ── matchSpace ───────────────────────────────────────────────────────────

describe("matchSpace", () => {
  it("matches by identical signature even when a different candidate overlaps more", () => {
    const cells: CellKey[] = ["0,0", "0,1", "1,0", "1,1"];
    const space = makeSpace({ cells });
    const exact = makeRegion({ cells, cell_signature: cellSignature(cells) });
    const overlapping = makeRegion({ cells: ["0,0", "0,1", "1,0"], cell_signature: "stale" });
    const result = matchSpace(space, [overlapping, exact], new Map());
    expect(result?.by).toBe("signature");
    expect(result?.region).toBe(exact);
  });

  it("picks the best-overlapping candidate, not merely the first one above threshold", () => {
    const space = makeSpace({ cells: ["0,0", "0,1", "1,0", "1,1", "2,0"] });
    const weak = makeRegion({ cells: ["0,0", "0,1", "1,0"], cell_signature: "weak" }); // 3/6 = 0.5
    const strong = makeRegion({ cells: ["0,0", "0,1", "1,0", "1,1"], cell_signature: "strong" }); // 4/5 = 0.8
    const result = matchSpace(space, [weak, strong], new Map());
    expect(result?.by).toBe("overlap");
    expect(result?.region).toBe(strong);
  });

  it("falls back to an exact name match when overlap is below threshold", () => {
    const space = makeSpace({ cells: ["8,8", "8,9"], name: "Ossuary" });
    const region = makeRegion({ cells: ["0,0", "0,1"], cell_signature: "no-match", space_location_id: "room-oss" });
    const names = new Map([["room-oss", "Ossuary"]]);
    const result = matchSpace(space, [region], names);
    expect(result?.by).toBe("name");
    expect(result?.region).toBe(region);
  });

  it("returns null when nothing matches by signature, overlap or name", () => {
    const space = makeSpace({ cells: ["8,8", "8,9"], name: "Ossuary" });
    const region = makeRegion({ cells: ["0,0", "0,1"], cell_signature: "no-match", space_location_id: "room-x" });
    const names = new Map([["room-x", "Some Other Room"]]);
    expect(matchSpace(space, [region], names)).toBeNull();
  });

  it("ignores unbound and zone-role regions as candidates", () => {
    const cells: CellKey[] = ["4,4", "4,5"];
    const space = makeSpace({ cells });
    const unbound = makeRegion({ cells, cell_signature: cellSignature(cells), space_location_id: null });
    const zoneRegion = makeRegion({
      cells,
      cell_signature: cellSignature(cells),
      region_role: "zone",
      zone_kind: "hazard",
      space_location_id: null,
    });
    expect(matchSpace(space, [unbound, zoneRegion], new Map())).toBeNull();
  });
});

// ── matchZone ────────────────────────────────────────────────────────────

describe("matchZone", () => {
  it("matches by identical signature even when a different candidate overlaps more", () => {
    const cells: CellKey[] = ["2,2", "2,3", "2,4", "2,5"];
    const zone = makeZone({ cells, kind: "hazard" });
    const exact = makeRegion({
      cells,
      cell_signature: cellSignature(cells),
      region_role: "zone",
      zone_kind: "hazard",
    });
    const overlapping = makeRegion({
      cells: ["2,2", "2,3", "2,4"],
      cell_signature: "stale",
      region_role: "zone",
      zone_kind: "hazard",
    });
    const result = matchZone(zone, [overlapping, exact]);
    expect(result?.by).toBe("signature");
    expect(result?.region).toBe(exact);
  });

  it("picks the best-overlapping same-kind candidate over a weaker one", () => {
    const zone = makeZone({ cells: ["2,2", "2,3", "2,4", "2,5", "2,6"], kind: "hazard" });
    const weak = makeRegion({
      cells: ["2,2", "2,3", "2,4"],
      cell_signature: "weak",
      region_role: "zone",
      zone_kind: "hazard",
    }); // 3/6 = 0.5
    const strong = makeRegion({
      cells: ["2,2", "2,3", "2,4", "2,5"],
      cell_signature: "strong",
      region_role: "zone",
      zone_kind: "hazard",
    }); // 4/5 = 0.8
    const result = matchZone(zone, [weak, strong]);
    expect(result?.by).toBe("overlap");
    expect(result?.region).toBe(strong);
  });

  it("never matches across zone kinds by overlap", () => {
    const zone = makeZone({ cells: ["2,2", "2,3"], kind: "hazard" });
    const otherKind = makeRegion({
      cells: ["2,2", "2,3"],
      cell_signature: "other",
      region_role: "zone",
      zone_kind: "trigger",
    });
    expect(matchZone(zone, [otherKind])).toBeNull();
  });

  it("falls back to a kind+label match only when the zone's own label is non-null", () => {
    const zone = makeZone({ cells: ["9,9"], kind: "hazard", label: "Ash cloud" });
    const region = makeRegion({
      cells: ["0,0"],
      cell_signature: "no-match",
      region_role: "zone",
      zone_kind: "hazard",
      label: "Ash cloud",
    });
    const result = matchZone(zone, [region]);
    expect(result?.by).toBe("label");
    expect(result?.region).toBe(region);
  });

  it("never matches two unlabeled same-kind zones to each other", () => {
    const zone = makeZone({ cells: ["9,9"], kind: "hazard", label: null });
    const region = makeRegion({
      cells: ["0,0"],
      cell_signature: "no-match",
      region_role: "zone",
      zone_kind: "hazard",
      label: null,
    });
    expect(matchZone(zone, [region])).toBeNull();
  });

  it("ignores space-role regions as candidates", () => {
    const cells: CellKey[] = ["4,4", "4,5"];
    const zone = makeZone({ cells, kind: "hazard" });
    const spaceRegion = makeRegion({ cells, cell_signature: cellSignature(cells), region_role: "space" });
    expect(matchZone(zone, [spaceRegion])).toBeNull();
  });
});

// ── isCreatedRef / createdRefKey ─────────────────────────────────────────

describe("isCreatedRef / createdRefKey", () => {
  it("round-trips a created placeholder id", () => {
    const id = "created:s:0,0";
    expect(isCreatedRef(id)).toBe(true);
    expect(createdRefKey(id)).toBe("s:0,0");
  });

  it("is false for a real id", () => {
    expect(isCreatedRef("room-abc-123")).toBe(false);
  });
});

// ── planPublish: spaces ──────────────────────────────────────────────────

describe("planPublish — spaces", () => {
  it("skips a space whose matched region has the identical signature", () => {
    const cells: CellKey[] = ["0,0", "0,1"];
    const space = makeSpace({ cells });
    const region = makeRegion({ cells, cell_signature: cellSignature(cells) });
    const plan = planPublish(makeInput({ derived: makeDerived({ spaces: [space] }), regions: [region] }));
    expect(plan.spaces).toEqual([{ kind: "skip", space, region }]);
  });

  it("updates a floodfill-derived region whose shape changed", () => {
    const space = makeSpace({ cells: ["0,0", "0,1", "1,0", "1,1", "2,0"] }); // 5 cells
    const region = makeRegion({ cells: ["0,0", "0,1", "1,0", "1,1"], derived_from: "floodfill" }); // 4 cells, overlap 0.8
    const plan = planPublish(makeInput({ derived: makeDerived({ spaces: [space] }), regions: [region] }));
    expect(plan.spaces).toEqual([
      { kind: "update", space, region, before: 4, after: 5, reason: "shape" },
    ]);
  });

  it("holds a dm-edited region back instead of updating it", () => {
    const space = makeSpace({ cells: ["0,0", "0,1", "1,0", "1,1", "2,0"] });
    const region = makeRegion({ cells: ["0,0", "0,1", "1,0", "1,1"], derived_from: "dm" });
    const plan = planPublish(makeInput({ derived: makeDerived({ spaces: [space] }), regions: [region] }));
    expect(plan.spaces).toEqual([{ kind: "held", space, region, reason: "dm-edited" }]);
  });

  it("proposes the annotation's text as the name for a new space", () => {
    const space = makeSpace({ cells: ["9,9"], name: "Abbot's Cell", nameSource: "annotation" });
    const plan = planPublish(makeInput({ derived: makeDerived({ spaces: [space] }) }));
    expect(plan.spaces).toEqual([{ kind: "create", space, proposedName: "Abbot's Cell" }]);
  });

  it("numbers unnamed new spaces in canonical cell order", () => {
    const far = makeSpace({ cells: ["9,9"], key: "s:9,9" });
    const near = makeSpace({ cells: ["0,0"], key: "s:0,0" });
    // Passed in reverse order on purpose — the plan must still number by cell order.
    const plan = planPublish(makeInput({ derived: makeDerived({ spaces: [far, near] }) }));
    expect(plan.spaces).toEqual([
      { kind: "create", space: near, proposedName: "Region 1" },
      { kind: "create", space: far, proposedName: "Region 2" },
    ]);
  });

  it("orphans a bound region no derived space matches any more", () => {
    const region = makeRegion({ cells: ["7,7"], label: "Vanished Room" });
    const plan = planPublish(makeInput({ regions: [region] }));
    expect(plan.spaces).toEqual([{ kind: "orphan", region }]);
  });

  it("matches a reshaped space by its bound room's name when overlap falls short", () => {
    const region = makeRegion({ cells: ["0,0", "0,1"], space_location_id: "room-ossuary", derived_from: "floodfill" });
    // Cells barely overlap (1 of 4 shared -> jaccard 0.2), so only the name ties them together.
    const space = makeSpace({ cells: ["0,1", "5,5", "5,6", "5,7"], name: "Ossuary" });
    const plan = planPublish(
      makeInput({
        derived: makeDerived({ spaces: [space] }),
        regions: [region],
        spaces: [boundSpace("room-ossuary", "Ossuary")],
      }),
    );
    expect(plan.spaces).toEqual([
      { kind: "update", space, region, before: 2, after: 4, reason: "shape" },
    ]);
  });
});

// ── planPublish: ways ────────────────────────────────────────────────────

describe("planPublish — ways", () => {
  it("creates a way with endpoints resolved through matched/created spaces", () => {
    const fromSpace = makeSpace({ key: "s:from", cells: ["0,0"] }); // unmatched -> created
    const toRegion = makeRegion({ cells: ["5,5"] });
    const toSpace = makeSpace({ key: "s:to", cells: toRegion.cells, signature: toRegion.cell_signature! });
    const way = makeWay({ edgeKey: "0,1:N", fromKey: "s:from", toKey: "s:to" });
    const plan = planPublish(
      makeInput({ derived: makeDerived({ spaces: [fromSpace, toSpace], ways: [way] }), regions: [toRegion] }),
    );
    expect(plan.ways).toEqual([
      { kind: "create", way, fromSpaceId: "created:s:from", toSpaceId: toRegion.space_location_id },
    ]);
  });

  it("skips a matched door with no DM authoring", () => {
    const door = makeDoor({ source_edge_key: "0,1:N", door_kind: "door", label: "" });
    const way = makeWay({ edgeKey: "0,1:N", kind: "door" });
    const plan = planPublish(makeInput({ derived: makeDerived({ ways: [way] }), doors: [door] }));
    expect(plan.ways).toEqual([{ kind: "skip", way, door }]);
  });

  it("holds a way whose door starts_locked", () => {
    const door = makeDoor({ source_edge_key: "0,1:N", starts_locked: true });
    const way = makeWay({ edgeKey: "0,1:N" });
    const plan = planPublish(makeInput({ derived: makeDerived({ ways: [way] }), doors: [door] }));
    expect(plan.ways).toEqual([{ kind: "held", way, door, reason: "dm-edited" }]);
  });

  it("holds a way whose door is_secret", () => {
    const door = makeDoor({ source_edge_key: "0,1:N", is_secret: true });
    const way = makeWay({ edgeKey: "0,1:N" });
    const plan = planPublish(makeInput({ derived: makeDerived({ ways: [way] }), doors: [door] }));
    expect(plan.ways).toEqual([{ kind: "held", way, door, reason: "dm-edited" }]);
  });

  it("holds a way whose door carries a lock_note", () => {
    const door = makeDoor({ source_edge_key: "0,1:N", lock_note: "the brass key" });
    const way = makeWay({ edgeKey: "0,1:N" });
    const plan = planPublish(makeInput({ derived: makeDerived({ ways: [way] }), doors: [door] }));
    expect(plan.ways).toEqual([{ kind: "held", way, door, reason: "dm-edited" }]);
  });

  it("holds a way whose door has a DM-authored label", () => {
    const door = makeDoor({ source_edge_key: "0,1:N", label: "iron grille" });
    const way = makeWay({ edgeKey: "0,1:N" });
    const plan = planPublish(makeInput({ derived: makeDerived({ ways: [way] }), doors: [door] }));
    expect(plan.ways).toEqual([{ kind: "held", way, door, reason: "dm-edited" }]);
  });

  it("updates a door_kind mismatch when the door carries no DM authoring — the drawing changed, not the DM", () => {
    const door = makeDoor({ source_edge_key: "0,1:N", door_kind: "stair" });
    const way = makeWay({ edgeKey: "0,1:N", kind: "door" });
    const plan = planPublish(makeInput({ derived: makeDerived({ ways: [way] }), doors: [door] }));
    expect(plan.ways).toEqual([{ kind: "update", way, door, before: "stair", after: "door" }]);
  });

  it("holds a door_kind mismatch instead of updating it when the door also carries DM authoring", () => {
    const door = makeDoor({ source_edge_key: "0,1:N", door_kind: "stair", label: "iron grille" });
    const way = makeWay({ edgeKey: "0,1:N", kind: "door" });
    const plan = planPublish(makeInput({ derived: makeDerived({ ways: [way] }), doors: [door] }));
    expect(plan.ways).toEqual([{ kind: "held", way, door, reason: "dm-edited" }]);
  });

  it("leaves a stair unresolved with no chosen target", () => {
    const stair = makeStair({ cellKey: "9,9", spaceKey: "s:from" });
    const plan = planPublish(makeInput({ derived: makeDerived({ stairs: [stair] }) }));
    expect(plan.ways).toEqual([{ kind: "unresolved-stair", stair }]);
  });

  it("a stair on a cell no space claims is always unresolved, even with a target given", () => {
    const stair = makeStair({ cellKey: "9,9", spaceKey: null });
    const plan = planPublish(
      makeInput({ derived: makeDerived({ stairs: [stair] }), stairTargets: { "9,9": "room-b" } }),
    );
    expect(plan.ways).toEqual([{ kind: "unresolved-stair", stair }]);
  });

  it("creates a stair once the DM has picked a target", () => {
    const stair = makeStair({ cellKey: "9,9", spaceKey: "s:from" });
    const fromSpace = makeSpace({ key: "s:from", cells: ["0,0"] });
    const plan = planPublish(
      makeInput({
        derived: makeDerived({ spaces: [fromSpace], stairs: [stair] }),
        stairTargets: { "9,9": "level-2" },
      }),
    );
    expect(plan.ways).toEqual([
      { kind: "create-stair", stair, fromSpaceId: "created:s:from", toSpaceId: "level-2" },
    ]);
  });
});

// ── planPublish: placements ──────────────────────────────────────────────

describe("planPublish — placements", () => {
  it("keeps a placement whose cell is still in the same room", () => {
    const roomA = makeRegion({ cells: ["3,3"], space_location_id: "room-A" });
    const spaceA = makeSpace({ key: "s:a", cells: ["3,3"], signature: roomA.cell_signature! });
    const placement = makePlacement({ trap_id: "trap-1", location_id: "room-A", source_cell_key: "3,3" });
    const plan = planPublish(
      makeInput({ derived: makeDerived({ spaces: [spaceA] }), regions: [roomA], placements: [placement] }),
    );
    expect(plan.placements).toEqual([{ kind: "keep", placement }]);
  });

  it("reanchors a placement whose cell now belongs to a different room", () => {
    const roomA = makeRegion({ cells: ["3,3"], space_location_id: "room-A" });
    const roomB = makeRegion({ cells: ["9,9"], space_location_id: "room-B" });
    const spaceA = makeSpace({ key: "s:a", cells: ["3,3"], signature: roomA.cell_signature! });
    const spaceB = makeSpace({ key: "s:b", cells: ["9,9"], signature: roomB.cell_signature! });
    const placement = makePlacement({ trap_id: "trap-1", location_id: "room-A", source_cell_key: "9,9" });
    const plan = planPublish(
      makeInput({
        derived: makeDerived({ spaces: [spaceA, spaceB] }),
        regions: [roomA, roomB],
        placements: [placement],
      }),
    );
    expect(plan.placements).toEqual([
      { kind: "reanchor", placement, spaceRef: { kind: "existing", spaceId: "room-B" } },
    ]);
  });

  it("marks a placement lost-room when its cell is in no space at all", () => {
    const placement = makePlacement({ trap_id: "trap-1", location_id: "room-A", source_cell_key: "7,7" });
    const plan = planPublish(makeInput({ placements: [placement] }));
    expect(plan.placements).toEqual([{ kind: "lost-room", placement }]);
  });

  it("creates a placement for a trap link with no existing placement anywhere in the site", () => {
    const roomA = makeRegion({ cells: ["3,3"], space_location_id: "room-A" });
    const spaceA = makeSpace({ key: "s:a", cells: ["3,3"], signature: roomA.cell_signature! });
    const link = makeLink({ cellKey: "3,3", spaceKey: "s:a", metadata: { trap_id: "trap-99" } });
    const plan = planPublish(
      makeInput({ derived: makeDerived({ spaces: [spaceA], links: [link] }), regions: [roomA] }),
    );
    expect(plan.placements).toEqual([
      { kind: "create", link, target: { kind: "trap", id: "trap-99" }, spaceRef: { kind: "existing", spaceId: "room-A" } },
    ]);
  });

  it("always keeps roll-table and loot-table placements — they never rode a cell", () => {
    const placement = makePlacement({ loot_table_id: "loot-1", location_id: "room-A", source_cell_key: null });
    const plan = planPublish(makeInput({ placements: [placement] }));
    expect(plan.placements).toEqual([{ kind: "keep", placement }]);
  });

  it("reanchors (not merely keeps) a room-level placement once a link supplies its cell", () => {
    const roomA = makeRegion({ cells: ["3,3"], space_location_id: "room-A" });
    const spaceA = makeSpace({ key: "s:a", cells: ["3,3"], signature: roomA.cell_signature! });
    const placement = makePlacement({ trap_id: "trap-1", location_id: "room-A", source_cell_key: null });
    const link = makeLink({ cellKey: "3,3", spaceKey: "s:a", metadata: { trap_id: "trap-1" } });
    const plan = planPublish(
      makeInput({
        derived: makeDerived({ spaces: [spaceA], links: [link] }),
        regions: [roomA],
        placements: [placement],
      }),
    );
    expect(plan.placements).toEqual([
      { kind: "reanchor", placement, spaceRef: { kind: "existing", spaceId: "room-A" } },
    ]);
  });

  it("reports an encounter link as a note, with a null spaceRef when it sits on no space", () => {
    const link = makeLink({ cellKey: "6,6", spaceKey: null, metadata: { encounter_id: "enc-1" } });
    const plan = planPublish(makeInput({ derived: makeDerived({ links: [link] }) }));
    expect(plan.placements).toEqual([{ kind: "note", link, spaceRef: null }]);
  });

  it("reports a note link with its resolved room when it does sit on a space", () => {
    const roomA = makeRegion({ cells: ["3,3"], space_location_id: "room-A" });
    const spaceA = makeSpace({ key: "s:a", cells: ["3,3"], signature: roomA.cell_signature! });
    const link = makeLink({ cellKey: "3,3", spaceKey: "s:a", metadata: { note_id: "note-1" } });
    const plan = planPublish(
      makeInput({ derived: makeDerived({ spaces: [spaceA], links: [link] }), regions: [roomA] }),
    );
    expect(plan.placements).toEqual([
      { kind: "note", link, spaceRef: { kind: "existing", spaceId: "room-A" } },
    ]);
  });

  it("orders placement changes by cell key", () => {
    const p5 = makePlacement({ trap_id: "t5", location_id: "room-A", source_cell_key: "5,5" });
    const p1 = makePlacement({ trap_id: "t1", location_id: "room-A", source_cell_key: "1,1" });
    const p3 = makePlacement({ trap_id: "t3", location_id: "room-A", source_cell_key: "3,3" });
    const plan = planPublish(makeInput({ placements: [p5, p1, p3] }));
    // None of these cells belong to any derived space, so all are lost-room —
    // the point here is purely the ordering, not the individual kind.
    expect(plan.placements.map((c) => (c as { placement: LocationPlacement }).placement.source_cell_key)).toEqual([
      "1,1",
      "3,3",
      "5,5",
    ]);
  });
});

// ── planPublish: zones ───────────────────────────────────────────────────

describe("planPublish — zones", () => {
  it("skips a zone matched by identical signature", () => {
    const cells: CellKey[] = ["2,2", "2,3"];
    const zone = makeZone({ cells });
    const region = makeRegion({
      cells,
      cell_signature: cellSignature(cells),
      region_role: "zone",
      zone_kind: "hazard",
      space_location_id: null,
      label: "Ash cloud",
    });
    const plan = planPublish(makeInput({ derived: makeDerived({ zones: [zone] }), regions: [region] }));
    expect(plan.zones).toEqual([{ kind: "skip", zone, region }]);
  });

  it("updates a zone matched by label and kind when its cells moved", () => {
    const zone = makeZone({ cells: ["2,2", "2,3", "2,4"], kind: "hazard", label: "Ash cloud" });
    const region = makeRegion({
      cells: ["1,1", "1,2"],
      cell_signature: "stale",
      region_role: "zone",
      zone_kind: "hazard",
      space_location_id: null,
      label: "Ash cloud",
    });
    const plan = planPublish(makeInput({ derived: makeDerived({ zones: [zone] }), regions: [region] }));
    expect(plan.zones).toEqual([{ kind: "update", zone, region }]);
  });

  it("creates a zone with no matching region", () => {
    const zone = makeZone({ cells: ["2,2"], kind: "trigger", label: "Pressure plate" });
    const plan = planPublish(makeInput({ derived: makeDerived({ zones: [zone] }) }));
    expect(plan.zones).toEqual([{ kind: "create", zone }]);
  });

  it("matches two unlabeled same-kind zones to their own shifted originals, not each other", () => {
    // Both zones are unlabeled hazards, and both shifted by exactly one cell —
    // the case a bare kind+label equality check would cross-match in whatever
    // order `input.regions` happens to hold them (#868 bug B).
    const zoneA = makeZone({ cells: ["1,1", "1,2", "1,3", "1,4"], kind: "hazard", label: null });
    const zoneB = makeZone({ cells: ["8,6", "8,7", "8,8", "8,9"], kind: "hazard", label: null });
    const regionA = makeRegion({
      cells: ["1,0", "1,1", "1,2", "1,3"], // shifted up by one -> jaccard 3/5 = 0.6
      cell_signature: "stale-a",
      region_role: "zone",
      zone_kind: "hazard",
      label: null,
      zone_payload: { trap_id: "trap-a" },
    });
    const regionB = makeRegion({
      cells: ["8,5", "8,6", "8,7", "8,8"], // shifted up by one -> jaccard 3/5 = 0.6
      cell_signature: "stale-b",
      region_role: "zone",
      zone_kind: "hazard",
      label: null,
      zone_payload: { trap_id: "trap-b" },
    });
    // Regions passed in the opposite order from the zones, so an
    // order-dependent match would pair zoneA with regionB.
    const plan = planPublish(
      makeInput({ derived: makeDerived({ zones: [zoneA, zoneB] }), regions: [regionB, regionA] }),
    );
    expect(plan.zones).toEqual([
      { kind: "update", zone: zoneA, region: regionA },
      { kind: "update", zone: zoneB, region: regionB },
    ]);
  });

  it("creates rather than updates when an unlabeled zone has no overlap with any candidate", () => {
    const zone = makeZone({ cells: ["9,9"], kind: "hazard", label: null });
    const unrelated = makeRegion({
      cells: ["0,0"],
      cell_signature: "unrelated",
      region_role: "zone",
      zone_kind: "hazard",
      label: null,
    });
    const plan = planPublish(makeInput({ derived: makeDerived({ zones: [zone] }), regions: [unrelated] }));
    expect(plan.zones).toEqual([{ kind: "create", zone }]);
  });
});

// ── planPublish: summary ─────────────────────────────────────────────────

describe("planPublish — summary", () => {
  it("derives every count from the underlying arrays", () => {
    const createSpace = makeSpace({ key: "s:new", cells: ["0,0"] });
    const updateRegion = makeRegion({ cells: ["4,4", "4,5"], derived_from: "floodfill" });
    const updateSpace = makeSpace({ key: "s:upd", cells: ["4,4", "4,5", "4,6"] });
    const heldRegion = makeRegion({ cells: ["6,6", "6,7"], derived_from: "dm" });
    const heldSpace = makeSpace({ key: "s:held", cells: ["6,6", "6,7", "6,8"] });
    const orphanRegion = makeRegion({ cells: ["8,8"], label: "Gone" });

    const newDoorWay = makeWay({ edgeKey: "0,1:N", fromKey: "s:new", toKey: "s:upd" });
    const heldDoor = makeDoor({ source_edge_key: "2,3:W", starts_locked: true });
    const heldWay = makeWay({ edgeKey: "2,3:W", fromKey: "s:upd", toKey: "s:held" });

    const roomA = makeRegion({ cells: ["3,3"], space_location_id: "room-A" });
    const roomB = makeRegion({ cells: ["9,9"], space_location_id: "room-B" });
    const spaceA = makeSpace({ key: "s:a", cells: ["3,3"], signature: roomA.cell_signature! });
    const spaceB = makeSpace({ key: "s:b", cells: ["9,9"], signature: roomB.cell_signature! });
    const movedPlacement = makePlacement({ trap_id: "trap-1", location_id: "room-A", source_cell_key: "9,9" });

    const plan = planPublish(
      makeInput({
        derived: makeDerived({
          spaces: [createSpace, updateSpace, heldSpace, spaceA, spaceB],
          ways: [newDoorWay, heldWay],
        }),
        regions: [updateRegion, heldRegion, orphanRegion, roomA, roomB],
        doors: [heldDoor],
        placements: [movedPlacement],
      }),
    );

    expect(plan.summary).toEqual({
      newRooms: 1,
      regionUpdates: 1,
      newDoors: 1,
      doorUpdates: 0,
      heldSpaces: 1,
      heldWays: 1,
      orphans: 1,
      reanchored: 1,
    });
  });

  it("counts an un-authored door_kind mismatch as a door update, not a held way", () => {
    const door = makeDoor({ source_edge_key: "0,1:N", door_kind: "stair" });
    const way = makeWay({ edgeKey: "0,1:N", kind: "door" });
    const plan = planPublish(makeInput({ derived: makeDerived({ ways: [way] }), doors: [door] }));
    expect(plan.summary.doorUpdates).toBe(1);
    expect(plan.summary.heldWays).toBe(0);
  });
});
