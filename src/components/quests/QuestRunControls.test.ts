import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunControls from "./QuestRunControls.vue";

const closedGate = { objective_id: "o1", objective: "Clear the checkpoint", required_status: "complete", current_status: "pending", is_open: false } as const;

const outgoing = [
  { edge_id: "e1", quest_id: "q1", beat_id: "b2", gate: null, effects: [], beat_title: "Bridge", beat_kind: "explore", visibility: "hidden" as const, presentationHint: "Chase", prepGapCount: 1, isVisited: true },
  { edge_id: "e2", quest_id: "q1", beat_id: "b3", gate: null, effects: [], beat_title: "Tunnel", beat_kind: "explore", visibility: "revealed" as const, presentationHint: null, prepGapCount: 0, isVisited: false },
];

describe("QuestRunControls", () => {
  it("emits the selected authored branch instead of guessing a next beat", async () => {
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: true, outgoing } });
    const branch = wrapper.findAll("article").find((card) => card.text().includes("Bridge"));
    await branch!.findAll("button").find((button) => button.text() === "Choose")!.trigger("click");
    expect(wrapper.emitted("advance")).toEqual([["e1"]]);
  });

  it("keeps resume and end available while paused but disables story movement", () => {
    const wrapper = mount(QuestRunControls, { props: { status: "paused", hasPrevious: true, outgoing: outgoing.slice(0, 1) } });
    const buttons = new Map(wrapper.findAll("button").map((button) => [button.text(), button]));
    expect(buttons.get("Previous")?.attributes("disabled")).toBeDefined();
    expect(buttons.get("Jump…")?.attributes("disabled")).toBeDefined();
    expect(buttons.get("Something else…")?.attributes("disabled")).toBeDefined();
    expect(buttons.get("Resume")?.attributes("disabled")).toBeUndefined();
    expect(buttons.get("End")?.attributes("disabled")).toBeUndefined();
  });

  it("keeps reveal separate from choosing a hidden destination", async () => {
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: false, outgoing: outgoing.slice(0, 1) } });
    const reveal = wrapper.findAll("button").find((button) => button.text() === "Reveal to players");
    await reveal!.trigger("click");
    expect(wrapper.emitted("reveal")).toEqual([["b2"]]);
    expect(wrapper.emitted("advance")).toBeUndefined();
    expect(wrapper.text()).toContain("Visited");
    expect(wrapper.text()).toContain("1 gap");
  });

  it("offers jump, improvise, pause, and end at an authored dead end", () => {
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: false, outgoing: [] } });
    expect(wrapper.text()).toContain("Jump…");
    expect(wrapper.text()).toContain("Something else…");
    expect(wrapper.text()).toContain("Pause");
    expect(wrapper.text()).toContain("End");
  });

  it("keeps improvise available beside authored branch choices", async () => {
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: false, outgoing } });
    const improvise = wrapper.findAll("button").find((button) => button.text() === "Something else…");
    expect(improvise?.attributes("disabled")).toBeUndefined();
    await improvise!.trigger("click");
    expect(wrapper.emitted("improv")).toHaveLength(1);
  });

  it("disables Choose on a closed route and keeps the reason visible", async () => {
    const gated = [{ ...outgoing[0]!, gate: closedGate }];
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: false, outgoing: gated } });
    const card = wrapper.find("article");
    expect(card.text()).toContain("Closed — needs “Clear the checkpoint” to be completed, currently open");
    const chooseButton = card.findAll("button").find((button) => button.text() === "Choose");
    expect(chooseButton?.attributes("disabled")).toBeDefined();
    await chooseButton!.trigger("click");
    expect(wrapper.emitted("advance")).toBeUndefined();
  });

  it("shows an open gate's reason and leaves Choose enabled", () => {
    const openGate = { ...closedGate, current_status: "complete" as const, is_open: true };
    const gated = [{ ...outgoing[0]!, gate: openGate }];
    const wrapper = mount(QuestRunControls, { props: { status: "running", hasPrevious: false, outgoing: gated } });
    expect(wrapper.text()).toContain("Open — “Clear the checkpoint” is completed");
    const chooseButton = wrapper.findAll("button").find((button) => button.text() === "Choose");
    expect(chooseButton?.attributes("disabled")).toBeUndefined();
  });
});
