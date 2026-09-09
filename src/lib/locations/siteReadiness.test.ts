import { describe, it, expect } from "vitest";
import { siteReadiness, structureFromSite, publishStaleness } from "./siteReadiness";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { DungeonMap } from "@/types/dungeonMap.types";
import { emptyLayers } from "@/types/dungeonMap.types";

function region(over: Partial<LocationMapRegion> = {}): LocationMapRegion {
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

describe("siteReadiness", () => {
  it("is fully unready for a bare site", () => {
    const result = siteReadiness({
      location: { map_url: null, grid_calibration: null },
      spaces: [],
      regions: [],
      doors: [],
    });
    expect(result).toMatchObject({
      mapped: false,
      calibrated: false,
      traced: false,
      bound: true, // vacuously — nothing to bind
      waysOut: false,
      unboundSpaces: 0,
      untracedSpaces: 0,
      caption: null,
    });
  });

  it("is fully ready when every check passes", () => {
    const result = siteReadiness({
      location: { map_url: "/map.webp", grid_calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 } },
      spaces: [{ id: "room-1" }],
      regions: [region({ id: "reg-1", cells: ["0,0"], space_location_id: "room-1" })],
      doors: [{ from_location_id: "room-1" }],
    });
    expect(result.mapped).toBe(true);
    expect(result.calibrated).toBe(true);
    expect(result.traced).toBe(true);
    expect(result.bound).toBe(true);
    expect(result.waysOut).toBe(true);
    expect(result.caption).toBeNull();
  });

  it("reports an unbound traced region", () => {
    const result = siteReadiness({
      location: { map_url: "/map.webp", grid_calibration: null },
      spaces: [{ id: "room-1" }],
      regions: [region({ id: "reg-1", cells: ["0,0"], space_location_id: null })],
      doors: [],
    });
    expect(result.unboundSpaces).toBe(1);
    // The room also has no BOUND region, so it counts as untraced too — the
    // caption leads with the cheaper fix (bind it) rather than the costlier one.
    expect(result.untracedSpaces).toBe(1);
    expect(result.bound).toBe(false);
    expect(result.caption).toBe("1 space unbound");
  });

  it("reports an untraced room when every region is already bound", () => {
    const result = siteReadiness({
      location: { map_url: "/map.webp", grid_calibration: null },
      spaces: [{ id: "room-1" }, { id: "room-2" }],
      regions: [region({ id: "reg-1", cells: ["0,0"], space_location_id: "room-1" })],
      doors: [],
    });
    expect(result.unboundSpaces).toBe(0);
    expect(result.untracedSpaces).toBe(1);
    expect(result.bound).toBe(false);
    expect(result.caption).toBe("1 room untraced");
  });

  it("ignores zone-role regions and untraced (empty-cell) regions", () => {
    const result = siteReadiness({
      location: { map_url: "/map.webp", grid_calibration: null },
      spaces: [{ id: "room-1" }],
      regions: [
        region({ id: "z1", region_role: "zone", zone_kind: "hazard", cells: ["1,1"] }),
        region({ id: "r-empty", cells: [] }),
      ],
      doors: [],
    });
    expect(result.traced).toBe(false);
    expect(result.untracedSpaces).toBe(1);
  });
});

describe("structureFromSite", () => {
  it("builds one derived space per traced space-role region", () => {
    const structure = structureFromSite(
      [
        region({ id: "reg-1", cells: ["0,0", "1,0"], cell_signature: "sig-1" }),
        region({ id: "z1", region_role: "zone", zone_kind: "hazard", cells: ["2,2"] }),
        region({ id: "empty", cells: [] }),
      ],
      [],
    );
    expect(structure.spaces).toHaveLength(1);
    expect(structure.spaces[0].signature).toBe("sig-1");
    expect(structure.spaces[0].cells).toEqual(["0,0", "1,0"]);
  });

  it("derives a signature when the region never had a publish-written one", () => {
    const structure = structureFromSite(
      [region({ id: "reg-1", cells: ["0,0"], cell_signature: null })],
      [],
    );
    expect(structure.spaces[0].signature).toMatch(/^1:/);
  });

  it("keeps only doors with a source edge key", () => {
    const structure = structureFromSite(
      [],
      [{ source_edge_key: "0,0:N" }, { source_edge_key: null }],
    );
    expect(structure.ways).toHaveLength(1);
    expect(structure.ways[0].edgeKey).toBe("0,0:N");
  });
});

describe("publishStaleness", () => {
  const before = { spaces: [], ways: [], stairs: [], zones: [], links: [] };

  function map(over: Partial<DungeonMap> = {}): DungeonMap {
    return {
      id: "m1",
      user_id: "u",
      name: "map",
      description: null,
      layers: emptyLayers(),
      metadata: {},
      default_pack_id: null,
      tags: [],
      notes: null,
      campaign_id: null,
      rev: 1,
      created_at: "",
      updated_at: "",
      ...over,
    };
  }

  it("is null with no source map", () => {
    expect(publishStaleness({ map_published_rev: 3 }, null, before)).toBeNull();
  });

  it("is null when the last publish already carries the map's rev", () => {
    expect(publishStaleness({ map_published_rev: 5 }, map({ rev: 5 }), before)).toBeNull();
  });

  it("reports how many revs behind when the drawing moved on", () => {
    const result = publishStaleness({ map_published_rev: 12 }, map({ rev: 14 }), before);
    expect(result?.behind).toBe(2);
    expect(result?.delta).toBeDefined();
  });
});
