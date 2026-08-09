import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestFlowNode from "./QuestFlowNode.vue";

describe("QuestFlowNode", () => {
  it("exposes selected/current state and keyboard domain actions", async () => {
    const wrapper = mount(QuestFlowNode, {
      props: { title: "The hidden door", kind: "discovery", visibility: "rumored", selected: true, current: true },
      global: { stubs: { Handle: true } },
    });
    const node = wrapper.get("article");
    expect(node.attributes("aria-label")).toContain("current beat");
    expect(node.classes()).toContain("is-current");
    await node.trigger("keydown", { key: "Enter" });
    await node.trigger("keydown", { key: "Delete" });
    expect(wrapper.emitted("open")).toHaveLength(1);
    expect(wrapper.emitted("delete")).toHaveLength(1);
  });
});
