import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import PublishPlanRows from "./PublishPlanRows.vue";
import type { PublishPlan } from "@/lib/locations/publish";
import type { DerivedWay } from "@/cartographer/structure.types";

const UUID = "5b0e2f0e-8f7d-4d57-9a53-1d6f3a8f2c11";

function mountRows(ways: PublishPlan["ways"]) {
  const plan: PublishPlan = {
    spaces: [],
    ways,
    placements: [],
    summary: {
      newRooms: 0, boundRooms: 0, regionUpdates: 0, newDoors: 0, doorUpdates: 0,
      heldSpaces: 0, heldWays: 0, noRoomWays: 0, orphans: 0, reanchored: 0,
    },
  };
  return mount(PublishPlanRows, {
    props: { plan, spaceNameById: new Map([["room-a", "Hall"]]), stairTargetOptions: [], stairTargets: {} },
    global: { stubs: { EntityCombobox: true } },
  });
}

const angled = (): DerivedWay => ({ edgeKey: UUID, segment: [[0, 0], [1, 1]], kind: "door", fromKey: null, toKey: null });

describe("PublishPlanRows ways", () => {
  it("never prints a wall id: an angled door is named as one", () => {
    const wrapper = mountRows([
      { kind: "create", way: angled(), fromSpaceId: "room-a", toSpaceId: null },
      { kind: "no-room", way: angled() },
    ]);
    expect(wrapper.text()).not.toContain(UUID);
    expect(wrapper.text()).toContain("angled door");
  });

  it("explains a way with no room beside it and counts it in the summary only when there is one", () => {
    const withNone = mountRows([{ kind: "no-room", way: angled() }]);
    expect(withNone.text()).toContain("No room beside this door yet. Assign the rooms it joins, bind them to places, then publish again.");
    expect(withNone.text()).toContain("0 new · 0 held · 1 without a room");
    const without = mountRows([{ kind: "create", way: angled(), fromSpaceId: "room-a", toSpaceId: null }]);
    expect(without.text()).toContain("1 new · 0 held");
    expect(without.text()).not.toContain("without a room");
  });
});
