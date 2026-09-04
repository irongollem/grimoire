import { describe, it, expect } from "vitest";
import {
  ancestorIds,
  ancestorPath,
  buildAtlasIndex,
  childrenOf,
  compareSiblings,
  descendantsOf,
  visibleRows,
} from "./tree";
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
    underlay_url: null,
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
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

const WORLD = [
  loc("faerun", "continent"),
  loc("sword-coast", "region", "faerun"),
  loc("waterdeep", "city", "sword-coast"),
  loc("portal", "tavern", "waterdeep"),
  loc("neverwinter", "city", "sword-coast"),
];

describe("buildAtlasIndex", () => {
  it("roots the top level and nests the rest", () => {
    const index = buildAtlasIndex(WORLD);
    expect(index.rootIds).toEqual(["faerun"]);
    expect(index.childIds.get("sword-coast")).toEqual(["neverwinter", "waterdeep"]);
  });

  it("sorts siblings by scale before name", () => {
    const index = buildAtlasIndex([
      loc("keep", "building", "r"),
      loc("r", "region"),
      loc("aaa-tavern", "tavern", "r"),
      loc("zzz-city", "city", "r"),
    ]);
    // The city outranks the alphabetically-earlier tavern.
    expect(index.childIds.get("r")).toEqual(["zzz-city", "keep", "aaa-tavern"]);
  });

  it("uses sort_order over name when siblings share a tier", () => {
    // Named to contradict alphabetical order: if this passed by name alone,
    // "aaa-second" would come first — proving sort_order is what decided it.
    const index = buildAtlasIndex([
      loc("zzz-first", "city", "r", { sort_order: 0 }),
      loc("aaa-second", "city", "r", { sort_order: 1 }),
      loc("r", "region"),
    ]);
    expect(index.childIds.get("r")).toEqual(["zzz-first", "aaa-second"]);
  });

  it("promotes an orphan to a root rather than dropping it", () => {
    // Campaign scoping and player sharing both hide parents; a location that
    // vanished entirely would be worse than one shown at top level.
    const index = buildAtlasIndex([loc("orphan", "city", "missing-parent")]);
    expect(index.rootIds).toEqual(["orphan"]);
  });

  it("treats a self-parented row as a root instead of looping", () => {
    const index = buildAtlasIndex([loc("self", "city", "self")]);
    expect(index.rootIds).toEqual(["self"]);
  });

  it("counts descendants at every depth", () => {
    const index = buildAtlasIndex(WORLD);
    expect(index.descendantCount.get("faerun")).toBe(4);
    expect(index.descendantCount.get("sword-coast")).toBe(3);
    expect(index.descendantCount.get("waterdeep")).toBe(1);
    expect(index.descendantCount.get("portal")).toBe(0);
  });

  it("survives a parent cycle without hanging", () => {
    const index = buildAtlasIndex([
      loc("a", "city", "b"),
      loc("b", "city", "a"),
      loc("real-root", "region"),
    ]);
    expect(index.rootIds).toEqual(["real-root"]);
  });

  it("handles an empty world", () => {
    const index = buildAtlasIndex([]);
    expect(index.rootIds).toEqual([]);
    expect(index.byId.size).toBe(0);
  });
});

describe("visibleRows", () => {
  it("shows only roots when nothing is expanded", () => {
    const rows = visibleRows(buildAtlasIndex(WORLD), new Set());
    expect(rows.map((r) => r.loc.id)).toEqual(["faerun"]);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[0].descendantCount).toBe(4);
  });

  it("reveals one level per expanded ancestor", () => {
    const index = buildAtlasIndex(WORLD);
    const rows = visibleRows(index, new Set(["faerun", "sword-coast"]));
    expect(rows.map((r) => r.loc.id)).toEqual([
      "faerun",
      "sword-coast",
      "neverwinter",
      "waterdeep",
    ]);
  });

  it("does not reveal a node whose ancestor is collapsed", () => {
    // 'waterdeep' is expanded but 'sword-coast' is not, so the tavern stays hidden.
    const rows = visibleRows(buildAtlasIndex(WORLD), new Set(["faerun", "waterdeep"]));
    expect(rows.map((r) => r.loc.id)).not.toContain("portal");
  });

  it("annotates depth for indentation", () => {
    const index = buildAtlasIndex(WORLD);
    const rows = visibleRows(index, new Set(["faerun", "sword-coast", "waterdeep"]));
    expect(rows.find((r) => r.loc.id === "portal")?.depth).toBe(3);
  });
});

