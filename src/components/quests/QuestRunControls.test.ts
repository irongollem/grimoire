import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunControls from "./QuestRunControls.vue";

const outgoing = [
  { edge_id: "e1", quest_id: "q1", beat_id: "b2", label: "Take the bridge", beat_title: "Bridge", beat_kind: "explore" },
  { edge_id: "e2", quest_id: "q1", beat_id: "b3", label: "Use the tunnel", beat_title: "Tunnel", beat_kind: "explore" },
];

describe("QuestRunControls", () => {
  it("emits the selected authored branch instead of guessing a next beat", async () => {
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: true, outgoing } });
    const branch = wrapper.findAll("button").find((button) => button.text().includes("Take the bridge"));
    await branch!.trigger("click");
    expect(wrapper.emitted("advance")).toEqual([["e1"]]);
  });

  it("keeps resume and end available while paused but disables story movement", () => {
    const wrapper = mount(QuestRunControls, { props: { status: "paused", hasPrevious: true, outgoing: outgoing.slice(0, 1) } });
    const buttons = new Map(wrapper.findAll("button").map((button) => [button.text(), button]));
    expect(buttons.get("Previous")?.attributes("disabled")).toBeDefined();
    expect(buttons.get("Jump…")?.attributes("disabled")).toBeDefined();
    expect(buttons.get("Resume")?.attributes("disabled")).toBeUndefined();
    expect(buttons.get("End")?.attributes("disabled")).toBeUndefined();
  });
});
