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
    // One type per rung, chained through all six: cosmic < land < settlement
    // < district < site < interior.
    expect(tierIndex("world")).toBeLessThan(tierIndex("continent"));
    expect(tierIndex("continent")).toBeLessThan(tierIndex("city"));
    expect(tierIndex("city")).toBeLessThan(tierIndex("district"));
    expect(tierIndex("district")).toBeLessThan(tierIndex("building"));
    expect(tierIndex("building")).toBeLessThan(tierIndex("room"));
  });

  it("sorts the unscaled type last", () => {
    expect(tierIndex("other")).toBe(LOCATION_TIERS.length);
    expect(tierOf("other")).toBeNull();
  });

  it("shares a tier between dungeon and building, but not wilderness", () => {
    // A dungeon and a building both have a floor plan, so they get the same
    // kind of map — the same *tier* now means that, not "the same size".
    // A wilderness has no floor plan at all: it moved to `land`, alongside
    // continent/region/country, where "pins all the way down" belongs.
    expect(tierOf("dungeon")).toBe("site");
    expect(tierOf("building")).toBe("site");
    expect(tierOf("wilderness")).toBe("land");
  });
});

describe("isSiteType", () => {
  it("agrees with the tier map for every location type", () => {
    for (const type of Object.keys(LOCATION_TYPE_TIER) as LocationType[]) {
      expect(isSiteType(type)).toBe(LOCATION_TYPE_TIER[type] === "site");
    }
  });

  it("covers exactly building, dungeon, store, tavern and inn — the five types with a floor plan", () => {
    expect(isSiteType("building")).toBe(true);
    expect(isSiteType("dungeon")).toBe(true);
    expect(isSiteType("store")).toBe(true);
    expect(isSiteType("tavern")).toBe(true);
    expect(isSiteType("inn")).toBe(true);
  });

  it("excludes district, wilderness, interior and every other tier", () => {
    // district and wilderness are the two types that moved off `site`: a
    // district's children are buildings on a geography map, and a wilderness
    // has no floor plan at all.
    expect(isSiteType("district")).toBe(false);
    expect(isSiteType("wilderness")).toBe(false);
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

  /** Hue angle in degrees (0–360), for comparing colours within one family. */
  function hueAngle(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) return 0;
    let h: number;
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  it("keeps every tier in one hue family", () => {
    // Iterates every rung rather than naming two, so the next rung added to
    // the ladder — or a colour reshuffled off its family — can't slip past
    // this test unnoticed the way the old venue/site pairing did.
    for (const tier of LOCATION_TIERS) {
      const types = (Object.keys(LOCATION_TYPE_TIER) as LocationType[]).filter(
        (t) => LOCATION_TYPE_TIER[t] === tier,
      );
      const hues = types.map((t) => hueAngle(LOCATION_TYPE_COLORS[t]));
      const spread = Math.max(...hues) - Math.min(...hues);
      expect(spread).toBeLessThan(25);
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
    expect(groups.map((g) => g.tier)).toEqual(["land", "settlement", "site"]);
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
    expect([...present].sort()).toEqual(["land", "settlement"]);
  });

  it("never counts the unscaled type as occupying a rung", () => {
    expect(occupiedTiers([loc("???", "other")]).size).toBe(0);
  });
});
