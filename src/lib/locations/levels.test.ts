import { describe, it, expect } from "vitest";
import { buildAtlasIndex } from "./tree";
import { levelOrdinal, levelsOf } from "./levels";
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
    is_level: false,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

// S (a dungeon) with two assigned levels, A and B, plus a room directly under
// S and an unassigned nested site C — the shape the bug report used, now with
// the DM's own assignment rather than a guess (migration `20260928195128`).
const SITE_WITH_LEVELS = [
  loc("s", "dungeon"),
  loc("a", "building", "s", { is_level: true }),
  loc("b", "building", "s", { is_level: true }),
  loc("r", "room", "s"),
];

describe("levelsOf", () => {
  it("viewed from the parent: container is the site itself, prepended to its is_level children", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    const info = levelsOf(index, index.byId.get("s")!);
    expect(info?.container.id).toBe("s");
    expect(info?.levels.map((l) => l.id)).toEqual(["s", "a", "b"]);
  });

  it("viewed from a leaf child: resolves the same container and the same list as from the parent", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    const info = levelsOf(index, index.byId.get("a")!);
    expect(info?.container.id).toBe("s");
    expect(info?.levels.map((l) => l.id)).toEqual(["s", "a", "b"]);
  });

  it("a flagged child with a flagged child still uses its parent's level list", () => {
    const index = buildAtlasIndex([
      ...SITE_WITH_LEVELS,
      loc("nested", "dungeon", "a", { is_level: true }),
    ]);

    const info = levelsOf(index, index.byId.get("a")!);
    expect(info?.container.id).toBe("s");
    expect(info?.levels.map((l) => l.id)).toEqual(["s", "a", "b"]);
    expect(levelsOf(index, index.byId.get("nested")!)?.levels.map((l) => l.id)).toEqual(["a", "nested"]);
  });

  it("gives every level the same ordinal from every page — S is 1, A is 2, B is 3", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    for (const startId of ["s", "a", "b"]) {
      const info = levelsOf(index, index.byId.get(startId)!)!;
      expect(levelOrdinal(info.levels, "s")).toBe(1);
      expect(levelOrdinal(info.levels, "a")).toBe(2);
      expect(levelOrdinal(info.levels, "b")).toBe(3);
    }
  });

  it("a site with no is_level children of its own and not itself flagged returns null", () => {
    const index = buildAtlasIndex([loc("solo", "building")]);
    expect(levelsOf(index, index.byId.get("solo")!)).toBeNull();
  });

  it("a room (not site-tier) is never a level, even filed under a site with levels", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    expect(levelsOf(index, index.byId.get("r")!)).toBeNull();
  });

  // The rule this migration replaces: neither the type of a site (a store,
  // tavern or inn) nor whether the parent's own plan draws it decides
  // anything any more — only `is_level` does. A store IS a level once the DM
  // says so, and a plain nested site is NOT one until they do.
  it("a store the DM has assigned as a level IS a level — type no longer excludes it", () => {
    const index = buildAtlasIndex([
      loc("well", "dungeon"),
      loc("shop", "store", "well", { is_level: true }),
    ]);
    expect(levelsOf(index, index.byId.get("well")!)?.levels.map((l) => l.id)).toEqual(["well", "shop"]);
    expect(levelsOf(index, index.byId.get("shop")!)?.container.id).toBe("well");
  });

  it("a nested site the DM has not flagged is NOT a level, however it was drawn", () => {
    const index = buildAtlasIndex([
      loc("well", "dungeon"),
      loc("crypt", "dungeon", "well"),
    ]);
    expect(levelsOf(index, index.byId.get("well")!)).toBeNull();
    expect(levelsOf(index, index.byId.get("crypt")!)).toBeNull();
  });

  it("gives the same container and list from the container and from a level", () => {
    const index = buildAtlasIndex([
      loc("well", "dungeon"),
      loc("crook", "room", "well"),
      loc("shop", "store", "well"),
      loc("middle", "dungeon", "well", { is_level: true, sort_order: 1 }),
      loc("deep", "dungeon", "well", { is_level: true, sort_order: 2 }),
    ]);
    expect(levelsOf(index, index.byId.get("well")!)?.levels.map((l) => l.id)).toEqual(["well", "middle", "deep"]);
    expect(levelsOf(index, index.byId.get("middle")!)?.levels.map((l) => l.id)).toEqual(["well", "middle", "deep"]);
    expect(levelsOf(index, index.byId.get("deep")!)?.levels.map((l) => l.id)).toEqual(["well", "middle", "deep"]);
  });

  it("lets a venue hold levels of its own, like a tavern's cellar", () => {
    const index = buildAtlasIndex([loc("tavern", "tavern"), loc("cellar", "dungeon", "tavern", { is_level: true })]);
    expect(levelsOf(index, index.byId.get("cellar")!)?.levels.map((l) => l.id)).toEqual(["tavern", "cellar"]);
  });
});

describe("levelOrdinal", () => {
  it("returns null for an id absent from the list", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    const info = levelsOf(index, index.byId.get("s")!)!;
    expect(levelOrdinal(info.levels, "nowhere")).toBeNull();
  });
});
