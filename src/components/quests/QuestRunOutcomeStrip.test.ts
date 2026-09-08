import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunOutcomeStrip from "./QuestRunOutcomeStrip.vue";

const closedGate = { objective_id: "o1", objective: "Clear the checkpoint", required_status: "complete", current_status: "pending", is_open: false } as const;

const outgoing = [
  {
    edge_id: "e1", quest_id: "q1", beat_id: "b2", gate: null, effects: [], beat_title: "Bridge", beat_kind: "explore",
    route_kind: "choice" as const, thread_label: null, converge_mode: "any" as const, site: null, payoff: [], loot: [],
    visibility: "hidden" as const, presentationHint: "Chase", prepGapCount: 1, isVisited: true,
  },
  {
    edge_id: "e2", quest_id: "q1", beat_id: "b3", gate: null, effects: [], beat_title: "Tunnel", beat_kind: "explore",
    route_kind: "choice" as const, thread_label: null, converge_mode: "any" as const, site: null, payoff: [], loot: [],
    visibility: "revealed" as const, presentationHint: null, prepGapCount: 0, isVisited: false,
  },
];

describe("QuestRunOutcomeStrip", () => {
  it("emits an intent to open the Advance dialog on the chosen route, rather than transitioning itself", async () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing } });
    const branch = wrapper.findAll("article").find((card) => card.text().includes("Bridge"));
    await branch!.findAll("button").find((button) => button.text() === "Choose")!.trigger("click");
    expect(wrapper.emitted("choose")).toEqual([["e1"]]);
  });

  it("keeps reveal separate from choosing a hidden destination", async () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: outgoing.slice(0, 1) } });
    const reveal = wrapper.findAll("button").find((button) => button.text() === "Reveal");
    await reveal!.trigger("click");
    expect(wrapper.emitted("reveal")).toEqual([["b2"]]);
    expect(wrapper.emitted("choose")).toBeUndefined();
    expect(wrapper.text()).toContain("Visited");
    expect(wrapper.text()).toContain("1 gap");
    expect(wrapper.text()).toContain("choice");
  });

  it("renders a parallel route as an opens-alongside card with no choose action", () => {
    const parallel = { ...outgoing[0]!, route_kind: "parallel" as const, thread_label: "The sealed crypt" };
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [parallel] } });
    expect(wrapper.text()).toContain("opens alongside");
    expect(wrapper.text()).toContain("Ticked by default — advancing also spawns Thread The sealed crypt.");
    expect(wrapper.findAll("button").some((button) => button.text() === "Choose")).toBe(false);
  });

  it("offers the improvise card even at an authored dead end", () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [] } });
    expect(wrapper.text()).toContain("Something else…");
  });

  // The Advance dialog (story G) owns improvising now — including its own
  // form — so this strip only has to announce the intent and let the disabled
  // state track the same "running" gate every other action here uses.
  it("emits an intent to open the Advance dialog's improvise option, disabled while paused", async () => {
    const running = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing } });
    await running.findAll("button").find((button) => button.text() === "Something else…")!.trigger("click");
    expect(running.emitted("something-else")).toHaveLength(1);

    const paused = mount(QuestRunOutcomeStrip, { props: { status: "paused", outgoing } });
    const pausedButton = paused.findAll("button").find((button) => button.text() === "Something else…");
    expect(pausedButton?.attributes("disabled")).toBeDefined();
  });

  it("disables Choose on a closed route and shows what it still needs", async () => {
    const gated = [{ ...outgoing[0]!, gate: closedGate }];
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: gated } });
    const card = wrapper.find("article");
    expect(card.text()).toContain("needs “Clear the checkpoint” completed");
    const chooseButton = card.findAll("button").find((button) => button.text() === "Choose");
    expect(chooseButton?.attributes("disabled")).toBeDefined();
    await chooseButton!.trigger("click");
    expect(wrapper.emitted("choose")).toBeUndefined();
  });

  it("shows an open gate as ready and leaves Choose enabled", () => {
    const openGate = { ...closedGate, current_status: "complete" as const, is_open: true };
    const gated = [{ ...outgoing[0]!, gate: openGate }];
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: gated } });
    expect(wrapper.text()).toContain("ready — “Clear the checkpoint” is completed");
    const chooseButton = wrapper.findAll("button").find((button) => button.text() === "Choose");
    expect(chooseButton?.attributes("disabled")).toBeUndefined();
  });

  it("prefers a route's own payoff over its gate condition when both exist", () => {
    const payoffChoice = {
      ...outgoing[0]!,
      gate: { ...closedGate, is_open: true },
      payoff: [{ consequence_id: "c1", action: "reveal" as const, target_objective_id: "o1", target_objective: "Testify before the Guild", target_npc_id: null, target_npc: null, target_quest_id: null, target_quest: null, action_payload: {}, after_days: 0, on_edge: true }],
    };
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [payoffChoice] } });
    expect(wrapper.text()).toContain("reveal · Testify before the Guild");
  });
});
