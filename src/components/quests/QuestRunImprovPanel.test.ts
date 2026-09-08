import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunImprovPanel from "./QuestRunImprovPanel.vue";

const click = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.findAll("button").find((button) => button.text() === label)!.trigger("click");

describe("QuestRunImprovPanel", () => {
  it("cancel creates no submit intent", async () => {
    const wrapper = mount(QuestRunImprovPanel);
    await click(wrapper, "Close");
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  // The point of #824: one field, filled at the table, and nothing else
  // demanded. A second required field is what stops a DM capturing a detour at
  // all — so this is the behaviour to protect, not an incidental detail.
  it("captures a detour from the title alone", async () => {
    const wrapper = mount(QuestRunImprovPanel);
    await wrapper.findAll("input")[0].setValue("They sacrificed a goat to Ravishin");
    await click(wrapper, "Capture & run");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      title: "They sacrificed a goat to Ravishin",
      kind: "neutral",
      reason: "",
    });
  });

  it("refuses an empty title, which is the one thing it does need", async () => {
    const wrapper = mount(QuestRunImprovPanel);
    await wrapper.findAll("input")[0].setValue("   ");
    await click(wrapper, "Capture & run");
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("keeps the details collapsed until asked for", async () => {
    const wrapper = mount(QuestRunImprovPanel);
    const details = wrapper.find("select").element.closest("div");
    expect(details?.style.display).toBe("none");
    await click(wrapper, "Add details");
    expect(details?.style.display).not.toBe("none");
  });

  it("still records everything when the DM does open them", async () => {
    const wrapper = mount(QuestRunImprovPanel);
    await click(wrapper, "Add details");
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("Falling chandelier");
    await wrapper.find("select").setValue("explore");
    await inputs[1].setValue("A player cut the rope");
    await inputs[2].setValue("Keep the crowd moving");
    await inputs[3].setValue("The hall erupts in chaos");
    await inputs[5].setValue(true);
    await click(wrapper, "Capture & run");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      title: "Falling chandelier",
      kind: "explore",
      reason: "A player cut the rope",
      pushReturn: true,
      keepEdge: true,
      dmLead: "Keep the crowd moving",
      revealText: "The hall erupts in chaos",
    });
  });
});
