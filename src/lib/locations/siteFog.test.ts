import { describe, it, expect } from "vitest";
import { buildDmFogPlan } from "./siteFog";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

function region(over: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "region-1",
    user_id: "u1",
    site_location_id: "site-1",
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

describe("buildDmFogPlan", () => {
  it("puts an explored room into spaces, with its facts", () => {
    const plan = buildDmFogPlan(
      [region({ space_location_id: "room-1", cells: ["0,0", "0,1"], label: null, sort_order: 2 })],
      [{ id: "room-1", name: "Nave of Ash" }],
      () => true,
      (id) => id === "room-1",
      () => false,
    );
    expect(plan.spaces).toEqual([
      { space_location_id: "room-1", name: "Nave of Ash", cells: ["0,0", "0,1"], label: null, sort_order: 2, is_cleared: true, is_looted: false },
    ]);
    expect(plan.glimpsed).toEqual([]);
  });

  it("puts an unexplored room into glimpsed as a bare footprint — a hint, never a blank void", () => {
    const plan = buildDmFogPlan(
      [region({ space_location_id: "room-2", cells: ["3,3"] })],
      [{ id: "room-2", name: "The Drowned Cell" }],
      () => false,
      () => false,
      () => false,
    );
    expect(plan.spaces).toEqual([]);
    expect(plan.glimpsed).toEqual([{ cells: ["3,3"] }]);
  });

  it("ignores zone regions and regions with no matching room", () => {
    const plan = buildDmFogPlan(
      [
        region({ region_role: "zone", space_location_id: null, cells: ["1,1"] }),
        region({ space_location_id: "ghost-room", cells: ["2,2"] }),
      ],
      [{ id: "room-1", name: "Nave of Ash" }],
      () => true,
      () => false,
      () => false,
    );
    expect(plan.spaces).toEqual([]);
    expect(plan.glimpsed).toEqual([]);
  });

  it("never populates ways or zones — the real map beside it already draws them", () => {
    const plan = buildDmFogPlan(
      [region({ space_location_id: "room-1", cells: ["0,0"] })],
      [{ id: "room-1", name: "Nave of Ash" }],
      () => true,
      () => false,
      () => false,
    );
    expect(plan.ways).toEqual([]);
    expect(plan.zones).toEqual([]);
  });

  it("folds multiple traced shapes for the same room into separate spaces entries, same as the player RPC", () => {
    const plan = buildDmFogPlan(
      [
        region({ id: "r1", space_location_id: "room-1", cells: ["0,0"] }),
        region({ id: "r2", space_location_id: "room-1", cells: ["0,1"] }),
      ],
      [{ id: "room-1", name: "Nave of Ash" }],
      () => true,
      () => false,
      () => false,
    );
    expect(plan.spaces).toHaveLength(2);
    expect(plan.spaces.every((s) => s.space_location_id === "room-1")).toBe(true);
  });
});
