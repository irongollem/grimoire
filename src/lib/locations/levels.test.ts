import { describe, it, expect } from "vitest";
import { buildAtlasIndex } from "./tree";
import { drawnSpaceIds, levelOrdinal, levelsOf, NO_PLANS } from "./levels";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { Location, LocationType } from "@/types/location.types";

function loc(
  id: string,
  location_type: LocationType,
  parent_id: string | null = null,
  extra: Partial<Location> = {},
): Location {
  return {
    id,
    user_id: "u",
    campaign_id: null,
    parent_id,
    name: id,
    location_type,
    description: null,
    notes: null,
    tags: [],
    image_url: null,
    map_url: null,
    map_pins: [],
    is_map_shared: false,
    player_visible_to: [],
    player_summary: null,
    is_description_shared: false,
    is_npcs_shared: false,
    is_inventory_shared: false,
    npc_owner_id: null,
    related_location_ids: [],
    source_map_id: null,
    is_battle_map: false,
    grid_calibration: null,
    map_layer_url: null,
    map_layer_calibration: null,
    plan_size: null,
    era_start: null,
    era_end: null,
    audio_theme: null,
    sort_order: null,
    map_published_rev: null,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

// S (a dungeon) with two nested-site levels, A and B, plus a room directly
// under S — the shape the bug report itself uses (S is 1, A is 2, B is 3).
const SITE_WITH_LEVELS = [
  loc("s", "dungeon"),
  loc("a", "building", "s"),
  loc("b", "building", "s"),
  loc("r", "room", "s"),
];

describe("levelsOf", () => {
  it("viewed from the parent: container is the site itself, prepended to its own children", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    const info = levelsOf(index, index.byId.get("s")!, NO_PLANS);
    expect(info?.container.id).toBe("s");
    expect(info?.levels.map((l) => l.id)).toEqual(["s", "a", "b"]);
  });

  it("viewed from a leaf child: resolves the same container and the same list as from the parent", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    const info = levelsOf(index, index.byId.get("a")!, NO_PLANS);
    expect(info?.container.id).toBe("s");
    expect(info?.levels.map((l) => l.id)).toEqual(["s", "a", "b"]);
  });

  it("gives every level the same ordinal from every page — S is 1, A is 2, B is 3", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    for (const startId of ["s", "a", "b"]) {
      const info = levelsOf(index, index.byId.get(startId)!, NO_PLANS)!;
      expect(levelOrdinal(info.levels, "s")).toBe(1);
      expect(levelOrdinal(info.levels, "a")).toBe(2);
      expect(levelOrdinal(info.levels, "b")).toBe(3);
    }
  });

  it("a site with no levels of its own and no site-typed parent returns null", () => {
    const index = buildAtlasIndex([loc("solo", "building")]);
    expect(levelsOf(index, index.byId.get("solo")!, NO_PLANS)).toBeNull();
  });

  it("a room (not site-tier) is never a level, even filed under a site with levels", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    expect(levelsOf(index, index.byId.get("r")!, NO_PLANS)).toBeNull();
  });
});

describe("levelOrdinal", () => {
  it("returns null for an id absent from the list", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    const info = levelsOf(index, index.byId.get("s")!, NO_PLANS)!;
    expect(levelOrdinal(info.levels, "nowhere")).toBeNull();
  });
});

describe("levelsOf with a site's own plan", () => {
  // The Well: a store off the Crook and two real floors below.
  const WELL = [
    loc("well", "dungeon"),
    loc("crook", "room", "well"),
    loc("shop", "store", "well", { sort_order: 1 }),
    loc("middle", "dungeon", "well", { sort_order: 2 }),
    loc("deep", "dungeon", "well", { sort_order: 3 }),
  ];
  const region = (space: string, cells: string[]): LocationMapRegion => ({
    id: `r-${space}`, user_id: "u", site_location_id: "well", space_location_id: space, cells: cells as LocationMapRegion["cells"],
    label: null, sort_order: null, region_role: "space", zone_kind: null, zone_payload: {}, derived_from: "floodfill",
    cell_signature: null, vertices: null, created_at: "", updated_at: "",
  });
  const drawn = drawnSpaceIds([region("crook", ["0,0"]), region("shop", ["1,0"])]);
  const onWellPlan = (id: string) => (id === "well" ? drawn : NO_PLANS(id));

  it("leaves out a nested site the parent's map draws, so a shop is not a floor", () => {
    const index = buildAtlasIndex(WELL);
    expect(levelsOf(index, index.byId.get("well")!, onWellPlan)?.levels.map((l) => l.id)).toEqual(["well", "middle", "deep"]);
    expect(levelsOf(index, index.byId.get("middle")!, onWellPlan)?.levels.map((l) => l.id)).toEqual(["well", "middle", "deep"]);
  });

  it("gives the drawn shop no level of its own", () => {
    const index = buildAtlasIndex(WELL);
    expect(levelsOf(index, index.byId.get("shop")!, onWellPlan)).toBeNull();
  });

  it("still lists it before the plan draws it", () => {
    const index = buildAtlasIndex(WELL);
    expect(levelsOf(index, index.byId.get("well")!, NO_PLANS)?.levels.map((l) => l.id)).toEqual(["well", "shop", "middle", "deep"]);
  });

  it("counts only space regions with cells as drawn", () => {
    const emptied = { ...region("shop", []) };
    const zone = { ...region("deep", ["2,2"]), region_role: "zone" as const };
    expect([...drawnSpaceIds([emptied, zone])]).toEqual([]);
  });
});
