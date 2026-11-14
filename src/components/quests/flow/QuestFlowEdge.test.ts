import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuestFlowEdge from "./QuestFlowEdge.vue";
import type { QuestFlowEdgeData } from "@/lib/quests/flow";

// VueFlow's edge parts need a flow instance; the pill is plain markup, so they are stubbed to pass it through.
vi.mock("@vue-flow/core", () => ({
  BaseEdge: { template: "<i />" },
  EdgeLabelRenderer: { template: "<div><slot /></div>" },
  getSmoothStepPath: () => ["M0,0", 10, 10],
}));

function pill(data: Partial<QuestFlowEdgeData>) {
  const wrapper = mount(QuestFlowEdge, {
    props: { id: "e1", sourceX: 0, sourceY: 0, targetX: 10, targetY: 10, sourcePosition: "right" as never, targetPosition: "left" as never, data: { routeKind: "choice", targetTitle: "The gate", ...data } as QuestFlowEdgeData },
  });
  return wrapper;
}

describe("QuestFlowEdge", () => {
  // Fails if the pill goes back to a "choice · " prefix.
  it("a choice route's pill is just its label, falling back to the target's title", () => {
    expect(pill({ threadLabel: "Bribe the guard" }).get(".quest-flow-edge-label").text()).toBe("Bribe the guard");
    expect(pill({ threadLabel: null }).get(".quest-flow-edge-label").text()).toBe("The gate");
  });

  // Fails if the "parallel · opens" prefix returns, or the and-also look (layers glyph, double rail) is lost.
  it("a parallel route is its label too, still drawn with the layers glyph and the double rail", () => {
    const wrapper = pill({ routeKind: "parallel", threadLabel: "The wolves" });
    expect(wrapper.get(".quest-flow-edge-label").text()).toBe("The wolves");
    expect(wrapper.find(".quest-flow-edge-label svg").exists()).toBe(true);
    expect(wrapper.find(".quest-flow-edge-rail").exists()).toBe(true);
  });

  // Fails if clicking a route's pill does nothing: the pill is drawn outside the edge, so the line's click never reaches it.
  it("selects its route when the pill is clicked", async () => {
    const wrapper = pill({ threadLabel: "Bribe the guard" });
    await wrapper.get(".quest-flow-edge-label").trigger("click");
    expect(wrapper.emitted("select")).toEqual([["e1"]]);
  });

  // Fails if a selected route's pill looks like every other: the selection must read on the flow.
  it("marks the selected route's pill", () => {
    expect(pill({ selected: true }).get(".quest-flow-edge-label").classes()).toContain("is-selected");
    expect(pill({}).get(".quest-flow-edge-label").classes()).not.toContain("is-selected");
  });
});
