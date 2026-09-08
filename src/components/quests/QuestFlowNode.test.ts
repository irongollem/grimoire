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
    expect(node.attributes("aria-label")).toContain("party is here");
    expect(node.text()).toContain("Party is here");
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
          prepGaps: [
            { kind: "guidance", label: "Add DM guidance" },
            { kind: "attachment", label: "Replace missing handout" },
          ],
          handoutCount: 1,
          loot: { total: 3, undispatched: 2, unclaimed: 1 },
          isReady: false,
          isCurrent: false,
          isVisited: true,
          isDisconnected: true,
          reach: "visited",
          currentThreadIds: [],
          payoffCount: 0, unlocksQuest: false, convergeLabel: null, site: null,
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

  it("recedes a beat the run has walked past, and says why", () => {
    const wrapper = mount(QuestFlowNode, {
      props: {
        title: "The bribe nobody took",
        kind: "social",
        visibility: "hidden",
        presentation: {
          prepGapCount: 0, prepGaps: [], handoutCount: 0,
          loot: { total: 0, undispatched: 0, unclaimed: 0 },
          isReady: true, isCurrent: false, isVisited: false, isDisconnected: false,
          reach: "stranded",
          currentThreadIds: [],
          payoffCount: 0, unlocksQuest: false, convergeLabel: null, site: null,
        },
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.get("article").classes()).toContain("is-stranded");
    expect(wrapper.text()).toContain("Cut off");
    expect(wrapper.get("button.quest-flow-node__main").attributes("aria-label"))
      .toContain("no longer reachable from the current beat");
  });

  it("leaves an ordinary unplayed beat unlabelled", () => {
    const wrapper = mount(QuestFlowNode, {
      props: {
        title: "Still to come",
        kind: "explore",
        visibility: "hidden",
        presentation: {
          prepGapCount: 0, prepGaps: [], handoutCount: 0,
          loot: { total: 0, undispatched: 0, unclaimed: 0 },
          isReady: true, isCurrent: false, isVisited: false, isDisconnected: false,
          reach: "ahead",
          currentThreadIds: [],
          payoffCount: 0, unlocksQuest: false, convergeLabel: null, site: null,
        },
      },
      global: { stubs: { Handle: true } },
    });

    expect(wrapper.text()).not.toContain("Cut off");
    expect(wrapper.text()).not.toContain("Visited");
    expect(wrapper.get("article").classes()).not.toContain("is-stranded");
  });

  it("draws a kind · visibility eyebrow, and the payoff/converge/site/unlock facts", () => {
    const wrapper = mount(QuestFlowNode, {
      props: {
        title: "Descend the Drowned Vault",
        kind: "explore",
        visibility: "hidden",
        gated: false,
        presentation: {
          prepGapCount: 0, prepGaps: [], handoutCount: 0,
          loot: { total: 0, undispatched: 0, unclaimed: 0 },
          isReady: true, isCurrent: false, isVisited: false, isDisconnected: false,
          reach: "ahead", currentThreadIds: [],
          payoffCount: 2, unlocksQuest: true, convergeLabel: "all",
          site: { name: "The Drowned Vault", roomCount: 6, emptyRoomLabel: "rooms 4–6 empty" },
        },
      },
      global: { stubs: { Handle: true } },
    });
    expect(wrapper.text()).toContain("Explore · hidden");
    expect(wrapper.text()).toContain("2 payoffs");
    expect(wrapper.text()).toContain("converge · all");
    expect(wrapper.text()).toContain("site · 6 rooms");
    expect(wrapper.text()).toContain("rooms 4–6 empty");
    expect(wrapper.text()).toContain("unlocks a quest");
    expect(wrapper.text()).not.toContain("Ready");
  });

  it("draws one party chip per thread standing on the beat, and a dashed border when a route in is gated", () => {
    const threads = [
      { id: "main", status: "live" as const, created_at: "2026-09-01T00:00:00Z", label: "The petition" },
      { id: "vault", status: "live" as const, created_at: "2026-09-03T00:00:00Z", label: "The Drowned Vault" },
    ];
    const wrapper = mount(QuestFlowNode, {
      props: {
        title: "Testify before the Guild", kind: "social", visibility: "hidden", gated: true, threads,
        presentation: {
          prepGapCount: 0, prepGaps: [], handoutCount: 0,
          loot: { total: 0, undispatched: 0, unclaimed: 0 },
          isReady: true, isCurrent: true, isVisited: false, isDisconnected: false,
          reach: "current", currentThreadIds: ["main", "vault"],
          payoffCount: 0, unlocksQuest: false, convergeLabel: null, site: null,
        },
      },
      global: { stubs: { Handle: true } },
    });
    expect(wrapper.text()).toContain("Party is here · A");
    expect(wrapper.text()).toContain("Party is here · B");
    expect(wrapper.get("article").classes()).toContain("is-gated");
    expect(wrapper.get("article").classes()).toContain("is-current");
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
