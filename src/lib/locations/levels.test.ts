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

  it("gives every level the same ordinal from every page — S is 1, A is 2, B is 3", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    for (const startId of ["s", "a", "b"]) {
      const info = levelsOf(index, index.byId.get(startId)!)!;
      expect(levelOrdinal(info.levels, "s")).toBe(1);
      expect(levelOrdinal(info.levels, "a")).toBe(2);
      expect(levelOrdinal(info.levels, "b")).toBe(3);
    }
  });

  it("a site with no levels of its own and no site-typed parent returns null", () => {
    const index = buildAtlasIndex([loc("solo", "building")]);
    expect(levelsOf(index, index.byId.get("solo")!)).toBeNull();
  });

  it("a room (not site-tier) is never a level, even filed under a site with levels", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    expect(levelsOf(index, index.byId.get("r")!)).toBeNull();
  });
});

describe("levelOrdinal", () => {
  it("returns null for an id absent from the list", () => {
    const index = buildAtlasIndex(SITE_WITH_LEVELS);
    const info = levelsOf(index, index.byId.get("s")!)!;
    expect(levelOrdinal(info.levels, "nowhere")).toBeNull();
  });
});
