import { describe, it, expect } from "vitest";
import {
  LOCATION_TIERS,
  LOCATION_TYPE_TIER,
  bindableSpaces,
  groupByTier,
  isInteriorType,
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

  it("puts `wilds` at `site` and `grounds` at `interior`, not `wilderness`'s land tier (#886)", () => {
    // `wilderness` is untouched by #886 — it stays a `land`-tier pin map
    // (#810), and can describe the same forest a `wilds` site zooms into for
    // the stretch the party actually walks. `wilds` is the new site-tier
    // natural place that carries its own floor plan; `grounds` moved the
    // other way, off `site` and onto `interior` beside `room`, because it is
    // an outdoor area *inside* a site's floor plan rather than a floor plan
    // of its own.
    expect(tierOf("wilds")).toBe("site");
    expect(tierOf("grounds")).toBe("interior");
    expect(tierOf("wilderness")).toBe("land");
  });
});

describe("isSiteType", () => {
  it("agrees with the tier map for every location type", () => {
    for (const type of Object.keys(LOCATION_TYPE_TIER) as LocationType[]) {
      expect(isSiteType(type)).toBe(LOCATION_TYPE_TIER[type] === "site");
    }
  });

  // Deliberately a *closed* set rather than a list of things that are true.
  // The previous version named five types and asserted each was a site, which
  // says nothing about a sixth — and a sixth duly arrived (`grounds`, #817)
  // without failing anything. An equality check is what makes this test notice
  // the next one, and it is also the mirror of
  // `private.location_can_hold_rooms`, which must hold the same set.
  //
  // #886 swapped the sixth member: `grounds` moved down to `interior` and
  // `wilds` — a site-tier natural place that carries its own floor plan —
  // took its place, so the set is still six wide.
  it("is exactly the types with a floor plan", () => {
    const sites = (Object.keys(LOCATION_TYPE_TIER) as LocationType[]).filter(isSiteType);
    expect(new Set(sites)).toEqual(
      new Set<LocationType>(["building", "dungeon", "store", "tavern", "inn", "wilds"]),
    );
  });

  it("excludes geography and interiors", () => {
    // district and wilderness are the two types that moved off `site` in #810:
    // a district's children are buildings on a geography map, and a wilderness
    // has no floor plan at all. `grounds` moved off `site` too in #886 — it is
    // now the counter-case the *other* way: unroofed, but bound to another
    // site's floor plan rather than carrying one of its own, so it joined
    // `room` at `interior` instead.
    expect(isSiteType("district")).toBe(false);
    expect(isSiteType("wilderness")).toBe(false);
    expect(isSiteType("room")).toBe(false);
    expect(isSiteType("grounds")).toBe(false);
    expect(isSiteType("city")).toBe(false);
    expect(isSiteType("other")).toBe(false);
  });
});

describe("isInteriorType", () => {
  it("agrees with the tier map for every location type", () => {
    for (const type of Object.keys(LOCATION_TYPE_TIER) as LocationType[]) {
      expect(isInteriorType(type)).toBe(LOCATION_TYPE_TIER[type] === "interior");
    }
  });

  // Deliberately closed, for the same reason `isSiteType`'s is: a list of
  // things that are true says nothing about a third arrival.
  it("is exactly `room` and `grounds`", () => {
    const interiors = (Object.keys(LOCATION_TYPE_TIER) as LocationType[]).filter(isInteriorType);
    expect(new Set(interiors)).toEqual(new Set<LocationType>(["room", "grounds"]));
  });

  it("excludes `wilds` — a site's own floor plan, not a space inside one", () => {
    // `wilds` and `grounds` are both open air and easy to conflate: the test
    // is which floor plan a place's footprint belongs to. `wilds` carries its
    // own (site tier); `grounds` sits inside another place's (interior tier).
    expect(isInteriorType("wilds")).toBe(false);
    expect(isSiteType("wilds")).toBe(true);
    expect(isInteriorType("grounds")).toBe(true);
    expect(isSiteType("grounds")).toBe(false);
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

describe("bindableSpaces", () => {
  it("keeps interior spaces and nested sites, in input order", () => {
    // #886: the predicate used to special-case the literal "room"; it now
    // routes through `isInteriorType`, so `grounds` (moved to `interior`)
    // is included the same way `room` is, without a second branch.
    const children = [
      loc("Great Hall", "room"),
      loc("Herb Garden", "grounds"),
      loc("Ossuary", "dungeon"),
      loc("Overlook", "wilds"),
      loc("Guest List", "other"),
    ];
    expect(bindableSpaces(children).map((c) => c.name)).toEqual([
      "Great Hall",
      "Herb Garden",
      "Ossuary",
      "Overlook",
    ]);
  });

  it("excludes non-mappable geography, even a pin-tier `wilderness`", () => {
    // `wilderness` (land tier) has no floor plan to bind a region to — unlike
    // `wilds` (site tier), which does. Conflating the two here would be
    // exactly the #886 regression this predicate exists to prevent.
    expect(bindableSpaces([loc("Icewind Dale", "wilderness")])).toEqual([]);
  });
});
