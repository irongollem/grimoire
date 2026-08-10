import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestFlowNode from "./QuestFlowNode.vue";

describe("QuestFlowNode", () => {
  it("exposes selected/current state and keyboard domain actions", async () => {
    const wrapper = mount(QuestFlowNode, {
      props: { title: "The hidden door", kind: "discovery", visibility: "rumored", selected: true, current: true },
      global: { stubs: { Handle: true } },
    });
    const card = wrapper.get("article");
    const node = card.get("button.quest-flow-node__main");
    expect(card.attributes("role")).toBeUndefined();
    expect(node.attributes("aria-label")).toContain("current beat");
    expect(card.classes()).toContain("is-current");
    await node.trigger("keydown", { key: "Enter" });
    await node.trigger("keydown", { key: "Delete" });
    expect(wrapper.emitted("open")).toHaveLength(1);
    expect(wrapper.emitted("delete")).toHaveLength(1);
  });

  it("announces readiness, history, visibility, handouts, loot and disconnected staging", () => {
    const wrapper = mount(QuestFlowNode, {
      props: {
        title: "A quiet bargain",
        kind: "social",
        visibility: "revealed",
        presentation: {
          prepGapCount: 2,
          handoutCount: 1,
          loot: { total: 3, undispatched: 2, unclaimed: 1 },
          isReady: false,
          isCurrent: false,
          isVisited: true,
          isDisconnected: true,
        },
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.get("button.quest-flow-node__main").attributes("aria-label")).toContain("revealed");
    expect(wrapper.get("button.quest-flow-node__main").attributes("aria-label")).toContain("disconnected staging beat");
    expect(wrapper.text()).toContain("2 prep gaps");
    expect(wrapper.text()).toContain("1 handout");
    expect(wrapper.text()).toContain("2 loot held");
    expect(wrapper.text()).toContain("Visited");
  });

  it("offers an atomic add-next action from the card", async () => {
    const wrapper = mount(QuestFlowNode, { props: { title: "Start", kind: "neutral", visibility: "hidden", editable: true }, global: { stubs: { Handle: true } } });
    const card = wrapper.get("article");
    expect(card.findAll("button")).toHaveLength(2);
    expect(card.find("[role='button'] button").exists()).toBe(false);
    await wrapper.findAll("button").find((button) => button.text() === "Add next")!.trigger("click");
    expect(wrapper.emitted("create-next")).toHaveLength(1);
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.emitted("open")).toBeUndefined();
  });
});
