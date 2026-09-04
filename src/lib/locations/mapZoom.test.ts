import { describe, it, expect } from "vitest";
import {
  ZOOM_CHILD_SCALE,
  ZOOM_PARENT_SCALE,
  ZOOM_CROSSFADE_AT,
  canZoomBetween,
  pinOrigin,
  planAscent,
  planDescent,
} from "./mapZoom";
import type { Location } from "@/types/location.types";

function place(over: Partial<Location> = {}): Location {
  return {
    id: "id",
    user_id: "u",
    campaign_id: null,
    parent_id: null,
    name: "place",
    location_type: "region",
    description: null,
    notes: null,
    tags: [],
    image_url: null,
    map_url: "/map.webp",
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
    ...over,
  };
}

describe("canZoomBetween", () => {
  it("allows a descent when both ends have a map", () => {
    expect(canZoomBetween(place(), place())).toBe(true);
  });

  it("refuses when either end has no map — there is nothing to zoom into", () => {
    expect(canZoomBetween(place({ map_url: null }), place())).toBe(false);
    expect(canZoomBetween(place(), place({ map_url: null }))).toBe(false);
  });

  it("refuses battle maps at either end", () => {
    // Tactical encounter art, not geography; the Atlas does not show them.
    expect(canZoomBetween(place({ is_battle_map: true }), place())).toBe(false);
    expect(canZoomBetween(place(), place({ is_battle_map: true }))).toBe(false);
  });

  it("refuses a missing location rather than throwing", () => {
    expect(canZoomBetween(null, place())).toBe(false);
    expect(canZoomBetween(place(), undefined)).toBe(false);
  });
});

describe("pinOrigin", () => {
  it("converts stored fractions to a transform-origin", () => {
    expect(pinOrigin({ x: 0.42, y: 0.68 })).toBe("42% 68%");
  });

  it("handles the corners", () => {
    expect(pinOrigin({ x: 0, y: 0 })).toBe("0% 0%");
    expect(pinOrigin({ x: 1, y: 1 })).toBe("100% 100%");
  });

  it("clamps a pin that was stored outside the image", () => {
    expect(pinOrigin({ x: -0.5, y: 2 })).toBe("0% 100%");
  });

  it("falls back to centre for a non-finite coordinate", () => {
    expect(pinOrigin({ x: Number.NaN, y: 0.5 })).toBe("50% 50%");
  });
});

describe("planDescent / planAscent", () => {
  const parent = place({
    id: "parent",
    map_url: "/parent.webp",
    map_pins: [
      {
        child_location_id: "child",
        child_name: "Child",
        child_type: "town",
        child_image_url: null,
        x: 0.25,
        y: 0.75,
        visible_to_players: true,
      },
    ],
  });
  const child = place({ id: "child", map_url: "/child.webp" });

  it("describes a descent anchored on the child's pin", () => {
    expect(planDescent(parent, child)).toEqual({
      direction: "in",
      fromUrl: "/parent.webp",
      toUrl: "/child.webp",
      origin: "25% 75%",
      targetId: "child",
    });
  });

  it("describes the ascent as the same anchor, reversed", () => {
    // Going back must retrace the way in — same origin, swapped endpoints —
    // or returning reads as a different mechanism from arriving.
    const down = planDescent(parent, child)!;
    const up = planAscent(child, parent)!;
    expect(up.origin).toBe(down.origin);
    expect(up.fromUrl).toBe(down.toUrl);
    expect(up.toUrl).toBe(down.fromUrl);
    expect(up.direction).toBe("out");
    expect(up.targetId).toBe("parent");
  });

  it("falls back to centre when the parent has no pin for the child", () => {
    const unpinned = place({ id: "parent", map_url: "/parent.webp", map_pins: [] });
    expect(planDescent(unpinned, child)?.origin).toBe("50% 50%");
    expect(planAscent(child, unpinned)?.origin).toBe("50% 50%");
  });

  it("returns null when either end cannot be animated", () => {
    expect(planDescent(parent, place({ map_url: null }))).toBeNull();
    expect(planAscent(child, place({ map_url: null }))).toBeNull();
    expect(planDescent(null, child)).toBeNull();
    expect(planAscent(child, null)).toBeNull();
  });
});

describe("timing constants", () => {
  it("overlaps the crossfade with the parent's motion", () => {
    // A crossfade at or after 1 would finish the zoom, pause, then swap — two
    // shots instead of one continuous move. This is the illusion's load-bearing
    // constant, so it is asserted rather than left to a code review.
    expect(ZOOM_CROSSFADE_AT).toBeGreaterThan(0);
    expect(ZOOM_CROSSFADE_AT).toBeLessThan(1);
  });

  it("derives the child's scale from the magnification, keeping the two locked", () => {
    // The child's map is the parent's pin region, so a parent at scale s shows
    // what the child shows at s/7. Hard-coding an overshoot instead (1.25 → 1)
    // looked fine descending — the parent's explosion masked it — but reversed
    // it made the departing map *grow*, so rising visibly began by zooming in.
    expect(ZOOM_CHILD_SCALE).toBe(1 / ZOOM_PARENT_SCALE);
    expect(ZOOM_CHILD_SCALE).toBeLessThan(1);
  });

  it("keeps the layers locked at every instant under a shared easing", () => {
    // With both layers on one curve e(t): parent = 1 + 6·e, child = (1+6·e)/7.
    // Asserted as arithmetic because the property is what matters, not the
    // particular curve — swapping the easing must not be able to break it.
    for (const e of [0, 0.25, 0.5, 0.75, 1]) {
      const parent = 1 + (ZOOM_PARENT_SCALE - 1) * e;
      const child = ZOOM_CHILD_SCALE + (1 - ZOOM_CHILD_SCALE) * e;
      expect(child).toBeCloseTo(parent * ZOOM_CHILD_SCALE, 10);
    }
  });
});
