import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunImprovPanel from "./QuestRunImprovPanel.vue";

describe("QuestRunImprovPanel", () => {
  it("cancel creates no submit intent", async () => {
    const wrapper = mount(QuestRunImprovPanel);
    await wrapper.findAll("button").find((button) => button.text() === "Close")!.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("captures kind, return, kept-edge, notes, and reveal copy in a short flow", async () => {
    const wrapper = mount(QuestRunImprovPanel);
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("Falling chandelier");
    await wrapper.find("select").setValue("explore");
    await inputs[1].setValue("A player cut the rope");
    await inputs[2].setValue("Keep the crowd moving");
    await inputs[3].setValue("The hall erupts in chaos");
    await inputs[5].setValue(true);
    await wrapper.findAll("button").find((button) => button.text() === "Create & run")!.trigger("click");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      title: "Falling chandelier", kind: "explore", pushReturn: true, keepEdge: true,
      dmLead: "Keep the crowd moving", revealText: "The hall erupts in chaos",
    });
  });
});
