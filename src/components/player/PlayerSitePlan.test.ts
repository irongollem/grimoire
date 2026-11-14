import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PlayerSitePlan from "./PlayerSitePlan.vue";
import type { PlayerSitePlan as Plan } from "@/composables/locations/usePlayerVisibleSiteState";

const space = (over: Partial<Plan["spaces"][number]>): Plan["spaces"][number] => ({
  space_location_id: "a", name: "Chapel", cells: ["0,0", "1,0"], label: null, sort_order: null, is_cleared: false, is_looted: false, ...over,
});
const planOf = (spaces: Plan["spaces"], glimpsed: Plan["glimpsed"] = []): Plan => ({ spaces, glimpsed, ways: [], zones: [] });

describe("PlayerSitePlan floor", () => {
  it("draws a room with an outline along it and not as squares, so a curved chapel reads round to the players", () => {
    const w = mount(PlayerSitePlan, { props: { plan: planOf([space({ vertices: [[0, 0], [2, 0], [1, 2]] })]) } });
    const floor = w.findAll('path[fill="#3b332a"]');
    expect(floor.map((p) => p.attributes("d"))).toEqual(["M0 0 L2 0 L1 2 Z"]);
    expect(w.findAll('rect[fill="#3b332a"]')).toHaveLength(0);
  });

  it("draws a room with no outline as its squares", () => {
    const w = mount(PlayerSitePlan, { props: { plan: planOf([space({})]) } });
    expect(w.findAll('rect[fill="#3b332a"]')).toHaveLength(2);
    expect(w.findAll('path[fill="#3b332a"]')).toHaveLength(0);
  });

  it("shows an unexplored room with an outline as its footprint along that outline", () => {
    const w = mount(PlayerSitePlan, { props: { plan: planOf([], [{ cells: ["5,5"], vertices: [[5, 5], [7, 5], [6, 7]] }]) } });
    expect(w.findAll("path").some((p) => p.attributes("d") === "M5 5 L7 5 L6 7 Z")).toBe(true);
  });
});

describe("PlayerSitePlan ways", () => {
  const withWays = (ways: Plan["ways"]): Plan => ({ ...planOf([space({})]), ways });

  // Line (1,1)-(3,2) is not a grid edge, so only its stored segment can say where to draw it.
  it("draws a wall-uuid way from its segment", () => {
    const w = mount(PlayerSitePlan, {
      props: {
        plan: withWays([
          { from_space_id: "a", to_space_id: null, door_kind: "door", edge_key: "6f1c2d3e-0000-4000-8000-000000000001", segment: [[1, 1], [3, 2]] },
        ]),
      },
    });
    const line = w.findAll("line").filter((l) => l.attributes("stroke") === "#e7d9bd");
    expect(line).toHaveLength(1);
    expect(line[0]!.attributes()).toMatchObject({ x1: "1", y1: "1", x2: "3", y2: "2" });
  });

  it("draws no bar for a wall-uuid way that carries no segment", () => {
    const w = mount(PlayerSitePlan, {
      props: {
        plan: withWays([{ from_space_id: "a", to_space_id: null, door_kind: "door", edge_key: "6f1c2d3e-0000-4000-8000-000000000001", segment: null }]),
      },
    });
    expect(w.findAll("line").filter((l) => l.attributes("stroke") === "#e7d9bd")).toHaveLength(0);
  });
});
