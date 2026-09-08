import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunOutcomeStrip from "./QuestRunOutcomeStrip.vue";

const closedGate = { objective_id: "o1", objective: "Clear the checkpoint", required_status: "complete", current_status: "pending", is_open: false } as const;

const outgoing = [
  { edge_id: "e1", quest_id: "q1", beat_id: "b2", gate: null, effects: [], beat_title: "Bridge", beat_kind: "explore", visibility: "hidden" as const, presentationHint: "Chase", prepGapCount: 1, isVisited: true },
  { edge_id: "e2", quest_id: "q1", beat_id: "b3", gate: null, effects: [], beat_title: "Tunnel", beat_kind: "explore", visibility: "revealed" as const, presentationHint: null, prepGapCount: 0, isVisited: false },
];

describe("QuestRunOutcomeStrip", () => {
  it("emits the selected authored branch instead of guessing a next beat", async () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing, improviseOpen: false } });
    const branch = wrapper.findAll("article").find((card) => card.text().includes("Bridge"));
    await branch!.findAll("button").find((button) => button.text() === "Choose")!.trigger("click");
    expect(wrapper.emitted("advance")).toEqual([["e1"]]);
  });

  it("keeps reveal separate from choosing a hidden destination", async () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: outgoing.slice(0, 1), improviseOpen: false } });
    const reveal = wrapper.findAll("button").find((button) => button.text() === "Reveal to players");
    await reveal!.trigger("click");
    expect(wrapper.emitted("reveal")).toEqual([["b2"]]);
    expect(wrapper.emitted("advance")).toBeUndefined();
    expect(wrapper.text()).toContain("Visited");
    expect(wrapper.text()).toContain("1 gap");
  });

  it("offers the improvise card even at an authored dead end", () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [], improviseOpen: false } });
    expect(wrapper.text()).toContain("Something else…");
  });

  it("keeps improvise available beside authored branch choices, disabled while paused", () => {
    const running = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing, improviseOpen: false } });
    const runningButton = running.findAll("button").find((button) => button.text() === "Something else…");
    expect(runningButton?.attributes("disabled")).toBeUndefined();

    const paused = mount(QuestRunOutcomeStrip, { props: { status: "paused", outgoing, improviseOpen: false } });
    const pausedButton = paused.findAll("button").find((button) => button.text() === "Something else…");
    expect(pausedButton?.attributes("disabled")).toBeDefined();
  });

  it("opens the improvise form in this same column via the shared model, not a separate panel", async () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [], improviseOpen: false } });
    await wrapper.findAll("button").find((button) => button.text() === "Something else…")!.trigger("click");
    expect(wrapper.emitted("update:improviseOpen")).toEqual([[true]]);
  });

  it("forwards a submitted improvisation without deciding when the form closes", async () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [], improviseOpen: true } });
    // A title is all the improv panel asks for now (#824) — the reason field
    // moved behind "Add details" and the database falls back to the title.
    await wrapper.find("input").setValue("The bridge collapses");
    await wrapper.findAll("button").find((button) => button.text() === "Capture & run")!.trigger("click");
    expect(wrapper.emitted("improv")).toHaveLength(1);
    // Closing is the parent's call (a failed mutation must leave the form open).
    expect(wrapper.emitted("update:improviseOpen")).toBeUndefined();
  });

  it("disables Choose on a closed route and keeps the reason visible", async () => {
    const gated = [{ ...outgoing[0]!, gate: closedGate }];
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: gated, improviseOpen: false } });
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
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: gated, improviseOpen: false } });
    expect(wrapper.text()).toContain("Open — “Clear the checkpoint” is completed");
    const chooseButton = wrapper.findAll("button").find((button) => button.text() === "Choose");
    expect(chooseButton?.attributes("disabled")).toBeUndefined();
  });
});