describe("childrenOf / descendantsOf", () => {
  it("returns direct children in scale order", () => {
    const index = buildAtlasIndex(WORLD);
    expect(childrenOf(index, "sword-coast").map((l) => l.id)).toEqual([
      "neverwinter",
      "waterdeep",
    ]);
  });

  it("collects the whole subtree, not just the next level", () => {
    const index = buildAtlasIndex(WORLD);
    expect(descendantsOf(index, "faerun").map((l) => l.id).sort()).toEqual([
      "neverwinter",
      "portal",
      "sword-coast",
      "waterdeep",
    ]);
  });

  it("returns nothing for a leaf", () => {
    expect(descendantsOf(buildAtlasIndex(WORLD), "portal")).toEqual([]);
  });

  it("terminates on a cycle rather than queueing forever", () => {
    const index = buildAtlasIndex([
      loc("root", "region"),
      loc("a", "city", "root"),
      loc("b", "city", "a"),
    ]);
    // Force a cycle the builder would normally have rejected.
    index.childIds.set("b", ["a"]);
    expect(descendantsOf(index, "root").map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("ancestorPath", () => {
  it("returns the chain from root to node, inclusive", () => {
    const index = buildAtlasIndex(WORLD);
    expect(ancestorPath(index, "portal").map((l) => l.id)).toEqual([
      "faerun",
      "sword-coast",
      "waterdeep",
      "portal",
    ]);
  });

  it("excludes the node itself from the ids needing expansion", () => {
    const index = buildAtlasIndex(WORLD);
    expect(ancestorIds(index, "portal")).toEqual(["faerun", "sword-coast", "waterdeep"]);
  });

  it("returns nothing for an unknown id", () => {
    expect(ancestorPath(buildAtlasIndex(WORLD), "nope")).toEqual([]);
  });

  it("terminates on a cycle", () => {
    const index = buildAtlasIndex([loc("a", "city", "b"), loc("b", "city", "a")]);
    expect(ancestorPath(index, "a").length).toBeLessThanOrEqual(2);
  });
});

describe("compareSiblings", () => {
  it("orders by tier before anything else, regardless of sort_order or name", () => {
    const room = loc("aaa-room", "room", null, { sort_order: 0 });
    const region = loc("zzz-region", "region", null, { sort_order: 99 });
    expect(compareSiblings(region, room)).toBeLessThan(0);
    expect(compareSiblings(room, region)).toBeGreaterThan(0);
  });

  it("orders ascending by sort_order within a tier", () => {
    const first = loc("b", "city", null, { sort_order: 0 });
    const second = loc("a", "city", null, { sort_order: 1 });
    expect(compareSiblings(first, second)).toBeLessThan(0);
    expect(compareSiblings(second, first)).toBeGreaterThan(0);
  });

  it("sorts a null sort_order after any numbered sibling", () => {
    const numbered = loc("numbered", "city", null, { sort_order: 0 });
    const unordered = loc("unordered", "city", null, { sort_order: null });
    expect(compareSiblings(numbered, unordered)).toBeLessThan(0);
    expect(compareSiblings(unordered, numbered)).toBeGreaterThan(0);
  });

  it("falls back to name when sort_order ties, including two unordered siblings", () => {
    const alpha = loc("Alpha", "city");
    const beta = loc("Beta", "city");
    expect(compareSiblings(alpha, beta)).toBeLessThan(0);
    expect(compareSiblings(beta, alpha)).toBeGreaterThan(0);
  });
});
