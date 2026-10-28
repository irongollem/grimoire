import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { GateConditionDraft } from "@/lib/quests/gates";
import QuestRoutePanel from "./QuestRoutePanel.vue";

const objectiveOptions = [{ id: "o1", name: "Keep Char's trust" }, { id: "o2", name: "Find the ledger" }];

function mountPanel(conditions: GateConditionDraft[], gateMode: "all" | "any" = "all", canBeParallel = true) {
  return mount(QuestRoutePanel, {
    props: {
      sourceTitle: "A", targetTitle: "B", objectiveOptions, effects: [], editTo: "/x", canBeParallel,
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

  const cond = (key: string, objectiveId: string, statuses: GateConditionDraft["statuses"] = ["pending"]): GateConditionDraft =>
    ({ key, gateId: null, objectiveId, statuses });
  const combos = () => wrapper.findAllComponents({ name: "EntityCombobox" });
  const conditionsOf = () => wrapper.props("conditions") as GateConditionDraft[];
  const addCondition = () => wrapper.findAll("button").find((button) => button.text() === "Add condition")!;

  it("a new condition opens on 'Completed', the usual reason to gate a route", async () => {
    wrapper = mountPanel([]);
    await addCondition().trigger("click");
    expect(conditionsOf()[0]!.statuses).toEqual(["complete"]);
    const checked = wrapper.findAll("input[type=checkbox]").map((box) => (box.element as HTMLInputElement).checked);
    expect(checked).toEqual([false, false, true, false]);
  });

  it("Remove drops the condition it sits on, not the first", async () => {
    wrapper = mountPanel([cond("a", "o1"), cond("b", "o2")]);
    await wrapper.findAll("button").filter((button) => button.text() === "Remove")[1]!.trigger("click");
    expect(conditionsOf().map((c) => c.key)).toEqual(["a"]);
  });

  it("picking an objective changes that condition only", async () => {
    wrapper = mountPanel([cond("a", "o1"), cond("b", "")]);
    combos()[1]!.vm.$emit("update:modelValue", "o2");
    await wrapper.vm.$nextTick();
    expect(conditionsOf().map((c) => c.objectiveId)).toEqual(["o1", "o2"]);
  });

  it("ticking a status changes that condition only", async () => {
    wrapper = mountPanel([cond("a", "o1", ["pending"]), cond("b", "o2", ["pending"])]);
    await wrapper.findAll("input[type=checkbox]")[4 + 2]!.setValue(true);
    expect(conditionsOf().map((c) => c.statuses)).toEqual([["pending"], ["pending", "complete"]]);
  });

  it("a condition cannot pick an objective another condition already gates on, but keeps its own", () => {
    wrapper = mountPanel([cond("a", "o1"), cond("b", "o2")]);
    expect(combos()[0]!.props("options").map((o: { id: string }) => o.id)).toEqual(["o1"]);
    expect(combos()[1]!.props("options").map((o: { id: string }) => o.id)).toEqual(["o2"]);
  });

  it("stops offering Add condition once every objective is gated on", () => {
    wrapper = mountPanel([cond("a", "o1")]);
    expect(addCondition().attributes("disabled")).toBeUndefined();
    wrapper = mountPanel([cond("a", "o1"), cond("b", "o2")]);
    expect(addCondition().attributes("disabled")).toBeDefined();
  });

  it("two conditions added in a row stay two separate conditions", async () => {
    wrapper = mountPanel([]);
    await addCondition().trigger("click");
    await addCondition().trigger("click");
    const keys = conditionsOf().map((c) => c.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("Parallel is not selectable until the beat has another choice route", () => {
    wrapper = mountPanel([], "all", false);
    const parallel = wrapper.findAll("button").find((button) => button.text() === "Parallel")!;
    expect(parallel.attributes("disabled")).toBeDefined();
    wrapper = mountPanel([], "all", true);
    expect(wrapper.findAll("button").find((button) => button.text() === "Parallel")!.attributes("disabled")).toBeUndefined();
  });
});
