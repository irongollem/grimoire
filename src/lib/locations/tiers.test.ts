import { describe, it, expect } from "vitest";
import {
  LOCATION_TIERS,
  LOCATION_TYPE_TIER,
  groupByTier,
  isSiteType,
  occupiedTiers,
  tierIndex,
  tierOf,
} from "./tiers";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

function loc(name: string, location_type: LocationType): Location {
  return {
    id: name,
    user_id: "u",
    campaign_id: null,
    parent_id: null,
    name,
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
  };
}

describe("tier assignment", () => {
  it("assigns every location type exactly once", () => {
    for (const type of Object.keys(LOCATION_TYPE_LABELS) as LocationType[]) {
      expect(LOCATION_TYPE_TIER).toHaveProperty(type);
    }
  });

  it("leaves only `other` unplaced — it is the escape hatch, not a scale", () => {
    const unplaced = (Object.keys(LOCATION_TYPE_TIER) as LocationType[]).filter(
      (t) => LOCATION_TYPE_TIER[t] === null,
    );
    expect(unplaced).toEqual(["other"]);
  });

  it("orders the ladder from cosmic down to interior", () => {
    expect(tierIndex("world")).toBeLessThan(tierIndex("continent"));
    expect(tierIndex("continent")).toBeLessThan(tierIndex("city"));
    expect(tierIndex("city")).toBeLessThan(tierIndex("building"));
    expect(tierIndex("building")).toBeLessThan(tierIndex("tavern"));
    expect(tierIndex("tavern")).toBeLessThan(tierIndex("room"));
  });

  it("sorts the unscaled type last", () => {
    expect(tierIndex("other")).toBe(LOCATION_TIERS.length);
    expect(tierOf("other")).toBeNull();
  });

  it("puts a dungeon and a wilderness at the same scale as a building", () => {
    // They read as opposites but are the same *size* of place, which is the
    // only thing this axis encodes. See the colour ramp comment.
    expect(tierOf("dungeon")).toBe("site");
    expect(tierOf("wilderness")).toBe("site");
    expect(tierOf("building")).toBe("site");
  });
});

describe("isSiteType", () => {
  it("agrees with the tier map for every location type", () => {
    for (const type of Object.keys(LOCATION_TYPE_TIER) as LocationType[]) {
      expect(isSiteType(type)).toBe(LOCATION_TYPE_TIER[type] === "site");
    }
  });

  it("covers exactly district, building, dungeon and wilderness", () => {
    expect(isSiteType("district")).toBe(true);
    expect(isSiteType("building")).toBe(true);
    expect(isSiteType("dungeon")).toBe(true);
    expect(isSiteType("wilderness")).toBe(true);
  });

  it("excludes venue, interior and every other tier", () => {
    expect(isSiteType("store")).toBe(false);
    expect(isSiteType("tavern")).toBe(false);
    expect(isSiteType("inn")).toBe(false);
    expect(isSiteType("room")).toBe(false);
    expect(isSiteType("city")).toBe(false);
    expect(isSiteType("other")).toBe(false);
  });
});

describe("colour ramp", () => {
  it("gives every type a 6-digit hex, so alpha suffixes stay valid", () => {
    // Call sites derive tints with `LOCATION_TYPE_COLORS[t] + "22"`; an
    // already-8-digit value would silently produce a 10-char string.
    for (const type of Object.keys(LOCATION_TYPE_LABELS) as LocationType[]) {
      expect(LOCATION_TYPE_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps each tier in one hue family", () => {
    // Same tier → same dominant channel relationship. A rainbow-by-kind
    // palette breaks this, which is the regression this guards.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return { r, g, b };
    };
    const settlement = ["city", "town", "village"] as const;
    for (const type of settlement) {
      const { r, g, b } = hue(LOCATION_TYPE_COLORS[type]);
      expect(g).toBeGreaterThan(r); // teal family: green-dominant over red
      expect(b).toBeGreaterThan(r);
    }
    const venue = ["store", "tavern", "inn"] as const;
    for (const type of venue) {
      const { r, g, b } = hue(LOCATION_TYPE_COLORS[type]);
      expect(r).toBeGreaterThan(b); // amber family: warm
      expect(g).toBeGreaterThan(b);
    }
  });
});

describe("groupByTier", () => {
  it("returns groups in ladder order, skipping empty tiers", () => {
    const groups = groupByTier([
      loc("The Yawning Portal", "tavern"),
      loc("Waterdeep", "city"),
      loc("Faerûn", "continent"),
    ]);
    expect(groups.map((g) => g.tier)).toEqual(["continental", "settlement", "venue"]);
  });

  it("puts unplaced last, however the input was ordered", () => {
    const groups = groupByTier([loc("???", "other"), loc("Neverwinter", "city")]);
    expect(groups.map((g) => g.label)).toEqual(["Settlements", "Unplaced"]);
  });

  it("keeps every location — nothing is dropped on the way into a bucket", () => {
    const input = [
      loc("a", "city"),
      loc("b", "city"),
      loc("c", "room"),
      loc("d", "other"),
    ];
    const total = groupByTier(input).flatMap((g) => g.locations);
    expect(total).toHaveLength(input.length);
  });

  it("returns nothing for a childless place", () => {
    expect(groupByTier([])).toEqual([]);
  });
});

describe("occupiedTiers", () => {
  it("reports only tiers that are actually authored", () => {
    const present = occupiedTiers([loc("Waterdeep", "city"), loc("Faerûn", "continent")]);
    expect([...present].sort()).toEqual(["continental", "settlement"]);
  });

  it("never counts the unscaled type as occupying a rung", () => {
    expect(occupiedTiers([loc("???", "other")]).size).toBe(0);
  });
});
