import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import PublishPlanPreview from "./PublishPlanPreview.vue";
import type { PublishPlan } from "@/lib/locations/publish";
import type { DerivedWay } from "@/cartographer/structure.types";

function planWith(ways: PublishPlan["ways"]): PublishPlan {
  return {
    spaces: [],
    ways,
    placements: [],
    summary: {
      newRooms: 0, boundRooms: 0, regionUpdates: 0, newDoors: 0, doorUpdates: 0,
      heldSpaces: 0, heldWays: 0, noRoomWays: 0, orphans: 0, reanchored: 0,
    },
  };
}

describe("PublishPlanPreview door bars", () => {
  it("draws an angled door at its real end points, inset 0.15 from each", () => {
    // [0,0] -> [3,4] is 5 long with unit direction (0.6, 0.8); an inset of 0.15 moves each end 0.09 in x and 0.12 in y.
    const way: DerivedWay = { edgeKey: "wall-uuid", segment: [[0, 0], [3, 4]], kind: "door", fromKey: null, toKey: null };
    const wrapper = mount(PublishPlanPreview, { props: { plan: planWith([{ kind: "create", way, fromSpaceId: "a", toSpaceId: null }]) } });
    const line = wrapper.find("line");
    expect(line.exists()).toBe(true);
    expect(Number(line.attributes("x1"))).toBeCloseTo(0.09);
    expect(Number(line.attributes("y1"))).toBeCloseTo(0.12);
    expect(Number(line.attributes("x2"))).toBeCloseTo(2.91);
    expect(Number(line.attributes("y2"))).toBeCloseTo(3.88);
  });

  it("draws no bar for a way with no room beside it, as nothing is written", () => {
    const way: DerivedWay = { edgeKey: "wall-uuid", segment: [[0, 0], [3, 4]], kind: "door", fromKey: null, toKey: null };
    const wrapper = mount(PublishPlanPreview, { props: { plan: planWith([{ kind: "no-room", way }]) } });
    expect(wrapper.find("line").exists()).toBe(false);
  });
});
