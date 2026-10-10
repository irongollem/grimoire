import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { GateConditionDraft } from "@/lib/quests/gates";
import QuestRoutePanel from "./QuestRoutePanel.vue";

const objectiveOptions = [{ id: "o1", name: "Keep Char's trust" }, { id: "o2", name: "Find the ledger" }];

function mountPanel(conditions: GateConditionDraft[], gateMode: "all" | "any" = "all") {
  return mount(QuestRoutePanel, {
    props: {
      sourceTitle: "A", targetTitle: "B", objectiveOptions, effects: [], editTo: "/x", canBeParallel: true,
      routeKind: "choice" as const, threadLabel: "", gateMode, conditions,
      "onUpdate:conditions": (value: GateConditionDraft[]) => wrapper.setProps({ conditions: value }),
    },
  });
}
let wrapper: ReturnType<typeof mountPanel>;

describe("QuestRoutePanel gate editor", () => {
  it("says an ungated route is always open and offers Add condition", async () => {
    wrapper = mountPanel([]);
    expect(wrapper.text()).toContain("always open");
    expect(wrapper.text()).not.toContain("All of these");
    await wrapper.findAll("button").find((button) => button.text() === "Add condition")!.trigger("click");
    expect(wrapper.findAll("input[type=checkbox]")).toHaveLength(4);
  });

  it("shows the all/any switch only with two or more conditions", () => {
    const one: GateConditionDraft = { key: "a", gateId: "g1", objectiveId: "o1", statuses: ["pending"] };
    const two: GateConditionDraft = { key: "b", gateId: "g2", objectiveId: "o2", statuses: ["complete"] };
    expect(mountPanel([one]).text()).not.toContain("All of these");
    const several = mountPanel([one, two], "any");
    expect(several.text()).toContain("All of these");
    expect(several.text()).toContain("Any of these");
  });

  it("stops a condition at three of the four statuses", () => {
    const wrapperThree = mountPanel([{ key: "a", gateId: null, objectiveId: "o1", statuses: ["dormant", "pending", "complete"] }]);
    const boxes = wrapperThree.findAll("input[type=checkbox]");
    expect(boxes.map((box) => box.attributes("disabled") !== undefined)).toEqual([false, false, false, true]);
  });

  it("removes a condition", async () => {
    wrapper = mountPanel([{ key: "a", gateId: "g1", objectiveId: "o1", statuses: ["pending"] }]);
    await wrapper.findAll("button").find((button) => button.text() === "Remove")!.trigger("click");
    expect(wrapper.text()).toContain("always open");
  });
});
