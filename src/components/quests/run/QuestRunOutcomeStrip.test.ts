import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { QuestRouteGate } from "@/types/quest.types";
import QuestRunOutcomeStrip from "./QuestRunOutcomeStrip.vue";

const closedGate: QuestRouteGate = {
  mode: "all", is_open: false,
  conditions: [{ objective_id: "o1", objective: "Clear the checkpoint", statuses: ["complete"], current_status: "pending", met: false }],
};
const openedGate: QuestRouteGate = {
  mode: "all", is_open: true,
  conditions: [{ objective_id: "o1", objective: "Clear the checkpoint", statuses: ["complete"], current_status: "complete", met: true }],
};

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
    expect(wrapper.text()).toContain("Ticked by default. Advancing also spawns Thread The sealed crypt.");
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
    expect(card.text()).toContain("needs “Clear the checkpoint” complete");
    const chooseButton = card.findAll("button").find((button) => button.text() === "Choose");
    expect(chooseButton?.attributes("disabled")).toBeDefined();
    await chooseButton!.trigger("click");
    expect(wrapper.emitted("choose")).toBeUndefined();
  });

  it("shows an open gate as ready and leaves Choose enabled", () => {
    const gated = [{ ...outgoing[0]!, gate: openedGate }];
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: gated } });
    expect(wrapper.text()).toContain("ready: “Clear the checkpoint” is complete");
    const chooseButton = wrapper.findAll("button").find((button) => button.text() === "Choose");
    expect(chooseButton?.attributes("disabled")).toBeUndefined();
  });

  // #872 review fix 3: `QuestRunNextSheet`'s own sheet title already says
  // "What happens next", so headless omits this strip's own duplicate <h3>
  // while keeping the section's accessible name.
  it("shows its own heading by default, and omits it when headless", () => {
    const shown = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing } });
    expect(shown.find("h3").exists()).toBe(true);
    expect(shown.get("section").attributes("aria-label")).toBe("What happens next");

    const headless = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing, headless: true } });
    expect(headless.find("h3").exists()).toBe(false);
    expect(headless.get("section").attributes("aria-label")).toBe("What happens next");
  });

  it("prefers a route's own payoff over its gate condition when both exist", () => {
    const payoffChoice = {
      ...outgoing[0]!,
      gate: openedGate,
      payoff: [{ consequence_id: "c1", action: "reveal" as const, target_objective_id: "o1", target_objective: "Testify before the Guild", target_npc_id: null, target_npc: null, target_quest_id: null, target_quest: null, target_document_id: null, target_document: null, target_clock_id: null, target_clock: null, target_location_id: null, target_location: null, target_faction_id: null, target_faction: null, action_payload: {}, after_days: 0, on_edge: true }],
    };
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [payoffChoice] } });
    expect(wrapper.text()).toContain("reveal · Testify before the Guild");
  });

  it("says why a closed route is closed even when it also carries a payoff", () => {
    const closedWithPayoff = {
      ...outgoing[0]!,
      gate: closedGate,
      payoff: [{ consequence_id: "c1", action: "reveal" as const, target_objective_id: "o1", target_objective: "Testify before the Guild", target_npc_id: null, target_npc: null, target_quest_id: null, target_quest: null, target_document_id: null, target_document: null, target_clock_id: null, target_clock: null, target_location_id: null, target_location: null, target_faction_id: null, target_faction: null, action_payload: {}, after_days: 0, on_edge: true }],
    };
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [closedWithPayoff] } });
    expect(wrapper.text()).toContain("needs “Clear the checkpoint” complete");
    expect(wrapper.text()).toContain("reveal · Testify before the Guild");
  });

  it("shows a closed parallel route as closed with its reason, and an open one as before", () => {
    const parallel = { ...outgoing[0]!, route_kind: "parallel" as const, thread_label: "The sealed crypt" };
    const shut = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [{ ...parallel, gate: closedGate }] } });
    const card = shut.find("article");
    expect(card.text()).toContain("needs “Clear the checkpoint” complete");
    expect(card.text()).not.toContain("Ticked by default");
    expect(card.attributes("aria-disabled")).toBe("true");
    const open = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [{ ...parallel, gate: openedGate }] } });
    expect(open.find("article").text()).toContain("Ticked by default");
    expect(open.find("article").attributes("aria-disabled")).toBeUndefined();
  });

  describe("filtering many branches", () => {
    const route = (n: number, title: string, kind: string, gateObjective?: string) => ({
      ...outgoing[1]!, edge_id: `e${n}`, beat_id: `b${n}`, beat_title: title, beat_kind: kind,
      gate: gateObjective
        ? { mode: "all" as const, is_open: true, conditions: [{ objective_id: "o9", objective: gateObjective, statuses: ["complete" as const], current_status: "complete" as const, met: true }] }
        : null,
    });
    const many = [
      route(1, "Bridge", "explore"), route(2, "Tunnel", "combat"), route(3, "Harbour", "social"),
      route(4, "Rooftops", "explore"), route(5, "Vault", "explore", "Find the ledger"),
    ];

    it("offers the filter only past four branches", () => {
      expect(mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: many.slice(0, 4) } }).find('input[placeholder="Filter branches…"]').exists()).toBe(false);
      expect(mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: many } }).find('input[placeholder="Filter branches…"]').exists()).toBe(true);
    });

    it.each([
      ["a title, ignoring case and surrounding spaces", "  HARBOUR ", ["Harbour"]],
      ["a beat kind", "combat", ["Tunnel"]],
      ["the objective its gate waits on", "ledger", ["Vault"]],
    ])("matches %s", async (_name, query, expected) => {
      const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: many } });
      await wrapper.get('input[placeholder="Filter branches…"]').setValue(query);
      const shown = wrapper.findAll("article").filter((a) => a.findAll("button").some((b) => b.text() === "Choose")).map((a) => a.text());
      expect(shown).toHaveLength(expected.length);
      for (const title of expected) expect(shown.some((t) => t.includes(title))).toBe(true);
    });
  });

  it("Choose is disabled while the table is paused or when the strip is disabled", () => {
    const choose = (props: Record<string, unknown>) => mount(QuestRunOutcomeStrip, { props: { outgoing: outgoing.slice(1), status: "running", ...props } })
      .findAll("button").find((b) => b.text() === "Choose")!;
    expect(choose({}).attributes("disabled")).toBeUndefined();
    expect(choose({ status: "paused" }).attributes("disabled")).toBeDefined();
    expect(choose({ disabled: true }).attributes("disabled")).toBeDefined();
  });

  it("a closed route states what it still needs once, not twice", () => {
    const wrapper = mount(QuestRunOutcomeStrip, { props: { status: "running", outgoing: [{ ...outgoing[1]!, gate: closedGate }] } });
    expect(wrapper.text().match(/Clear the checkpoint/g)).toHaveLength(1);
  });
});
